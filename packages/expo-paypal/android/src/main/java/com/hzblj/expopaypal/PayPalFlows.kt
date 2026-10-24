package com.hzblj.expopaypal

import android.app.Activity
import android.content.Context
import android.content.Intent
import com.paypal.android.cardpayments.CardApproveOrderResult
import com.paypal.android.cardpayments.CardClient
import com.paypal.android.cardpayments.CardFinishApproveOrderResult
import com.paypal.android.cardpayments.CardFinishVaultResult
import com.paypal.android.cardpayments.CardPresentAuthChallengeResult
import com.paypal.android.cardpayments.CardRequest
import com.paypal.android.cardpayments.CardVaultRequest
import com.paypal.android.cardpayments.CardVaultResult
import com.paypal.android.cardpayments.threedsecure.SCA
import com.paypal.android.corepayments.PayPalSDKError
import com.paypal.android.corepayments.model.TokenType
import com.paypal.android.fraudprotection.PayPalDataCollector
import com.paypal.android.fraudprotection.PayPalDataCollectorRequest
import com.paypal.android.paypalpayments.PayPalClient
import com.paypal.android.paypalpayments.PayPalFinishStartResult
import com.paypal.android.paypalpayments.PayPalFinishVaultResult
import com.paypal.android.paypalpayments.PayPalPresentAuthChallengeResult
import com.paypal.android.paypalpayments.PayPalUserAction
import com.paypal.android.paypalpayments.ReturnToAppUrlConfig
import expo.modules.kotlin.Promise

/**
 * Runs the PayPal SDK's flows, one at a time, and keeps what outlives a single call: a client per account (the return
 * has to reach the client that started the flow), the flow in progress, and the ledger that finishes a return after
 * the system ended the app. Main thread only: the module runs its functions and lifecycle hooks there, and the SDK
 * calls back there.
 */
class PayPalFlows(
  private val context: () -> Context?,
  private val currentActivity: () -> Activity?,
  store: PendingFlowStore
) {
  private val slot = FlowSlot<Intent>()
  private val ledger = PendingFlowLedger(store)
  private val payPalClients = mutableMapOf<String, PayPalClient>()
  private val cardClients = mutableMapOf<String, CardClient>()

  /** The client of the flow in the slot, which finishes its return. */
  private var runningClient: Any? = null
  private var restored: Map<String, Any?>? = null

  // region PayPal

  fun prepareSession(config: ConfigRecord, flow: String, buyer: BuyerRecord?, userAction: String) {
    // A session for a second flow would replace the running one's; the flow call that follows reports IN_PROGRESS.
    if (slot.active != null) {
      return
    }
    val client = payPalClient(config) ?: return

    client.createPayPalSession(
      tokenType = if (flow == "vault") TokenType.VAULT_ID else TokenType.ORDER_ID,
      userIdentity = buyer?.userIdentity,
      // The Android SDK takes the fallback as a bare scheme, despite its name.
      urlConfig = ReturnToAppUrlConfig(config.returnUrl, config.cancelUrl, config.scheme),
      userAction = when (userAction) {
        "payNow" -> PayPalUserAction.PAY_NOW
        "setupNow" -> PayPalUserAction.SETUP_NOW
        else -> PayPalUserAction.CONTINUE
      }
    )
  }

  fun checkout(config: ConfigRecord, orderId: String, promise: Promise) {
    val activity = currentActivity() ?: return promise.resolve(noActivity())
    val client = payPalClient(config) ?: return promise.resolve(noActivity())
    val token = begin("checkout", orderId, client, promise) ?: return

    client.start(activity, orderId) { result ->
      when (result) {
        is PayPalPresentAuthChallengeResult.Success -> launched(token, config, client.instanceState, activity)
        is PayPalPresentAuthChallengeResult.Failure -> finish(token, failed(result.error))
      }
    }
  }

  fun vault(config: ConfigRecord, setupTokenId: String, promise: Promise) {
    val activity = currentActivity() ?: return promise.resolve(noActivity())
    val client = payPalClient(config) ?: return promise.resolve(noActivity())
    val token = begin("vault", setupTokenId, client, promise) ?: return

    client.vault(activity, setupTokenId) { result ->
      when (result) {
        is PayPalPresentAuthChallengeResult.Success -> launched(token, config, client.instanceState, activity)
        is PayPalPresentAuthChallengeResult.Failure -> finish(token, failed(result.error))
      }
    }
  }

  // endregion

  // region Cards

  fun checkoutWithCard(config: ConfigRecord, orderId: String, card: CardRecord, threeDSecure: String, promise: Promise) {
    val client = cardClient(config) ?: return promise.resolve(noActivity())
    val token = begin("checkoutWithCard", orderId, client, promise) ?: return
    val sca = if (threeDSecure == "always") SCA.SCA_ALWAYS else SCA.SCA_WHEN_REQUIRED
    val request = CardRequest(orderId, card.card, config.links.cardReturnUrl, sca)

    client.approveOrder(request) { result ->
      when (result) {
        is CardApproveOrderResult.Success -> finish(
          token,
          approved(
            "orderId" to result.orderId,
            "orderStatus" to result.status,
            "threeDSecureAttempted" to result.didAttemptThreeDSecureAuthentication
          )
        )
        is CardApproveOrderResult.AuthorizationRequired -> {
          val activity = currentActivity() ?: return@approveOrder finish(token, noActivity())

          when (val presented = client.presentAuthChallenge(activity, result.authChallenge)) {
            is CardPresentAuthChallengeResult.Success -> launched(token, config, client.instanceState, activity)
            is CardPresentAuthChallengeResult.Failure -> finish(token, failed(presented.error))
          }
        }
        is CardApproveOrderResult.Failure -> finish(token, failed(result.error))
      }
    }
  }

  fun vaultCard(config: ConfigRecord, setupTokenId: String, card: CardRecord, promise: Promise) {
    val client = cardClient(config) ?: return promise.resolve(noActivity())
    val token = begin("vaultCard", setupTokenId, client, promise) ?: return
    val request = CardVaultRequest(setupTokenId, card.card, config.links.cardReturnUrl)

    client.vault(request) { result ->
      when (result) {
        is CardVaultResult.Success -> finish(
          token,
          approved(
            "setupTokenStatus" to result.status,
            "threeDSecureAttempted" to result.didAttemptThreeDSecureAuthentication
          )
        )
        is CardVaultResult.AuthorizationRequired -> {
          val activity = currentActivity() ?: return@vault finish(token, noActivity())

          when (val presented = client.presentAuthChallenge(activity, result.authChallenge)) {
            is CardPresentAuthChallengeResult.Success -> launched(token, config, client.instanceState, activity)
            is CardPresentAuthChallengeResult.Failure -> finish(token, failed(presented.error))
          }
        }
        is CardVaultResult.Failure -> finish(token, failed(result.error))
      }
    }
  }

  // endregion

  // region Device data and restoration

  fun collectDeviceData(config: ConfigRecord, hasUserLocationConsent: Boolean, additionalData: Map<String, String>): String {
    val context = context() ?: return ""
    val request = PayPalDataCollectorRequest(hasUserLocationConsent, null, additionalData)

    return PayPalDataCollector(config.account.coreConfig).collectDeviceData(context, request)
  }

  fun takeRestoredResult(): Map<String, Any?>? {
    restore(currentActivity()?.intent)
    return restored.also { restored = null }
  }

  // endregion

  // region The activity

  /** The default single-task activity gets the return here. */
  fun onNewIntent(intent: Intent) {
    val active = slot.active ?: return restore(intent)

    if (active.launched) {
      outcome(active.flow, active.id, runningClient, intent)?.let { finish(active.token, it) }
    }
  }

  /**
   * Covers every other launch mode, and the buyer who came back without a return: closed the browser tab, or
   * switched back from the PayPal app. For the single-task activity this runs after [onNewIntent] already finished
   * the flow.
   */
  fun onResume() {
    val active = slot.active ?: return restore(currentActivity()?.intent)

    if (!active.launched) {
      return
    }
    val candidate = slot.returnCandidate(currentActivity()?.intent)
    val outcome = candidate?.let { outcome(active.flow, active.id, runningClient, it) }

    finish(active.token, outcome ?: canceled())
  }

  /**
   * A return that arrived after the system ended the app: the ledger's flow, finished by a client restored from its
   * instance state. Kept for `takeRestoredResult()`.
   */
  private fun restore(intent: Intent?) {
    val pending = ledger.pending ?: return
    val url = intent?.dataString ?: return

    if (slot.active != null || !pending.links.matches(url)) {
      return
    }
    val context = context() ?: return
    val client: Any = when (pending.flow) {
      "checkout", "vault" -> PayPalClient(context, pending.account.coreConfig).apply { restore(pending.instanceState) }
      else -> CardClient(context, pending.account.coreConfig).apply { restore(pending.instanceState) }
    }
    val outcome = outcome(pending.flow, pending.id, client, intent) ?: return

    ledger.clear()
    restored = mapOf("flow" to pending.flow, "id" to pending.id, "outcome" to outcome)
  }

  /** What the SDK reads from [intent] for [flow], or `null` when the intent is not its return. */
  private fun outcome(flow: String, id: String, client: Any?, intent: Intent): Map<String, Any?>? = when (flow) {
    "checkout" -> when (val result = (client as? PayPalClient)?.finishStart(intent)) {
      is PayPalFinishStartResult.Success -> approved("orderId" to (result.orderId ?: id), "payerId" to result.payerId)
      is PayPalFinishStartResult.Canceled -> canceled()
      is PayPalFinishStartResult.Failure -> failed(result.error)
      else -> null
    }
    "vault" -> when (val result = (client as? PayPalClient)?.finishVault(intent)) {
      is PayPalFinishVaultResult.Success -> approved("approvalSessionId" to result.approvalSessionId)
      is PayPalFinishVaultResult.Canceled -> canceled()
      is PayPalFinishVaultResult.Failure -> failed(result.error)
      else -> null
    }
    "checkoutWithCard" -> when (val result = (client as? CardClient)?.finishApproveOrder(intent)) {
      is CardFinishApproveOrderResult.Success -> approved(
        "orderId" to result.orderId,
        "orderStatus" to result.status,
        "threeDSecureAttempted" to result.didAttemptThreeDSecureAuthentication
      )
      is CardFinishApproveOrderResult.Canceled -> canceled()
      is CardFinishApproveOrderResult.Failure -> failed(result.error)
      else -> null
    }
    "vaultCard" -> when (val result = (client as? CardClient)?.finishVault(intent)) {
      is CardFinishVaultResult.Success -> approved(
        "setupTokenStatus" to result.status,
        "threeDSecureAttempted" to result.didAttemptThreeDSecureAuthentication
      )
      is CardFinishVaultResult.Canceled -> canceled()
      is CardFinishVaultResult.Failure -> failed(result.error)
      else -> null
    }
    else -> null
  }

  // endregion

  // region Bookkeeping

  /** Takes the flow slot, or answers `IN_PROGRESS` and returns `null`. */
  private fun begin(flow: String, id: String, client: Any, promise: Promise): Int? {
    val running = slot.active?.flow
    val token = slot.begin(flow, id) { promise.resolve(it) }

    if (token == null) {
      promise.resolve(failed("PayPal is still running $running. Flows run one at a time.", "IN_PROGRESS"))
      return null
    }
    runningClient = client
    return token
  }

  /** The browser or the PayPal app opened: write the flow down, in case the system ends the app meanwhile. */
  private fun launched(token: Int, config: ConfigRecord, instanceState: String, activity: Activity) {
    val active = slot.active?.takeIf { it.token == token } ?: return

    slot.launched(token, activity.intent)
    ledger.record(PendingFlow(active.flow, active.id, config.account, config.links, instanceState))
  }

  private fun finish(token: Int, outcome: Map<String, Any?>) {
    if (slot.finish(token, outcome)) {
      runningClient = null
      ledger.clear()
    }
  }

  private fun payPalClient(config: ConfigRecord): PayPalClient? {
    val context = context() ?: return null
    return payPalClients.getOrPut(config.account.key) { PayPalClient(context, config.account.coreConfig) }
  }

  private fun cardClient(config: ConfigRecord): CardClient? {
    val context = context() ?: return null
    return cardClients.getOrPut(config.account.key) { CardClient(context, config.account.coreConfig) }
  }

  // endregion

  companion object {
    fun approved(vararg fields: Pair<String, Any?>): Map<String, Any?> = mapOf("status" to "approved", *fields)

    fun canceled(): Map<String, Any?> = mapOf("status" to "canceled")

    fun failed(error: PayPalSDKError): Map<String, Any?> = mapOf(
      "status" to "failed",
      "message" to (error.errorDescription.ifEmpty { error.message ?: "PayPal failed." }),
      "nativeCode" to error.code,
      "correlationId" to error.correlationId
    )

    fun failed(message: String, code: String? = null): Map<String, Any?> =
      mapOf("status" to "failed", "message" to message, "code" to code)

    private fun noActivity() = failed("PayPal needs a running activity to start from, and there is none.")
  }
}

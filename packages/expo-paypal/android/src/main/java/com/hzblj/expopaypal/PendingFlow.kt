package com.hzblj.expopaypal

import org.json.JSONObject

/**
 * A flow on its way to PayPal, written down so its return can still be finished if the system ends the app meanwhile:
 * the account it ran with and the SDK client's instance state, which `restore()` takes back.
 */
data class PendingFlow(
  /** `checkout`, `vault`, `checkoutWithCard` or `vaultCard`. */
  val flow: String,
  /** The order or setup token the flow was started with. */
  val id: String,
  val account: Account,
  val links: ReturnLinks,
  val instanceState: String
) {
  data class Account(
    val clientId: String,
    val merchantId: String,
    val environment: String,
    val bnCode: String?
  )

  fun toJson(): String = JSONObject()
    .put("flow", flow)
    .put("id", id)
    .put("clientId", account.clientId)
    .put("merchantId", account.merchantId)
    .put("environment", account.environment)
    .put("bnCode", account.bnCode ?: JSONObject.NULL)
    .put("scheme", links.scheme)
    .put("successUrl", links.successUrl)
    .put("cancelUrl", links.cancelUrl)
    .put("instanceState", instanceState)
    .toString()

  companion object {
    /** `null` for anything unreadable: a ledger written by another version is dropped, not trusted. */
    fun fromJson(json: String?): PendingFlow? {
      if (json.isNullOrEmpty()) {
        return null
      }
      return try {
        val obj = JSONObject(json)
        PendingFlow(
          flow = obj.getString("flow"),
          id = obj.getString("id"),
          account = Account(
            clientId = obj.getString("clientId"),
            merchantId = obj.getString("merchantId"),
            environment = obj.getString("environment"),
            bnCode = if (obj.isNull("bnCode")) null else obj.getString("bnCode")
          ),
          links = ReturnLinks(
            scheme = obj.getString("scheme"),
            successUrl = obj.getString("successUrl"),
            cancelUrl = obj.getString("cancelUrl")
          ),
          instanceState = obj.getString("instanceState")
        )
      } catch (_: Exception) {
        null
      }
    }
  }
}

/** Where the ledger keeps its one entry: SharedPreferences in the app, a field in the tests. */
interface PendingFlowStore {
  fun read(): String?
  fun write(json: String?)
}

class PendingFlowLedger(private val store: PendingFlowStore) {
  val pending: PendingFlow?
    get() = PendingFlow.fromJson(store.read())

  fun record(flow: PendingFlow) = store.write(flow.toJson())

  fun clear() = store.write(null)
}

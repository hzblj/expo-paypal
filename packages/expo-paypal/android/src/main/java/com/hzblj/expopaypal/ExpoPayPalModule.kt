package com.hzblj.expopaypal

import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoPayPalModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())

  private val flows by lazy {
    PayPalFlows(
      context = { appContext.reactContext?.applicationContext },
      currentActivity = { appContext.currentActivity },
      store = SharedPreferencesPendingFlowStore { appContext.reactContext?.applicationContext }
    )
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoPayPal")

    Constant("links") { manifestLinks() }

    // Synchronous for JavaScript, so the session starts before the app's server call; posted to the main thread
    // ahead of the flow call that follows it.
    Function("preparePayPalSession") { config: ConfigRecord, flow: String, buyer: BuyerRecord?, userAction: String ->
      mainHandler.post { flows.prepareSession(config, flow, buyer, userAction) }
      Unit
    }

    AsyncFunction("checkout") { config: ConfigRecord, orderId: String, promise: Promise ->
      flows.checkout(config, orderId, promise)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("vault") { config: ConfigRecord, setupTokenId: String, promise: Promise ->
      flows.vault(config, setupTokenId, promise)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("checkoutWithCard") {
      config: ConfigRecord, orderId: String, card: CardRecord, threeDSecure: String, promise: Promise ->
      flows.checkoutWithCard(config, orderId, card, threeDSecure, promise)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("vaultCard") { config: ConfigRecord, setupTokenId: String, card: CardRecord, promise: Promise ->
      flows.vaultCard(config, setupTokenId, card, promise)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("collectDeviceData") {
      config: ConfigRecord, hasUserLocationConsent: Boolean, additionalData: Map<String, String> ->
      flows.collectDeviceData(config, hasUserLocationConsent, additionalData)
    }

    AsyncFunction("takeRestoredResult") { ->
      flows.takeRestoredResult()
    }.runOnQueue(Queues.MAIN)

    // A return that relaunched the app after the system ended it is the launch intent, which arrives before this
    // module exists: look at it once the runtime is up.
    OnCreate {
      mainHandler.post { flows.onResume() }
    }

    OnNewIntent { intent ->
      flows.onNewIntent(intent)
    }

    OnActivityEntersForeground {
      flows.onResume()
    }

    View(PayPalButtonView::class) {
      Events("onButtonPress")

      Prop("kind") { view: PayPalButtonView, value: String -> view.kind = value }
      Prop("color") { view: PayPalButtonView, value: String -> view.color = value }
      Prop("label") { view: PayPalButtonView, value: String? -> view.label = value }
      Prop("shape") { view: PayPalButtonView, value: String -> view.shape = value }
      Prop("cornerRadius") { view: PayPalButtonView, value: Double? -> view.cornerRadius = value }
      Prop("size") { view: PayPalButtonView, value: String -> view.size = value }
      Prop("disabled") { view: PayPalButtonView, value: Boolean? -> view.disabled = value ?: false }

      OnViewDidUpdateProps { view: PayPalButtonView ->
        view.update()
      }
    }
  }

  /** What the config plugin wrote into the manifest's `<meta-data>`. */
  private fun manifestLinks(): Map<String, String?> {
    val context = appContext.reactContext ?: return emptyMap()
    val metaData = try {
      context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA).metaData
    } catch (_: PackageManager.NameNotFoundException) {
      null
    }
    return mapOf(
      "returnUrl" to metaData?.getString(META_DATA_RETURN_URL),
      "scheme" to metaData?.getString(META_DATA_SCHEME)
    )
  }

  private companion object {
    const val META_DATA_RETURN_URL = "com.hzblj.expopaypal.RETURN_URL"
    const val META_DATA_SCHEME = "com.hzblj.expopaypal.SCHEME"
  }
}

/** The ledger's one entry, in the module's own preferences. */
private class SharedPreferencesPendingFlowStore(private val context: () -> Context?) : PendingFlowStore {
  private val preferences
    get() = context()?.getSharedPreferences("com.hzblj.expopaypal", Context.MODE_PRIVATE)

  override fun read(): String? = preferences?.getString(KEY, null)

  override fun write(json: String?) {
    preferences?.edit()?.apply { if (json == null) remove(KEY) else putString(KEY, json) }?.apply()
  }

  private companion object {
    const val KEY = "pendingFlow"
  }
}

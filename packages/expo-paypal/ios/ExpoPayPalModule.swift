import ExpoModulesCore

public class ExpoPayPalModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoPayPal")

    Constants {
      ["links": PayPalFlows.shared.linksConstant]
    }

    // Synchronous for JavaScript, so the session starts before the app's server call; queued on the main thread ahead
    // of the flow call that follows it.
    Function("preparePayPalSession") { (config: ConfigRecord, flow: String, buyer: BuyerRecord?, userAction: String) in
      DispatchQueue.main.async {
        PayPalFlows.shared.prepareSession(config: config, flow: flow, buyer: buyer, userAction: userAction)
      }
    }

    AsyncFunction("checkout") { (config: ConfigRecord, orderId: String, promise: Promise) in
      PayPalFlows.shared.checkout(config: config, orderId: orderId, promise: promise)
    }.runOnQueue(.main)

    AsyncFunction("vault") { (config: ConfigRecord, setupTokenId: String, promise: Promise) in
      PayPalFlows.shared.vault(config: config, setupTokenId: setupTokenId, promise: promise)
    }.runOnQueue(.main)

    AsyncFunction("checkoutWithCard") {
      (config: ConfigRecord, orderId: String, card: CardRecord, threeDSecure: String, promise: Promise) in
      PayPalFlows.shared.checkoutWithCard(
        config: config, orderId: orderId, card: card, threeDSecure: threeDSecure, promise: promise
      )
    }.runOnQueue(.main)

    AsyncFunction("vaultCard") { (config: ConfigRecord, setupTokenId: String, card: CardRecord, promise: Promise) in
      PayPalFlows.shared.vaultCard(config: config, setupTokenId: setupTokenId, card: card, promise: promise)
    }.runOnQueue(.main)

    // iOS has no location consent to pass: Magnes decides from the app's own location permission.
    AsyncFunction("collectDeviceData") {
      (config: ConfigRecord, _: Bool, additionalData: [String: String]) -> String in
      PayPalFlows.shared.collectDeviceData(config: config, additionalData: additionalData)
    }

    AsyncFunction("takeRestoredResult") { () -> [String: Any]? in
      PayPalFlows.shared.takeRestoredResult()
    }.runOnQueue(.main)

    View(PayPalButtonView.self) {
      Events("onButtonPress")

      Prop("kind") { (view: PayPalButtonView, value: String) in
        view.kind = value
      }
      Prop("color") { (view: PayPalButtonView, value: String) in
        view.color = value
      }
      Prop("label") { (view: PayPalButtonView, value: String?) in
        view.label = value
      }
      Prop("shape") { (view: PayPalButtonView, value: String) in
        view.shape = value
      }
      Prop("cornerRadius") { (view: PayPalButtonView, value: Double?) in
        view.cornerRadius = value
      }
      Prop("size") { (view: PayPalButtonView, value: String) in
        view.size = value
      }
      Prop("disabled") { (view: PayPalButtonView, value: Bool?) in
        view.disabled = value ?? false
      }

      OnViewDidUpdateProps { (view: PayPalButtonView) in
        view.update()
      }
    }
  }
}

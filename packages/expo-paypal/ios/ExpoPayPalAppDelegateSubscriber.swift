import ExpoModulesCore

/**
 PayPal's returns come to the app delegate as URLs: a custom scheme, or a Universal Link when App Switch brings the
 buyer back from the PayPal app. They go to the SDK, including at a cold launch, before any JavaScript runs. The app's
 lifecycle tells the flow when a buyer came back from the PayPal app by hand.
 */
public class ExpoPayPalAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    PayPalFlows.shared.handle(url: url)
  }

  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    guard userActivity.activityType == NSUserActivityTypeBrowsingWeb, let url = userActivity.webpageURL else {
      return false
    }
    return PayPalFlows.shared.handle(url: url)
  }

  public func applicationDidEnterBackground(_ application: UIApplication) {
    PayPalFlows.shared.appEnteredBackground()
  }

  public func applicationDidBecomeActive(_ application: UIApplication) {
    PayPalFlows.shared.appBecameActive()
  }
}

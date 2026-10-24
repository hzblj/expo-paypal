import ExpoModulesCore
import PayPal
import UIKit

/**
 Runs the PayPal SDK's flows, one at a time, and keeps what outlives a single call: a client per account (the return
 has to reach the client that started the flow), the flow in progress, and the ledger that lets a return be read after
 the system ended the app. Main thread only: the module runs its functions there, and the app delegate calls in there.
 */
final class PayPalFlows {
  static let shared = PayPalFlows()

  private struct ActiveFlow {
    let token: Int
    let flow: String
    let links: PayPalReturnLinks
    /// The PayPal client that routes return links; `nil` for card flows, whose 3D Secure stays in the app.
    let client: PayPalClient?
    let settle: ([String: Any]) -> Void
  }

  private var payPalClients: [String: PayPalClient] = [:]
  private var cardClients: [String: CardClient] = [:]
  private var active: ActiveFlow?
  private var nextToken = 0
  private var restored: [String: Any]?
  /// The controller on top when the flow started: anything presented over it later is the flow's own browser.
  private weak var topControllerAtStart: UIViewController?
  private let ledger = PendingFlowLedger(store: UserDefaultsPendingFlowStore())
  private lazy var watcher: ReturnWatcher = {
    let watcher = ReturnWatcher(grace: 1) { delay, work in
      DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }
    watcher.onAbandon = { [weak self] in
      guard let self, let active = self.active else {
        return
      }
      self.finish(active.token, ["status": "canceled"])
    }
    return watcher
  }()

  /// The links the config plugin wrote, for returns that arrive with no flow to take them.
  private lazy var plistLinks: PayPalReturnLinks? = {
    guard let links = Bundle.main.object(forInfoDictionaryKey: "ExpoPayPal") as? [String: String],
      let scheme = links["Scheme"]
    else {
      return nil
    }
    return PayPalReturnLinks(scheme: scheme, base: links["ReturnURL"])
  }()

  var linksConstant: [String: Any?] {
    let links = Bundle.main.object(forInfoDictionaryKey: "ExpoPayPal") as? [String: String]
    return ["returnUrl": links?["ReturnURL"], "scheme": links?["Scheme"]]
  }

  // MARK: - PayPal

  func prepareSession(config: ConfigRecord, flow: String, buyer: BuyerRecord?, userAction: String) {
    // A session for a second flow would replace the running one's; the flow call that follows reports IN_PROGRESS.
    guard active == nil, let urls = config.links.sessionURLs else {
      return
    }
    payPalClient(for: config).createPayPalSession(
      sessionType: flow == "vault" ? .vaultWithoutPurchase : .checkout,
      userIdentity: buyer?.userIdentity,
      urlConfig: PayPalURLConfig(returnAppURL: urls.returnURL, cancelAppURL: urls.cancelURL, fallbackSchemeURL: urls.fallbackURL),
      userAction: Self.userAction(userAction)
    )
  }

  func checkout(config: ConfigRecord, orderId: String, promise: Promise) {
    guard config.links.sessionURLs != nil else {
      return promise.resolve(Self.failed("The PayPal return links are not valid URLs.", code: "INVALID_ARGUMENT"))
    }
    let client = payPalClient(for: config)

    guard let token = begin(flow: "checkout", id: orderId, links: config.links, client: client, promise: promise) else {
      return
    }
    client.start(orderID: orderId) { [weak self] result in
      switch result {
      case .success(let checkout):
        self?.finish(token, ["status": "approved", "orderId": checkout.orderID, "payerId": checkout.payerID])
      case .failure(let error):
        self?.finish(token, PayPalError.isCheckoutCanceled(error) ? ["status": "canceled"] : Self.failed(error))
      }
    }
  }

  func vault(config: ConfigRecord, setupTokenId: String, promise: Promise) {
    guard config.links.sessionURLs != nil else {
      return promise.resolve(Self.failed("The PayPal return links are not valid URLs.", code: "INVALID_ARGUMENT"))
    }
    let client = payPalClient(for: config)

    guard let token = begin(flow: "vault", id: setupTokenId, links: config.links, client: client, promise: promise) else {
      return
    }
    client.vault(setupTokenID: setupTokenId) { [weak self] result in
      switch result {
      case .success(let vault):
        self?.finish(token, ["status": "approved", "approvalSessionId": vault.approvalSessionID])
      case .failure(let error):
        self?.finish(token, PayPalError.isVaultCanceled(error) ? ["status": "canceled"] : Self.failed(error))
      }
    }
  }

  // MARK: - Cards

  func checkoutWithCard(config: ConfigRecord, orderId: String, card: CardRecord, threeDSecure: String, promise: Promise) {
    guard let token = begin(flow: "checkoutWithCard", id: orderId, links: config.links, client: nil, promise: promise) else {
      return
    }
    let request = CardRequest(orderID: orderId, card: card.card, sca: threeDSecure == "always" ? .scaAlways : .scaWhenRequired)

    cardClient(for: config).approveOrder(request: request) { [weak self] result in
      switch result {
      case .success(let approval):
        var outcome: [String: Any] = [
          "status": "approved",
          "orderId": approval.orderID,
          "threeDSecureAttempted": approval.didAttemptThreeDSecureAuthentication,
        ]
        outcome["orderStatus"] = approval.status
        self?.finish(token, outcome)
      case .failure(let error):
        self?.finish(token, CardError.isThreeDSecureCanceled(error) ? ["status": "canceled"] : Self.failed(error))
      }
    }
  }

  func vaultCard(config: ConfigRecord, setupTokenId: String, card: CardRecord, promise: Promise) {
    guard let token = begin(flow: "vaultCard", id: setupTokenId, links: config.links, client: nil, promise: promise) else {
      return
    }
    let request = CardVaultRequest(card: card.card, setupTokenID: setupTokenId)

    cardClient(for: config).vault(request) { [weak self] result in
      switch result {
      case .success(let vault):
        var outcome: [String: Any] = [
          "status": "approved",
          "threeDSecureAttempted": vault.didAttemptThreeDSecureAuthentication,
        ]
        outcome["setupTokenStatus"] = vault.status
        self?.finish(token, outcome)
      case .failure(let error):
        self?.finish(token, CardError.isThreeDSecureCanceled(error) ? ["status": "canceled"] : Self.failed(error))
      }
    }
  }

  // MARK: - Device data and restoration

  func collectDeviceData(config: ConfigRecord, additionalData: [String: String]) -> String {
    let payload = PayPalDataCollector(config: config.coreConfig).collectDeviceData(additionalData: additionalData)

    // iOS hands back `{"correlation_id":"…"}`, Android the ID alone; both platforms return the ID.
    guard let data = payload.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let id = object["correlation_id"] as? String
    else {
      return payload
    }
    return id
  }

  func takeRestoredResult() -> [String: Any]? {
    defer { restored = nil }
    return restored
  }

  // MARK: - The app delegate

  /// A URL the app was opened with. `true` when it was PayPal's, so the app's own linking leaves it alone.
  func handle(url: URL) -> Bool {
    if let active, let client = active.client, active.links.matches(url) {
      client.handleReturnURL(url)
      return true
    }
    if active == nil, let pending = ledger.pending, pending.links.matches(url) {
      ledger.clear()

      if pending.flow == "checkout" || pending.flow == "vault" {
        restored = [
          "flow": pending.flow,
          "id": pending.id,
          "outcome": PayPalReturnParser.outcome(of: url, flow: pending.flow),
        ]
      }
      return true
    }
    // A late return for a flow that already ended: still PayPal's, never a screen of the app.
    return plistLinks?.matches(url) == true
  }

  func appEnteredBackground() {
    watcher.appEnteredBackground()
  }

  func appBecameActive() {
    guard watcher.isWatching else {
      return
    }
    let top = Self.topController()
    watcher.appBecameActive(isPresentingFlowUI: top != nil && top !== topControllerAtStart)
  }

  // MARK: - Flow bookkeeping

  /// Takes the flow slot, or answers `IN_PROGRESS` and returns `nil`.
  private func begin(flow: String, id: String, links: PayPalReturnLinks, client: PayPalClient?, promise: Promise) -> Int? {
    if let active {
      promise.resolve(Self.failed("PayPal is still running \(active.flow). Flows run one at a time.", code: "IN_PROGRESS"))
      return nil
    }
    nextToken += 1
    active = ActiveFlow(token: nextToken, flow: flow, links: links, client: client) { promise.resolve($0) }

    if client != nil {
      ledger.record(PendingFlow(flow: flow, id: id, links: links))
      topControllerAtStart = Self.topController()
      watcher.flowStarted()
    }
    return nextToken
  }

  /// Settles the flow `token` started, once; a late answer for a flow that already ended is dropped.
  private func finish(_ token: Int, _ outcome: [String: Any]) {
    guard let active, active.token == token else {
      return
    }
    self.active = nil

    if active.client != nil {
      ledger.clear()
      watcher.flowEnded()
    }
    active.settle(outcome)
  }

  private func payPalClient(for config: ConfigRecord) -> PayPalClient {
    if let client = payPalClients[config.key] {
      return client
    }
    let client = PayPalClient(config: config.coreConfig)
    payPalClients[config.key] = client
    return client
  }

  private func cardClient(for config: ConfigRecord) -> CardClient {
    if let client = cardClients[config.key] {
      return client
    }
    let client = CardClient(config: config.coreConfig)
    cardClients[config.key] = client
    return client
  }

  private static func userAction(_ value: String) -> PayPalUserAction {
    switch value {
    case "payNow": return .payNow
    case "setupNow": return .setupNow
    default: return .continue
    }
  }

  static func failed(_ error: CoreSDKError) -> [String: Any] {
    var outcome = failed(error.errorDescription ?? error.localizedDescription)
    outcome["nativeCode"] = error.code
    outcome["nativeDomain"] = error.domain
    return outcome
  }

  static func failed(_ message: String, code: String? = nil) -> [String: Any] {
    var outcome: [String: Any] = ["status": "failed", "message": message]
    outcome["code"] = code
    return outcome
  }

  private static func topController() -> UIViewController? {
    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first { $0.isKeyWindow }
    var top = window?.rootViewController

    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }
}

/// The ledger's one entry, in the app's standard defaults.
private final class UserDefaultsPendingFlowStore: PendingFlowStore {
  private let key = "com.hzblj.expopaypal.pendingFlow"

  func pendingFlowData() -> Data? {
    UserDefaults.standard.data(forKey: key)
  }

  func setPendingFlowData(_ data: Data?) {
    UserDefaults.standard.set(data, forKey: key)
  }
}

import XCTest

@testable import ExpoPayPalCore

final class PayPalReturnLinksTests: XCTestCase {
  private let links = PayPalReturnLinks(scheme: "shop", base: "https://shop.example.com/paypal/")

  func testDerivesTheLinksFromTheBaseLikeJavaScript() {
    XCTAssertEqual(links.successURL, "https://shop.example.com/paypal/success")
    XCTAssertEqual(links.cancelURL, "https://shop.example.com/paypal/cancel")
    XCTAssertEqual(PayPalReturnLinks(scheme: "shop", base: nil).successURL, "")
  }

  func testMatchesTheReturnsAndNothingElse() {
    let returns = [
      "https://shop.example.com/paypal/success?token=1&PayerID=2",
      "https://shop.example.com/paypal/cancel",
      "HTTPS://SHOP.EXAMPLE.COM/paypal/success",
      "shop://x-callback-url/paypal-sdk/paypal-checkout?token=1&PayerID=2",
      "SHOP://x-callback-url/paypal-sdk/paypal-checkout/cancel",
    ]
    let others = [
      "https://shop.example.com/paypal/successful",
      "https://shop.example.com/products/1",
      "shop://orders/1",
      "other://x-callback-url/paypal-sdk/paypal-checkout",
    ]

    for url in returns {
      XCTAssertTrue(links.matches(URL(string: url)!), url)
    }
    for url in others {
      XCTAssertFalse(links.matches(URL(string: url)!), url)
    }
  }

  func testSessionURLsUseTheHttpsLinksAndTheSchemeAsFallback() {
    let urls = links.sessionURLs!

    XCTAssertEqual(urls.returnURL.absoluteString, "https://shop.example.com/paypal/success")
    XCTAssertEqual(urls.cancelURL.absoluteString, "https://shop.example.com/paypal/cancel")
    XCTAssertEqual(urls.fallbackURL?.absoluteString, "shop://x-callback-url/paypal-sdk/paypal-checkout")
  }

  func testSessionURLsWithoutHttpsLinksReturnThroughTheScheme() {
    let urls = PayPalReturnLinks(scheme: "shop", base: nil).sessionURLs!

    XCTAssertEqual(urls.returnURL.absoluteString, "shop://x-callback-url/paypal-sdk/paypal-checkout/success")
    XCTAssertEqual(urls.cancelURL.absoluteString, "shop://x-callback-url/paypal-sdk/paypal-checkout/cancel")
    XCTAssertTrue(PayPalReturnLinks(scheme: "shop", base: nil).matches(urls.cancelURL))
  }
}

final class PayPalReturnParserTests: XCTestCase {
  private func outcome(_ url: String, _ flow: String) -> [String: String] {
    PayPalReturnParser.outcome(of: URL(string: url)!, flow: flow).compactMapValues { $0 as? String }
  }

  func testReadsAnApprovedCheckout() {
    XCTAssertEqual(
      outcome("https://shop.example.com/paypal/success?token=ORDER&PayerID=PAYER", "checkout"),
      ["status": "approved", "orderId": "ORDER", "payerId": "PAYER"]
    )
  }

  func testReadsAnApprovedVault() {
    XCTAssertEqual(
      outcome("shop://x-callback-url/paypal-sdk/paypal-checkout?approval_token_id=T&approval_session_id=S", "vault"),
      ["status": "approved", "approvalSessionId": "S"]
    )
  }

  func testReadsACancellationByPathOrByOpType() {
    XCTAssertEqual(outcome("https://shop.example.com/paypal/cancel?token=ORDER", "checkout"), ["status": "canceled"])
    XCTAssertEqual(outcome("shop://x-callback-url/paypal-sdk/paypal-checkout?opType=cancel", "vault"), ["status": "canceled"])
  }

  func testAReturnWithoutTheDataIsAFailure() {
    XCTAssertEqual(outcome("https://shop.example.com/paypal/success?token=ORDER", "checkout")["status"], "failed")
    XCTAssertEqual(outcome("https://shop.example.com/paypal/success?token=ORDER&PayerID=P", "vault")["status"], "failed")
  }
}

private final class MemoryStore: PendingFlowStore {
  var data: Data?

  func pendingFlowData() -> Data? {
    data
  }

  func setPendingFlowData(_ data: Data?) {
    self.data = data
  }
}

final class PendingFlowLedgerTests: XCTestCase {
  func testRecordsReadsAndClearsTheFlow() {
    let ledger = PendingFlowLedger(store: MemoryStore())
    let links = PayPalReturnLinks(scheme: "shop", base: "https://shop.example.com/paypal")
    let flow = PendingFlow(flow: "checkout", id: "ORDER", links: links)

    XCTAssertNil(ledger.pending)
    ledger.record(flow)
    XCTAssertEqual(ledger.pending, flow)
    XCTAssertEqual(ledger.pending?.links, links)
    ledger.clear()
    XCTAssertNil(ledger.pending)
  }

  func testIgnoresWhatItCannotRead() {
    let store = MemoryStore()

    store.data = Data("not json".utf8)
    XCTAssertNil(PendingFlowLedger(store: store).pending)
  }
}

final class ReturnWatcherTests: XCTestCase {
  private var scheduled: [() -> Void] = []
  private var abandoned = 0
  private lazy var watcher: ReturnWatcher = {
    let watcher = ReturnWatcher(grace: 1) { [unowned self] _, work in self.scheduled.append(work) }
    watcher.onAbandon = { [unowned self] in self.abandoned += 1 }
    return watcher
  }()

  private func runScheduled() {
    let work = scheduled
    scheduled = []
    work.forEach { $0() }
  }

  func testABuyerWhoCameBackByHandAbandonsTheFlow() {
    watcher.flowStarted()
    watcher.appEnteredBackground()
    watcher.appBecameActive(isPresentingFlowUI: false)
    runScheduled()

    XCTAssertEqual(abandoned, 1)
    XCTAssertFalse(watcher.isWatching)
  }

  func testAReturnLinkWithinTheGraceWins() {
    watcher.flowStarted()
    watcher.appEnteredBackground()
    watcher.appBecameActive(isPresentingFlowUI: false)
    watcher.flowEnded()
    runScheduled()

    XCTAssertEqual(abandoned, 0)
  }

  func testTheInAppBrowserIsNotAbandoned() {
    watcher.flowStarted()
    watcher.appEnteredBackground()
    watcher.appBecameActive(isPresentingFlowUI: true)
    runScheduled()

    XCTAssertEqual(abandoned, 0)
    XCTAssertTrue(watcher.isWatching)
  }

  func testAFlowThatNeverLeftTheAppIsNotAbandoned() {
    watcher.flowStarted()
    watcher.appBecameActive(isPresentingFlowUI: false)
    runScheduled()

    XCTAssertEqual(abandoned, 0)
  }

  func testLeavingAgainDropsThePendingDecision() {
    watcher.flowStarted()
    watcher.appEnteredBackground()
    watcher.appBecameActive(isPresentingFlowUI: false)
    watcher.appEnteredBackground()
    runScheduled()

    XCTAssertEqual(abandoned, 0)
    XCTAssertTrue(watcher.isWatching)

    watcher.appBecameActive(isPresentingFlowUI: false)
    runScheduled()

    XCTAssertEqual(abandoned, 1)
  }

  func testANewFlowIsNotAbandonedForTheLastOne() {
    watcher.flowStarted()
    watcher.appEnteredBackground()
    watcher.appBecameActive(isPresentingFlowUI: false)
    watcher.flowEnded()
    watcher.flowStarted()
    runScheduled()

    XCTAssertEqual(abandoned, 0)
    XCTAssertTrue(watcher.isWatching)
  }

  func testAnIdleWatcherIgnoresTheApp() {
    watcher.appEnteredBackground()
    watcher.appBecameActive(isPresentingFlowUI: false)
    runScheduled()

    XCTAssertEqual(abandoned, 0)
    XCTAssertFalse(watcher.isWatching)
  }
}

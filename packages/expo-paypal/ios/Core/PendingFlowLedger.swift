import Foundation

/// A flow on its way to PayPal, written down so its return can still be read if the system ends the app meanwhile.
public struct PendingFlow: Codable, Equatable {
  /// `checkout`, `vault`, `checkoutWithCard` or `vaultCard`.
  public let flow: String
  /// The order or setup token the flow was started with.
  public let id: String
  public let scheme: String
  public let successURL: String
  public let cancelURL: String

  public init(flow: String, id: String, links: PayPalReturnLinks) {
    self.flow = flow
    self.id = id
    self.scheme = links.scheme
    self.successURL = links.successURL
    self.cancelURL = links.cancelURL
  }

  public var links: PayPalReturnLinks {
    PayPalReturnLinks(scheme: scheme, successURL: successURL, cancelURL: cancelURL)
  }
}

/// Where the ledger keeps its one entry: `UserDefaults` in the app, a dictionary in the tests.
public protocol PendingFlowStore: AnyObject {
  func pendingFlowData() -> Data?
  func setPendingFlowData(_ data: Data?)
}

public final class PendingFlowLedger {
  private let store: PendingFlowStore

  public init(store: PendingFlowStore) {
    self.store = store
  }

  public var pending: PendingFlow? {
    store.pendingFlowData().flatMap { try? JSONDecoder().decode(PendingFlow.self, from: $0) }
  }

  public func record(_ flow: PendingFlow) {
    store.setPendingFlowData(try? JSONEncoder().encode(flow))
  }

  public func clear() {
    store.setPendingFlowData(nil)
  }
}

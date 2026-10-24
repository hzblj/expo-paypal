import Foundation

/**
 Notices a buyer who came back from the PayPal app without approving or cancelling: they left the app, then reopened
 it by hand, so no return link arrives and the SDK would wait forever. The flow then settles as cancelled, as Android
 and the in-app browser do.

 Only a flow that left the app is watched. The in-app browser keeps the app in the foreground and reports its own
 cancellation, and a buyer who visits another app from it (for a password, a code) comes back to the browser still
 showing: `isPresentingFlowUI` tells the two apart. A return link can arrive just after the app becomes active, so the
 decision waits `grace` seconds.
 */
public final class ReturnWatcher {
  public typealias Schedule = (_ delay: TimeInterval, _ work: @escaping () -> Void) -> Void

  private enum State {
    case idle
    case waiting
    case away
  }

  private let grace: TimeInterval
  private let schedule: Schedule
  private var state = State.idle
  private var generation = 0

  /// Called when the buyer came back by hand. The flow is still the one that was started.
  public var onAbandon: (() -> Void)?

  public init(grace: TimeInterval = 1, schedule: @escaping Schedule) {
    self.grace = grace
    self.schedule = schedule
  }

  public var isWatching: Bool {
    state != .idle
  }

  public func flowStarted() {
    generation += 1
    state = .waiting
  }

  public func flowEnded() {
    generation += 1
    state = .idle
  }

  public func appEnteredBackground() {
    guard state != .idle else {
      return
    }
    // Leaving again drops a decision still pending from the last time the app became active.
    generation += 1
    state = .away
  }

  public func appBecameActive(isPresentingFlowUI: Bool) {
    guard state == .away else {
      return
    }
    guard !isPresentingFlowUI else {
      state = .waiting
      return
    }
    let expected = generation

    schedule(grace) { [weak self] in
      guard let self, self.generation == expected, self.state == .away else {
        return
      }
      self.flowEnded()
      self.onAbandon?()
    }
  }
}

import ExpoModulesCore
import PayPal
import UIKit

/**
 One of the SDK's own payment buttons: PayPal, Pay Later or PayPal Credit. The SDK takes its look only in the
 initializer, so a change of look builds the button again; `disabled` alone is applied in place.
 */
final class PayPalButtonView: ExpoView {
  // Not `onPress`: React Native registers `topPress` as a bubbling event, and a direct one by that name throws.
  let onButtonPress = EventDispatcher()

  var kind = "paypal"
  var color = "gold"
  var label: String?
  var shape = "rounded"
  var cornerRadius: Double?
  var size = "medium"
  var disabled = false

  private var button: PaymentButton?
  private var builtLook: [String] = []

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
  }

  func update() {
    let look = [kind, color, label ?? "", shape, cornerRadius.map { "\($0)" } ?? "", size]

    if look != builtLook || button == nil {
      builtLook = look
      rebuild()
    }
    button?.isEnabled = !disabled
    button?.alpha = disabled ? 0.5 : 1
  }

  private func rebuild() {
    button?.removeFromSuperview()

    let next: PaymentButton

    switch kind {
    case "payLater":
      next = PayPalPayLaterButton(color: PayPalPayLaterButton.Color(rawValue: color) ?? .gold, edges: edges, size: buttonSize)
    case "credit":
      next = PayPalCreditButton(color: PayPalCreditButton.Color(rawValue: color) ?? .darkBlue, edges: edges, size: buttonSize)
    default:
      next = PayPalButton(
        color: PayPalButton.Color(rawValue: color) ?? .gold,
        edges: edges,
        size: buttonSize,
        label: buttonLabel
      )
    }
    next.addTarget(self, action: #selector(pressed), for: .touchUpInside)
    addSubview(next)

    // The SDK lays the button out with Auto Layout (it turns autoresizing off itself), so it is pinned to this view,
    // whose frame React Native sets.
    next.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      next.leadingAnchor.constraint(equalTo: leadingAnchor),
      next.trailingAnchor.constraint(equalTo: trailingAnchor),
      next.topAnchor.constraint(equalTo: topAnchor),
      next.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
    button = next
  }

  @objc private func pressed() {
    onButtonPress()
  }

  private var edges: PaymentButtonEdges {
    if let cornerRadius {
      return .custom(CGFloat(cornerRadius))
    }
    switch shape {
    case "rectangle": return .hardEdges
    case "pill": return .rounded
    default: return .softEdges
    }
  }

  /// `small` is the SDK's collapsed size, which shows the wordmark alone: Android hides the label to match.
  private var buttonSize: PaymentButtonSize {
    switch size {
    case "small": return .collapsed
    case "large": return .full
    default: return .expanded
    }
  }

  private var buttonLabel: PayPalButton.Label? {
    switch label {
    case "checkout": return .checkout
    case "buyNow": return .buyNow
    case "payWith": return .payWith
    default: return nil
    }
  }
}

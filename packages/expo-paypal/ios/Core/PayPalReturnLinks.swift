import Foundation

/**
 Where PayPal brings the buyer back: the https success and cancel links (Universal Links) when the app has them, and
 the custom scheme. Foundation only, so `ios/Tests` runs it on the Mac.
 */
public struct PayPalReturnLinks: Equatable {
  /// The path both SDKs give a custom-scheme return: `<scheme>://x-callback-url/paypal-sdk/…`.
  public static let callbackPath = "x-callback-url/paypal-sdk/"

  public let scheme: String
  /// `<returnUrl>/success`, or empty without an https base.
  public let successURL: String
  /// `<returnUrl>/cancel`, or empty without an https base.
  public let cancelURL: String

  public init(scheme: String, successURL: String, cancelURL: String) {
    self.scheme = scheme
    self.successURL = successURL
    self.cancelURL = cancelURL
  }

  /// From the base the config plugin writes to Info.plist, the way the JavaScript side derives the two links.
  public init(scheme: String, base: String?) {
    let trimmed = (base ?? "").replacingOccurrences(of: "/+$", with: "", options: .regularExpression)
    self.init(
      scheme: scheme,
      successURL: trimmed.isEmpty ? "" : "\(trimmed)/success",
      cancelURL: trimmed.isEmpty ? "" : "\(trimmed)/cancel"
    )
  }

  private var callbackBase: String {
    "\(scheme)://\(Self.callbackPath)paypal-checkout"
  }

  /**
   The URLs the iOS SDK's shopper session gets. Without https links, the returns go to the scheme, in the shape the
   Android SDK uses for its own custom-scheme returns; App Switch then returns through the scheme too.
   */
  public var sessionURLs: (returnURL: URL, cancelURL: URL, fallbackURL: URL?)? {
    let success = successURL.isEmpty ? "\(callbackBase)/success" : successURL
    let cancel = cancelURL.isEmpty ? "\(callbackBase)/cancel" : cancelURL

    guard let returnURL = URL(string: success), let cancelURL = URL(string: cancel) else {
      return nil
    }
    return (returnURL, cancelURL, URL(string: callbackBase))
  }

  /// Whether `url` is PayPal bringing the buyer back: one of the https links, or the SDKs' path under the scheme.
  public func matches(_ url: URL) -> Bool {
    let text = url.absoluteString.lowercased()

    if !scheme.isEmpty && text.hasPrefix("\(scheme.lowercased())://\(Self.callbackPath)") {
      return true
    }
    return [successURL, cancelURL].contains { link in
      guard !link.isEmpty, text.hasPrefix(link.lowercased()) else {
        return false
      }
      let rest = text.dropFirst(link.count)
      return rest.isEmpty || rest.hasPrefix("?") || rest.hasPrefix("/")
    }
  }
}

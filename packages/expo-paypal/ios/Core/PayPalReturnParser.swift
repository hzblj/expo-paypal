import Foundation

/**
 Reads the outcome out of a return URL, the way the SDK's `handleReturnURL` does. Only for a flow nobody is awaiting
 any more: the system ended the app while the buyer was in the PayPal app, and the return launched it again. A live
 flow always goes through the SDK.
 */
public enum PayPalReturnParser {
  public static func outcome(of url: URL, flow: String) -> [String: Any] {
    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    let items = components?.queryItems ?? []

    func value(_ name: String) -> String? {
      let found = items.first { $0.name.caseInsensitiveCompare(name) == .orderedSame }?.value
      return found?.isEmpty == false ? found : nil
    }

    if url.path.lowercased().contains("/cancel") || value("opType")?.lowercased() == "cancel" {
      return ["status": "canceled"]
    }

    switch flow {
    case "checkout":
      if let orderID = value("token"), let payerID = value("PayerID") {
        return ["status": "approved", "orderId": orderID, "payerId": payerID]
      }
    case "vault":
      if value("approval_token_id") != nil, let sessionID = value("approval_session_id") {
        return ["status": "approved", "approvalSessionId": sessionID]
      }
    default:
      break
    }
    return ["status": "failed", "message": "PayPal returned without the expected data."]
  }
}

import ExpoModulesCore
import PayPal

/// The config JavaScript sends with every call, the return links already derived.
struct ConfigRecord: Record {
  @Field var clientId: String = ""
  @Field var merchantId: String = ""
  @Field var environment: String = "sandbox"
  @Field var bnCode: String?
  @Field var returnUrl: String = ""
  @Field var cancelUrl: String = ""
  @Field var scheme: String = ""

  var coreConfig: CoreConfig {
    CoreConfig(
      clientID: clientId,
      environment: environment == "live" ? .live : .sandbox,
      merchantID: merchantId,
      bnCode: bnCode
    )
  }

  var links: PayPalReturnLinks {
    PayPalReturnLinks(scheme: scheme, successURL: returnUrl, cancelURL: cancelUrl)
  }

  /// The SDK's clients are kept per account, so a flow's return reaches the client that started it.
  var key: String {
    [clientId, merchantId, environment, bnCode ?? ""].joined(separator: "\n")
  }
}

struct PhoneRecord: Record {
  @Field var countryCode: String = ""
  @Field var nationalNumber: String = ""
}

struct BuyerRecord: Record {
  @Field var email: String?
  @Field var phone: PhoneRecord?
  @Field var sessionId: String?

  var userIdentity: PayPalUserIdentity {
    if let sessionId {
      return PayPalUserIdentity(existingPayPalSessionID: sessionId)
    }
    return PayPalUserIdentity(
      email: email,
      phone: phone.map { PayPalPhoneNumber(countryCode: $0.countryCode, nationalNumber: $0.nationalNumber) }
    )
  }
}

struct AddressRecord: Record {
  @Field var addressLine1: String?
  @Field var addressLine2: String?
  @Field var locality: String?
  @Field var region: String?
  @Field var postalCode: String?
  @Field var countryCode: String = ""
}

struct CardRecord: Record {
  @Field var number: String = ""
  @Field var expirationMonth: String = ""
  @Field var expirationYear: String = ""
  @Field var securityCode: String = ""
  @Field var cardholderName: String?
  @Field var billingAddress: AddressRecord?

  var card: Card {
    Card(
      number: number,
      expirationMonth: expirationMonth,
      expirationYear: expirationYear,
      securityCode: securityCode,
      cardholderName: cardholderName,
      billingAddress: billingAddress.map {
        Address(
          addressLine1: $0.addressLine1,
          addressLine2: $0.addressLine2,
          locality: $0.locality,
          region: $0.region,
          postalCode: $0.postalCode,
          countryCode: $0.countryCode
        )
      }
    )
  }
}

package com.hzblj.expopaypal

import com.paypal.android.cardpayments.Card
import com.paypal.android.corepayments.Address
import com.paypal.android.corepayments.CoreConfig
import com.paypal.android.corepayments.CoreEnvironment
import com.paypal.android.paypalpayments.PayPalPhoneNumber
import com.paypal.android.paypalpayments.PayPalUserIdentity
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** The config JavaScript sends with every call, the return links already derived. */
class ConfigRecord : Record {
  @Field val clientId: String = ""
  @Field val merchantId: String = ""
  @Field val environment: String = "sandbox"
  @Field val bnCode: String? = null
  @Field val returnUrl: String = ""
  @Field val cancelUrl: String = ""
  @Field val scheme: String = ""

  val account: PendingFlow.Account
    get() = PendingFlow.Account(clientId, merchantId, environment, bnCode)

  val links: ReturnLinks
    get() = ReturnLinks(scheme = scheme, successUrl = returnUrl, cancelUrl = cancelUrl)
}

val PendingFlow.Account.coreConfig: CoreConfig
  get() = CoreConfig(
    clientId = clientId,
    merchantId = merchantId,
    coreEnvironment = if (environment == "live") CoreEnvironment.LIVE else CoreEnvironment.SANDBOX,
    bnCode = bnCode
  )

/** The SDK's clients are kept per account, so a flow's return reaches the client that started it. */
val PendingFlow.Account.key: String
  get() = listOf(clientId, merchantId, environment, bnCode.orEmpty()).joinToString("\n")

class PhoneRecord : Record {
  @Field val countryCode: String = ""
  @Field val nationalNumber: String = ""
}

class BuyerRecord : Record {
  @Field val email: String? = null
  @Field val phone: PhoneRecord? = null
  @Field val sessionId: String? = null

  val userIdentity: PayPalUserIdentity
    get() = if (sessionId != null) {
      PayPalUserIdentity(existingPayPalSessionId = sessionId)
    } else {
      PayPalUserIdentity(email = email, phone = phone?.let { PayPalPhoneNumber(it.countryCode, it.nationalNumber) })
    }
}

class AddressRecord : Record {
  @Field val addressLine1: String? = null
  @Field val addressLine2: String? = null
  @Field val locality: String? = null
  @Field val region: String? = null
  @Field val postalCode: String? = null
  @Field val countryCode: String = ""
}

class CardRecord : Record {
  @Field val number: String = ""
  @Field val expirationMonth: String = ""
  @Field val expirationYear: String = ""
  @Field val securityCode: String = ""
  @Field val cardholderName: String? = null
  @Field val billingAddress: AddressRecord? = null

  val card: Card
    get() = Card(
      number = number,
      expirationMonth = expirationMonth,
      expirationYear = expirationYear,
      securityCode = securityCode,
      cardholderName = cardholderName,
      billingAddress = billingAddress?.let {
        Address(
          countryCode = it.countryCode,
          streetAddress = it.addressLine1,
          extendedAddress = it.addressLine2,
          locality = it.locality,
          region = it.region,
          postalCode = it.postalCode
        )
      }
    )
}

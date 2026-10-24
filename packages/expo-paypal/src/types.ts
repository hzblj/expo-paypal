import type {PayPalError} from './errors'

/** Which PayPal servers the SDK talks to. */
export type PayPalEnvironment = 'sandbox' | 'live'

export type PayPalConfig = {
  /** Your app's client ID from the PayPal Developer Dashboard. */
  clientId: string
  /**
   * The merchant account ID: PayPal's encrypted ID of the account that gets paid (Dashboard, Account settings), not its
   * email. Required by the SDK since 3.0.
   */
  merchantId: string
  /** `sandbox` while you test, `live` in production. There is no default, so a build never charges by accident. */
  environment: PayPalEnvironment
  /** Partner attribution (BN) code, only for platforms that process payments on behalf of merchants. */
  bnCode?: string
  /**
   * Replaces the config plugin's `returnUrl`: the https address PayPal returns to, as `<returnUrl>/success` and
   * `<returnUrl>/cancel`. The app has to be registered for it (Universal Link, App Link), which the plugin does.
   */
  returnUrl?: string
  /** Replaces the config plugin's `scheme`: the custom URL scheme PayPal falls back to when a link can't open the app. */
  scheme?: string
}

/** A phone number, split the way PayPal matches it. */
export type PayPalPhoneNumber = {
  /** The country calling code without `+`, such as `1` or `420`. */
  countryCode: string
  /** The number without the country code. */
  nationalNumber: string
}

/**
 * Who is paying, when you know. PayPal uses it to recognise the buyer: it raises the chance of App Switch (approval in
 * the PayPal app with Face ID or a passkey) and of approval itself. The SDK hashes email and phone before sending them.
 */
export type PayPalBuyer =
  | {
      email?: string
      phone?: PayPalPhoneNumber
    }
  | {
      /** A PayPal shopper session your server already created. */
      sessionId: string
    }

/**
 * An ID you have now, or one your server is still creating: a promise, or a function that returns one. Passing the
 * work rather than its result lets the PayPal session start in parallel with your server call, as PayPal recommends.
 */
export type PayPalPendingId = string | Promise<string> | (() => string | Promise<string>)

export type PayPalCheckoutOptions = {
  /** The Orders v2 order to approve, created on your server. */
  orderId: PayPalPendingId
  buyer?: PayPalBuyer
  /**
   * What the button on PayPal's review page says: `continue` (the default) when your app shows a review step before it
   * captures, `payNow` when approval is the last step.
   */
  userAction?: 'continue' | 'payNow'
}

export type PayPalCheckoutResult =
  | {
      status: 'approved'
      orderId: string
      payerId: string
    }
  | {
      /** The buyer left without approving. Nothing was charged: send them back to your checkout. */
      status: 'canceled'
      orderId: string
    }

export type PayPalVaultOptions = {
  /** The setup token to approve, created on your server with the Payment Method Tokens API. */
  setupTokenId: PayPalPendingId
  buyer?: PayPalBuyer
  /** `setupNow` labels PayPal's button for saving the account; `continue` (the default) for a step after it. */
  userAction?: 'continue' | 'setupNow'
}

export type PayPalVaultResult =
  | {
      status: 'approved'
      setupTokenId: string
      /** Identifies the approval; your server turns the setup token into a payment token. */
      approvalSessionId: string
    }
  | {
      status: 'canceled'
      setupTokenId: string
    }

export type PayPalAddress = {
  addressLine1?: string
  addressLine2?: string
  /** A city, town or village. */
  locality?: string
  /** A state, province or county, as postal services write it: `CA`, not `California`. */
  region?: string
  postalCode?: string
  /** Two letters, ISO 3166-1: `US`, `CZ`, `GB`. */
  countryCode: string
}

/**
 * Card details as the buyer typed them into your own form: the SDK ships no card fields. They go from the app to
 * PayPal and are never stored.
 */
export type PayPalCard = {
  /** The card number. Spaces and dashes are removed. */
  number: string
  /** `1` to `12`, as a number or a string. */
  expirationMonth: number | string
  /** Four digits, or two (`28` is 2028). */
  expirationYear: number | string
  /** The CVV, CVC or CID. */
  securityCode: string
  cardholderName?: string
  billingAddress?: PayPalAddress
}

export type PayPalCardCheckoutOptions = {
  /** The Orders v2 order to approve, created on your server. */
  orderId: PayPalPendingId
  card: PayPalCard
  /**
   * When 3D Secure challenges the buyer: `whenRequired` (the default) leaves it to the issuer and the rules, `always`
   * challenges every time, which is how you test the challenge.
   */
  threeDSecure?: 'whenRequired' | 'always'
}

export type PayPalCardCheckoutResult =
  | {
      status: 'approved'
      orderId: string
      /** The order's status after approval, such as `APPROVED`, when PayPal reports one. */
      orderStatus?: string
      /** Whether a 3D Secure challenge ran. Your server reads its outcome from the order before it captures. */
      threeDSecureAttempted: boolean
    }
  | {
      /** The buyer closed the 3D Secure challenge. Nothing was charged. */
      status: 'canceled'
      orderId: string
    }

export type PayPalCardVaultOptions = {
  /** The setup token to attach the card to, created on your server. */
  setupTokenId: PayPalPendingId
  card: PayPalCard
}

export type PayPalCardVaultResult =
  | {
      status: 'approved'
      setupTokenId: string
      /** The setup token's status after the card was attached, when PayPal reports one. */
      setupTokenStatus?: string
      /** Whether a 3D Secure challenge ran. */
      threeDSecureAttempted: boolean
    }
  | {
      status: 'canceled'
      setupTokenId: string
    }

export type PayPalDeviceDataOptions = {
  /** Android: whether the buyer agreed to share their location for risk checks. `false` by default; iOS ignores it. */
  hasUserLocationConsent?: boolean
  /** Extra key and value pairs for PayPal's risk checks. */
  additionalData?: Record<string, string>
}

/** The flows `PayPal` runs, one at a time. */
export type PayPalFlow = 'checkout' | 'vault' | 'checkoutWithCard' | 'vaultCard'

/**
 * A flow that finished while the app was not running to hear it: the system ended the app while the buyer was in
 * PayPal, and the return opened it again. Read it with `PayPal.takeRestoredResult()` when the app starts. A failure
 * comes back as `error` rather than thrown, since nothing was awaiting it.
 */
export type PayPalRestoredResult =
  | {flow: 'checkout'; result: PayPalCheckoutResult; error?: undefined}
  | {flow: 'vault'; result: PayPalVaultResult; error?: undefined}
  | {flow: 'checkoutWithCard'; result: PayPalCardCheckoutResult; error?: undefined}
  | {flow: 'vaultCard'; result: PayPalCardVaultResult; error?: undefined}
  | {flow: PayPalFlow; result?: undefined; error: PayPalError}

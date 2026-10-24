import type {NativeCard} from './card'
import type {PayPalEnvironment, PayPalFlow} from './types'

/** What the native module gets with every call: the config, with the return links already derived. */
export type NativeConfig = {
  bnCode?: string
  /** `<returnUrl>/cancel`, or empty. */
  cancelUrl: string
  clientId: string
  environment: PayPalEnvironment
  merchantId: string
  /** `<returnUrl>/success`, or empty. */
  returnUrl: string
  scheme: string
}

export type NativeBuyer = {
  email?: string
  phone?: {countryCode: string; nationalNumber: string}
  sessionId?: string
}

/**
 * How a native flow ended. The native side never rejects for an expected outcome: approval, cancellation and the SDK's
 * failures all resolve, and the JavaScript side turns a failure into a `PayPalError`.
 */
export type NativeOutcome =
  | {
      status: 'approved'
      /** Checkout: the approved order and its payer. */
      orderId?: string
      payerId?: string
      /** PayPal vault. */
      approvalSessionId?: string
      /** Card checkout and card vault. */
      orderStatus?: string
      setupTokenStatus?: string
      threeDSecureAttempted?: boolean
    }
  | {status: 'canceled'}
  | {
      status: 'failed'
      /** Set when the native module itself refused the call (`IN_PROGRESS`, `INVALID_ARGUMENT`). */
      code?: string
      message: string
      nativeCode?: number
      nativeDomain?: string
      correlationId?: string
    }

/** A flow that finished while JavaScript wasn't running, with the ID it was started with. */
export type NativeRestoredOutcome = {
  flow: PayPalFlow
  id: string
  outcome: NativeOutcome
}

/** The `ExpoPayPal` native module, as both platforms implement it. */
export type PayPalNativeModule = {
  /** The config plugin's links, read from Info.plist and AndroidManifest.xml. */
  links?: {returnUrl?: string | null; scheme?: string | null}
  /** Starts PayPal's shopper session in the background, so it is ready when the flow starts. */
  preparePayPalSession(
    config: NativeConfig,
    flow: 'checkout' | 'vault',
    buyer: NativeBuyer | null,
    userAction: 'continue' | 'payNow' | 'setupNow'
  ): void
  checkout(config: NativeConfig, orderId: string): Promise<NativeOutcome>
  vault(config: NativeConfig, setupTokenId: string): Promise<NativeOutcome>
  checkoutWithCard(
    config: NativeConfig,
    orderId: string,
    card: NativeCard,
    threeDSecure: 'whenRequired' | 'always'
  ): Promise<NativeOutcome>
  vaultCard(config: NativeConfig, setupTokenId: string, card: NativeCard): Promise<NativeOutcome>
  collectDeviceData(
    config: NativeConfig,
    hasUserLocationConsent: boolean,
    additionalData: Record<string, string>
  ): Promise<string>
  takeRestoredResult(): Promise<NativeRestoredOutcome | null>
}

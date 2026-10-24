/**
 * Why a PayPal call failed. A buyer who cancels is not an error: every flow resolves with `status: 'canceled'`.
 *
 * - `UNAVAILABLE`: this build has no PayPal native module (Expo Go, web, a build from before the package was added).
 * - `NOT_CONFIGURED`: `PayPal.configure()` was never called.
 * - `INVALID_ARGUMENT`: a config value or an option is missing or malformed; the message says which.
 * - `IN_PROGRESS`: another PayPal flow is still running. Flows run one at a time.
 * - `FAILED`: the PayPal SDK reported a failure (network, a declined card, a session PayPal refused); see `message`
 *   and the native details.
 */
export type PayPalErrorCode = 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'INVALID_ARGUMENT' | 'IN_PROGRESS' | 'FAILED'

export type PayPalErrorDetails = {
  /** The SDK's own error code, when it gave one. Its meaning depends on the platform and `nativeDomain`. */
  nativeCode?: number
  /** iOS: the SDK's error domain, such as `PayPalClientErrorDomain` or `CardClientErrorDomain`. */
  nativeDomain?: string
  /** PayPal's correlation ID for the failed request, for PayPal's support. */
  correlationId?: string
}

export class PayPalError extends Error {
  readonly code: PayPalErrorCode
  readonly nativeCode?: number
  readonly nativeDomain?: string
  readonly correlationId?: string

  constructor(code: PayPalErrorCode, message: string, details: PayPalErrorDetails = {}) {
    super(message)
    this.name = 'PayPalError'
    this.code = code
    this.nativeCode = details.nativeCode
    this.nativeDomain = details.nativeDomain
    this.correlationId = details.correlationId
  }
}

export const isPayPalError = (error: unknown): error is PayPalError => error instanceof PayPalError

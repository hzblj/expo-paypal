import {createPayPal} from './client'
import {ExpoPayPal} from './ExpoPayPalModule'

/**
 * PayPal on the native SDK: PayPal Checkout (with App Switch, Pay Later and PayPal Credit), vaulting, card payments
 * with 3D Secure and device data. Every flow is one promise that resolves `approved` or `canceled` and rejects with a
 * `PayPalError` on failure; your server creates the order before and captures it after.
 *
 * ```ts
 * PayPal.configure({clientId, environment: 'sandbox', merchantId})
 *
 * const result = await PayPal.checkout({orderId: () => api.createOrder()})
 *
 * if (result.status === 'approved') {
 *   await api.captureOrder(result.orderId)
 * }
 * ```
 */
export const PayPal = createPayPal(ExpoPayPal)

/** Whether a URL is PayPal bringing the buyer back, for the app's router to skip. Same as `PayPal.isReturnUrl`. */
export const isPayPalReturnUrl = (url: string): boolean => PayPal.isReturnUrl(url)

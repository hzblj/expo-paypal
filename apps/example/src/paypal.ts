import {PayPal} from '@hzblj/expo-paypal'

const clientId = process.env.EXPO_PUBLIC_PAYPAL_CLIENT_ID
const merchantId = process.env.EXPO_PUBLIC_PAYPAL_MERCHANT_ID

/** Whether `apps/example/.env` has the sandbox account. Without it the screens explain what to set. */
export const hasCredentials = Boolean(clientId && merchantId)

if (clientId && merchantId) {
  PayPal.configure({clientId, environment: 'sandbox', merchantId})
}

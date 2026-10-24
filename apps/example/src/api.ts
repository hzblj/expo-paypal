import Constants from 'expo-constants'

/**
 * The example's own server: the API routes in `app/api`, served by the dev server the app was loaded from. Native
 * requests need its absolute address.
 */
const origin = () => (Constants.expoConfig?.hostUri ? `http://${Constants.expoConfig.hostUri}` : '')

const post = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await fetch(`${origin()}/api/${path}`, {
    body: JSON.stringify(body),
    headers: {'Content-Type': 'application/json'},
    method: 'POST',
  })
  const json = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(json.error ?? `The example server answered ${response.status}.`)
  }

  return json as T
}

export type PaymentMethod = 'PAYPAL' | 'PAYPAL_PAY_LATER' | 'PAYPAL_CREDIT'

export const api = {
  capture: (orderId: string) =>
    post<{
      captureId?: string
      captureStatus?: string
      id: string
      payerEmail?: string
      status: string
      vaultId?: string
    }>(`orders/${encodeURIComponent(orderId)}/capture`, {}),
  createOrder: async (order: {
    amount: string
    clientMetadataId?: string
    paymentMethod?: PaymentMethod
    vault?: boolean
  }) => (await post<{id: string}>('orders', order)).id,
  createPaymentToken: (setupTokenId: string) =>
    post<{id: string; paymentSource?: string}>('payment-tokens', {setupTokenId}),
  createSetupToken: async (token: {paymentSource: 'paypal' | 'card'; threeDSecure?: 'whenRequired' | 'always'}) =>
    (await post<{id: string}>('setup-tokens', token)).id,
}

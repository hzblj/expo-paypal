/**
 * The example's server side: PayPal's REST API in the sandbox, called from the API routes in `app/api`, which run in
 * the dev server. A real app does this on its own backend; the client secret must never reach the app.
 */

const API = 'https://api-m.sandbox.paypal.com'

/** Where the sandbox sends a browser back, for the requests that ask: the example's scheme, as the SDK's session has it. */
export const RETURN_LINKS = {
  cancelUrl: 'paypal-example://x-callback-url/paypal-sdk/paypal-checkout/cancel',
  returnUrl: 'paypal-example://x-callback-url/paypal-sdk/paypal-checkout/success',
}

let token: {expiresAt: number; value: string} | null = null

const credentials = () => {
  const clientId = process.env.EXPO_PUBLIC_PAYPAL_CLIENT_ID
  const secret = process.env.PAYPAL_CLIENT_SECRET

  if (!clientId || !secret) {
    throw new Error(
      'Set EXPO_PUBLIC_PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in apps/example/.env (see .env.example).'
    )
  }

  return {clientId, secret}
}

const accessToken = async (): Promise<string> => {
  if (token && token.expiresAt > Date.now() + 60_000) {
    return token.value
  }

  const {clientId, secret} = credentials()
  const response = await fetch(`${API}/v1/oauth2/token`, {
    body: 'grant_type=client_credentials',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })
  const body = await response.json()

  if (!response.ok) {
    throw new Error(`PayPal refused the credentials: ${body.error_description ?? response.status}`)
  }

  token = {expiresAt: Date.now() + body.expires_in * 1000, value: body.access_token}

  return token.value
}

export class PayPalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: unknown
  ) {
    super(message)
  }
}

/** One REST call, authorized; PayPal's error body comes back in the thrown error. */
export const paypalApi = async <T>(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> => {
  const response = await fetch(`${API}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': crypto.randomUUID(),
      ...headers,
    },
    method: 'POST',
  })
  const json = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new PayPalApiError(json.message ?? `PayPal answered ${response.status}`, response.status, json)
  }

  return json as T
}

/** An API route's answer: the JSON, or the error with what PayPal said. */
export const respond = async (work: () => Promise<unknown>): Promise<Response> => {
  try {
    return Response.json(await work())
  } catch (error) {
    const status = error instanceof PayPalApiError ? error.status : 500
    const details = error instanceof PayPalApiError ? error.details : undefined

    return Response.json({details, error: error instanceof Error ? error.message : String(error)}, {status})
  }
}

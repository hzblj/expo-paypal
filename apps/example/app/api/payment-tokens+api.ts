import {paypalApi, respond} from '../../src/server/paypal'

/** Turns an approved setup token into a payment token: the saved account or card, to charge later. */
export const POST = (request: Request) =>
  respond(async () => {
    const {setupTokenId}: {setupTokenId: string} = await request.json()
    const token = await paypalApi<{id: string; payment_source?: Record<string, unknown>}>('/v3/vault/payment-tokens', {
      payment_source: {token: {id: setupTokenId, type: 'SETUP_TOKEN'}},
    })

    return {id: token.id, paymentSource: Object.keys(token.payment_source ?? {})[0]}
  })

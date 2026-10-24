import {paypalApi, RETURN_LINKS, respond} from '../../src/server/paypal'

type SetupTokenRequest = {
  paymentSource: 'paypal' | 'card'
  threeDSecure?: 'whenRequired' | 'always'
}

/** Creates a setup token, the step before `PayPal.vault()` or `PayPal.vaultCard()`. */
export const POST = (request: Request) =>
  respond(async () => {
    const {paymentSource, threeDSecure}: SetupTokenRequest = await request.json()
    const experienceContext = {cancel_url: RETURN_LINKS.cancelUrl, return_url: RETURN_LINKS.returnUrl}
    const token = await paypalApi<{id: string; status: string}>('/v3/vault/setup-tokens', {
      payment_source:
        paymentSource === 'card'
          ? {
              card: {
                experience_context: experienceContext,
                verification_method: threeDSecure === 'always' ? 'SCA_ALWAYS' : 'SCA_WHEN_REQUIRED',
              },
            }
          : {
              paypal: {
                experience_context: {...experienceContext, vault_instruction: 'ON_PAYER_APPROVAL'},
                usage_type: 'MERCHANT',
              },
            },
    })

    return {id: token.id, status: token.status}
  })

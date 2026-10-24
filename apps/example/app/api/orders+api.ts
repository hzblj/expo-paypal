import {paypalApi, RETURN_LINKS, respond} from '../../src/server/paypal'

type OrderRequest = {
  amount: string
  currency?: string
  /** Sets the order's PayPal funding: plain PayPal, Pay Later or PayPal Credit. Absent for a card order. */
  paymentMethod?: 'PAYPAL' | 'PAYPAL_PAY_LATER' | 'PAYPAL_CREDIT'
  /** Saves the buyer's PayPal account with the purchase. */
  vault?: boolean
  clientMetadataId?: string
}

/** Creates an Orders v2 order, the step before `PayPal.checkout()` or `PayPal.checkoutWithCard()`. */
export const POST = (request: Request) =>
  respond(async () => {
    const {amount, clientMetadataId, currency = 'USD', paymentMethod, vault}: OrderRequest = await request.json()
    const order = await paypalApi<{id: string; status: string}>(
      '/v2/checkout/orders',
      {
        intent: 'CAPTURE',
        ...(paymentMethod
          ? {
              payment_source: {
                paypal: {
                  ...(vault
                    ? {
                        attributes: {
                          vault: {customer_type: 'CONSUMER', store_in_vault: 'ON_SUCCESS', usage_type: 'MERCHANT'},
                        },
                      }
                    : {}),
                  experience_context: {
                    cancel_url: RETURN_LINKS.cancelUrl,
                    payment_method_selected: paymentMethod,
                    return_url: RETURN_LINKS.returnUrl,
                    shipping_preference: 'NO_SHIPPING',
                  },
                },
              },
            }
          : {}),
        purchase_units: [{amount: {currency_code: currency, value: amount}}],
      },
      clientMetadataId ? {'PayPal-Client-Metadata-Id': clientMetadataId} : {}
    )

    return {id: order.id, status: order.status}
  })

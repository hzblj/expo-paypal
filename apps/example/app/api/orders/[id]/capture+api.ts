import {paypalApi, respond} from '../../../../src/server/paypal'

type Vault = {attributes?: {vault?: {id?: string; status?: string}}}

type Capture = {
  id: string
  status: string
  payment_source?: {
    card?: Vault & {brand?: string; last_digits?: string}
    paypal?: Vault & {email_address?: string}
  }
  purchase_units?: {payments?: {captures?: {id: string; status: string}[]}}[]
}

/** Captures an approved order: the money moves now. A vault with the purchase hands back the payment token here. */
export const POST = (_request: Request, {id}: {id: string}) =>
  respond(async () => {
    const order = await paypalApi<Capture>(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {})
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0]
    const source = order.payment_source

    return {
      captureId: capture?.id,
      captureStatus: capture?.status,
      id: order.id,
      payerEmail: source?.paypal?.email_address,
      status: order.status,
      vaultId: source?.paypal?.attributes?.vault?.id ?? source?.card?.attributes?.vault?.id,
    }
  })

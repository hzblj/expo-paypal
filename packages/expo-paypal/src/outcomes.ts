import {PayPalError, type PayPalErrorCode} from './errors'
import type {NativeOutcome, NativeRestoredOutcome} from './native'
import type {
  PayPalCardCheckoutResult,
  PayPalCardVaultResult,
  PayPalCheckoutResult,
  PayPalRestoredResult,
  PayPalVaultResult,
} from './types'

type Failed = Extract<NativeOutcome, {status: 'failed'}>
type Approved = Extract<NativeOutcome, {status: 'approved'}>

const NATIVE_CODES: readonly PayPalErrorCode[] = ['INVALID_ARGUMENT', 'IN_PROGRESS', 'NOT_CONFIGURED', 'UNAVAILABLE']

export const outcomeError = (outcome: Failed): PayPalError => {
  const code = NATIVE_CODES.find(known => known === outcome.code) ?? 'FAILED'

  return new PayPalError(code, outcome.message || 'PayPal failed without a message.', {
    correlationId: outcome.correlationId || undefined,
    nativeCode: outcome.nativeCode ?? undefined,
    nativeDomain: outcome.nativeDomain || undefined,
  })
}

/** Anything but approval or cancellation throws: the flow's promise rejects with a `PayPalError`. */
const settle = <T>(outcome: NativeOutcome, approved: (outcome: Approved) => T, canceled: () => T): T => {
  switch (outcome?.status) {
    case 'approved':
      return approved(outcome)
    case 'canceled':
      return canceled()
    case 'failed':
      throw outcomeError(outcome)
    default:
      throw new PayPalError('FAILED', `PayPal ended with an unknown outcome: ${JSON.stringify(outcome)}.`)
  }
}

export const checkoutResult = (outcome: NativeOutcome, orderId: string): PayPalCheckoutResult =>
  settle<PayPalCheckoutResult>(
    outcome,
    ({orderId: approvedOrderId, payerId}) => ({
      orderId: approvedOrderId || orderId,
      payerId: payerId ?? '',
      status: 'approved',
    }),
    () => ({orderId, status: 'canceled'})
  )

export const vaultResult = (outcome: NativeOutcome, setupTokenId: string): PayPalVaultResult =>
  settle<PayPalVaultResult>(
    outcome,
    ({approvalSessionId}) => ({approvalSessionId: approvalSessionId ?? '', setupTokenId, status: 'approved'}),
    () => ({setupTokenId, status: 'canceled'})
  )

export const cardCheckoutResult = (outcome: NativeOutcome, orderId: string): PayPalCardCheckoutResult =>
  settle<PayPalCardCheckoutResult>(
    outcome,
    ({orderId: approvedOrderId, orderStatus, threeDSecureAttempted}) => ({
      orderId: approvedOrderId || orderId,
      ...(orderStatus ? {orderStatus} : {}),
      status: 'approved',
      threeDSecureAttempted: threeDSecureAttempted === true,
    }),
    () => ({orderId, status: 'canceled'})
  )

export const cardVaultResult = (outcome: NativeOutcome, setupTokenId: string): PayPalCardVaultResult =>
  settle<PayPalCardVaultResult>(
    outcome,
    ({setupTokenStatus, threeDSecureAttempted}) => ({
      setupTokenId,
      ...(setupTokenStatus ? {setupTokenStatus} : {}),
      status: 'approved',
      threeDSecureAttempted: threeDSecureAttempted === true,
    }),
    () => ({setupTokenId, status: 'canceled'})
  )

/** A restored failure is returned, not thrown: nobody is awaiting it, and the app still wants to know. */
export const restoredResult = ({flow, id, outcome}: NativeRestoredOutcome): PayPalRestoredResult => {
  if (outcome?.status === 'failed') {
    return {error: outcomeError(outcome), flow}
  }

  switch (flow) {
    case 'checkout':
      return {flow, result: checkoutResult(outcome, id)}
    case 'vault':
      return {flow, result: vaultResult(outcome, id)}
    case 'checkoutWithCard':
      return {flow, result: cardCheckoutResult(outcome, id)}
    case 'vaultCard':
      return {flow, result: cardVaultResult(outcome, id)}
    default:
      return {error: new PayPalError('FAILED', `PayPal restored an unknown flow: ${String(flow)}.`), flow}
  }
}

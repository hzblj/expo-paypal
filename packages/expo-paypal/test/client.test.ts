import assert from 'node:assert/strict'
import {test} from 'node:test'

import {createPayPal} from '../src/client'
import {PayPalError, type PayPalErrorCode} from '../src/errors'
import type {NativeOutcome, NativeRestoredOutcome, PayPalNativeModule} from '../src/native'

type Call = {method: string; args: unknown[]}

/** A native module that records every call and answers with what the test queued. */
const fakeNative = (outcome: NativeOutcome = {status: 'canceled'}) => {
  const calls: Call[] = []
  const record = (method: string, args: unknown[]) => calls.push({args, method})
  const state = {
    deviceData: 'metadata-id',
    outcome,
    rejection: null as Error | null,
    restored: null as NativeRestoredOutcome | null,
  }
  const answer = async (method: string, args: unknown[]) => {
    record(method, args)

    if (state.rejection) {
      throw state.rejection
    }

    return state.outcome
  }

  const native: PayPalNativeModule = {
    checkout: (...args) => answer('checkout', args),
    checkoutWithCard: (...args) => answer('checkoutWithCard', args),
    collectDeviceData: async (...args) => {
      record('collectDeviceData', args)
      return state.deviceData
    },
    links: {returnUrl: 'https://shop.example.com/paypal', scheme: 'shop'},
    preparePayPalSession: (...args) => {
      record('preparePayPalSession', args)
    },
    takeRestoredResult: async () => {
      record('takeRestoredResult', [])
      const restored = state.restored
      state.restored = null
      return restored
    },
    vault: (...args) => answer('vault', args),
    vaultCard: (...args) => answer('vaultCard', args),
  }

  return {calls, native, state}
}

const config = {clientId: 'client', environment: 'sandbox', merchantId: 'merchant'} as const

const card = {expirationMonth: 1, expirationYear: 2030, number: '4111111111111111', securityCode: '123'}

const nativeConfig = {
  cancelUrl: 'https://shop.example.com/paypal/cancel',
  clientId: 'client',
  environment: 'sandbox',
  merchantId: 'merchant',
  returnUrl: 'https://shop.example.com/paypal/success',
  scheme: 'shop',
}

const rejectsWith = async (promise: Promise<unknown>, code: PayPalErrorCode, message?: RegExp) =>
  assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof PayPalError, `expected a PayPalError, got ${String(error)}`)
    assert.equal(error.code, code)

    if (message) {
      assert.match(error.message, message)
    }

    return true
  })

test('without the native module every flow is unavailable, and nothing throws at configure', async () => {
  const paypal = createPayPal(null)

  paypal.configure(config)

  assert.equal(paypal.isAvailable(), false)
  await rejectsWith(paypal.checkout({orderId: 'O'}), 'UNAVAILABLE', /development build/)
  await rejectsWith(paypal.collectDeviceData(), 'UNAVAILABLE')
  assert.equal(await paypal.takeRestoredResult(), null)
  assert.equal(paypal.isReturnUrl('shop://x-callback-url/paypal-sdk/paypal-checkout'), false)
})

test('a flow before configure() says so', async () => {
  const {native} = fakeNative()

  await rejectsWith(createPayPal(native).checkout({orderId: 'O'}), 'NOT_CONFIGURED')
})

test('configure() validates what it is given', () => {
  const paypal = createPayPal(fakeNative().native)
  const invalid = (input: unknown, message: RegExp) =>
    assert.throws(
      () => paypal.configure(input as typeof config),
      (error: unknown) =>
        error instanceof PayPalError && error.code === 'INVALID_ARGUMENT' && message.test(error.message)
    )

  invalid({...config, clientId: ' '}, /clientId/)
  invalid({...config, merchantId: undefined}, /merchantId/)
  invalid({...config, environment: 'production'}, /sandbox" or "live/)
  invalid({...config, returnUrl: 'http://shop.example.com'}, /must be https/)
  invalid({...config, scheme: 'Shop'}, /lower-case/)
})

test('checkout starts the session before the order exists, then approves it', async () => {
  const {calls, native} = fakeNative({orderId: 'ORDER-1', payerId: 'PAYER', status: 'approved'})
  const paypal = createPayPal(native)
  let orderCreatedAfterSession = false

  paypal.configure(config)

  const result = await paypal.checkout({
    buyer: {email: 'buyer@example.com', phone: {countryCode: '+420', nationalNumber: '777 123 456'}},
    orderId: async () => {
      orderCreatedAfterSession = calls.some(call => call.method === 'preparePayPalSession')
      return 'ORDER-1'
    },
    userAction: 'payNow',
  })

  assert.equal(orderCreatedAfterSession, true)
  assert.deepEqual(result, {orderId: 'ORDER-1', payerId: 'PAYER', status: 'approved'})
  assert.deepEqual(calls, [
    {
      args: [
        nativeConfig,
        'checkout',
        {email: 'buyer@example.com', phone: {countryCode: '420', nationalNumber: '777123456'}},
        'payNow',
      ],
      method: 'preparePayPalSession',
    },
    {args: [nativeConfig, 'ORDER-1'], method: 'checkout'},
  ])
})

test('checkout takes the order ID as a string or a promise', async () => {
  const {native} = fakeNative({orderId: 'A', payerId: 'P', status: 'approved'})
  const paypal = createPayPal(native)

  paypal.configure(config)

  assert.equal((await paypal.checkout({orderId: 'A'})).status, 'approved')
  assert.equal((await paypal.checkout({orderId: Promise.resolve('A')})).status, 'approved')
})

test('a cancellation resolves with the order it was for', async () => {
  const {native} = fakeNative({status: 'canceled'})
  const paypal = createPayPal(native)

  paypal.configure(config)

  assert.deepEqual(await paypal.checkout({orderId: 'ORDER-2'}), {orderId: 'ORDER-2', status: 'canceled'})
})

test('a failure rejects with the native details', async () => {
  const {native} = fakeNative({
    correlationId: 'corr',
    message: 'Failed to create PayPal Session',
    nativeCode: 8,
    nativeDomain: 'PayPalClientErrorDomain',
    status: 'failed',
  })
  const paypal = createPayPal(native)

  paypal.configure(config)

  await assert.rejects(paypal.checkout({orderId: 'O'}), (error: unknown) => {
    assert.ok(error instanceof PayPalError)
    assert.equal(error.code, 'FAILED')
    assert.equal(error.message, 'Failed to create PayPal Session')
    assert.equal(error.nativeCode, 8)
    assert.equal(error.nativeDomain, 'PayPalClientErrorDomain')
    assert.equal(error.correlationId, 'corr')
    return true
  })
})

test('a refusal from the native module keeps its code', async () => {
  const {native} = fakeNative({code: 'IN_PROGRESS', message: 'busy', status: 'failed'})
  const paypal = createPayPal(native)

  paypal.configure(config)

  await rejectsWith(paypal.vault({setupTokenId: 'T'}), 'IN_PROGRESS', /busy/)
})

test('a native rejection still reaches the app as a PayPalError', async () => {
  const {native, state} = fakeNative()
  const paypal = createPayPal(native)

  paypal.configure(config)
  state.rejection = new Error('Argument conversion failed')

  await rejectsWith(paypal.checkout({orderId: 'O'}), 'FAILED', /Argument conversion failed/)
})

test("the app's own error while creating the order passes through untouched", async () => {
  const {calls, native} = fakeNative()
  const paypal = createPayPal(native)
  const serverError = new Error('Server down')

  paypal.configure(config)

  await assert.rejects(
    paypal.checkout({
      orderId: () => {
        throw serverError
      },
    }),
    serverError
  )
  assert.equal(
    calls.some(call => call.method === 'checkout'),
    false
  )
})

test('an empty order ID is refused', async () => {
  const {native} = fakeNative()
  const paypal = createPayPal(native)

  paypal.configure(config)

  await rejectsWith(paypal.checkout({orderId: async () => ' '}), 'INVALID_ARGUMENT', /orderId/)
})

test('flows run one at a time, and the next may start once one ends', async () => {
  const {native} = fakeNative({orderId: 'A', payerId: 'P', status: 'approved'})
  const paypal = createPayPal(native)
  let createOrder: (id: string) => void = () => undefined

  paypal.configure(config)

  const first = paypal.checkout({
    orderId: () =>
      new Promise<string>(resolve => {
        createOrder = resolve
      }),
  })

  await rejectsWith(paypal.checkoutWithCard({card, orderId: 'B'}), 'IN_PROGRESS', /checkout/)
  createOrder('A')
  assert.equal((await first).status, 'approved')
  assert.equal((await paypal.checkout({orderId: 'A'})).status, 'approved')
})

test('an invalid userAction is refused before anything starts', async () => {
  const {calls, native} = fakeNative()
  const paypal = createPayPal(native)

  paypal.configure(config)

  await rejectsWith(paypal.checkout({orderId: 'O', userAction: 'setupNow' as 'payNow'}), 'INVALID_ARGUMENT')
  assert.equal(calls.length, 0)
})

test('vault prepares a vault session and resolves with the approval', async () => {
  const {calls, native} = fakeNative({approvalSessionId: 'APPROVAL', status: 'approved'})
  const paypal = createPayPal(native)

  paypal.configure(config)

  assert.deepEqual(await paypal.vault({buyer: {sessionId: 'SESSION'}, setupTokenId: 'TOKEN', userAction: 'setupNow'}), {
    approvalSessionId: 'APPROVAL',
    setupTokenId: 'TOKEN',
    status: 'approved',
  })
  assert.deepEqual(calls[0], {
    args: [nativeConfig, 'vault', {sessionId: 'SESSION'}, 'setupNow'],
    method: 'preparePayPalSession',
  })
})

test('a card checkout sends the normalized card and reports 3D Secure', async () => {
  const {calls, native} = fakeNative({orderStatus: 'APPROVED', status: 'approved', threeDSecureAttempted: true})
  const paypal = createPayPal(native)

  paypal.configure(config)

  assert.deepEqual(await paypal.checkoutWithCard({card, orderId: 'ORDER', threeDSecure: 'always'}), {
    orderId: 'ORDER',
    orderStatus: 'APPROVED',
    status: 'approved',
    threeDSecureAttempted: true,
  })
  assert.deepEqual(calls, [
    {
      args: [
        nativeConfig,
        'ORDER',
        {expirationMonth: '01', expirationYear: '2030', number: '4111111111111111', securityCode: '123'},
        'always',
      ],
      method: 'checkoutWithCard',
    },
  ])
})

test('a malformed card is refused before the order is created', async () => {
  const {native} = fakeNative()
  const paypal = createPayPal(native)
  let created = false

  paypal.configure(config)

  await rejectsWith(
    paypal.checkoutWithCard({
      card: {...card, number: '1'},
      orderId: async () => {
        created = true
        return 'O'
      },
    }),
    'INVALID_ARGUMENT'
  )
  assert.equal(created, false)
})

test('a card vault resolves with the setup token', async () => {
  const {native} = fakeNative({setupTokenStatus: 'APPROVED', status: 'approved', threeDSecureAttempted: false})
  const paypal = createPayPal(native)

  paypal.configure(config)

  assert.deepEqual(await paypal.vaultCard({card, setupTokenId: 'TOKEN'}), {
    setupTokenId: 'TOKEN',
    setupTokenStatus: 'APPROVED',
    status: 'approved',
    threeDSecureAttempted: false,
  })
  assert.deepEqual(await createCanceled().vaultCard({card, setupTokenId: 'T'}), {setupTokenId: 'T', status: 'canceled'})
})

const createCanceled = () => {
  const paypal = createPayPal(fakeNative({status: 'canceled'}).native)
  paypal.configure(config)
  return paypal
}

test('device data passes the consent and the extra data through', async () => {
  const {calls, native} = fakeNative()
  const paypal = createPayPal(native)

  paypal.configure(config)

  assert.equal(
    await paypal.collectDeviceData({additionalData: {cart: '3'}, hasUserLocationConsent: true}),
    'metadata-id'
  )
  assert.deepEqual(calls, [{args: [nativeConfig, true, {cart: '3'}], method: 'collectDeviceData'}])
})

test('the overrides in configure() replace the plugin links', async () => {
  const {calls, native} = fakeNative()
  const paypal = createPayPal(native)

  paypal.configure({...config, bnCode: 'BN', returnUrl: 'https://other.example.com/pp', scheme: 'other'})
  await paypal.collectDeviceData()

  assert.deepEqual(calls[0]?.args[0], {
    bnCode: 'BN',
    cancelUrl: 'https://other.example.com/pp/cancel',
    clientId: 'client',
    environment: 'sandbox',
    merchantId: 'merchant',
    returnUrl: 'https://other.example.com/pp/success',
    scheme: 'other',
  })
  assert.equal(paypal.isReturnUrl('https://other.example.com/pp/success?token=1'), true)
  assert.equal(paypal.isReturnUrl('https://shop.example.com/paypal/success'), false)
})

test('isReturnUrl works before configure(), from the plugin links', () => {
  const paypal = createPayPal(fakeNative().native)

  assert.equal(paypal.isReturnUrl('https://shop.example.com/paypal/cancel'), true)
  assert.equal(paypal.isReturnUrl('shop://x-callback-url/paypal-sdk/paypal-checkout?token=1'), true)
  assert.equal(paypal.isReturnUrl('shop://orders/1'), false)
})

test('a restored result is handed over once, a failure as an error', async () => {
  const {native, state} = fakeNative()
  const paypal = createPayPal(native)

  state.restored = {flow: 'checkout', id: 'ORDER', outcome: {orderId: 'ORDER', payerId: 'P', status: 'approved'}}
  assert.deepEqual(await paypal.takeRestoredResult(), {
    flow: 'checkout',
    result: {orderId: 'ORDER', payerId: 'P', status: 'approved'},
  })
  assert.equal(await paypal.takeRestoredResult(), null)

  state.restored = {flow: 'vault', id: 'TOKEN', outcome: {status: 'canceled'}}
  assert.deepEqual(await paypal.takeRestoredResult(), {
    flow: 'vault',
    result: {setupTokenId: 'TOKEN', status: 'canceled'},
  })

  state.restored = {flow: 'checkoutWithCard', id: 'ORDER', outcome: {message: '3DS failed', status: 'failed'}}
  const restored = await paypal.takeRestoredResult()

  assert.equal(restored?.flow, 'checkoutWithCard')
  assert.ok(restored?.error instanceof PayPalError)
  assert.equal(restored.error.message, '3DS failed')
})

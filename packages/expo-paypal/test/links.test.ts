import assert from 'node:assert/strict'
import {test} from 'node:test'

import {PayPalError} from '../src/errors'
import {isReturnUrl, resolveLinks} from '../src/links'

const throwsInvalid = (run: () => unknown, message: RegExp) =>
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof PayPalError)
    assert.equal(error.code, 'INVALID_ARGUMENT')
    assert.match(error.message, message)
    return true
  })

test('derives the success and cancel links from the https base', () => {
  assert.deepEqual(resolveLinks({returnUrl: 'https://shop.example.com/paypal/', scheme: 'shop'}), {
    cancelUrl: 'https://shop.example.com/paypal/cancel',
    returnUrl: 'https://shop.example.com/paypal',
    scheme: 'shop',
    successUrl: 'https://shop.example.com/paypal/success',
  })
})

test('works with the scheme alone', () => {
  assert.deepEqual(resolveLinks({scheme: 'shop'}), {cancelUrl: '', scheme: 'shop', successUrl: ''})
})

test('a base at the root of the host has no trailing slash', () => {
  assert.equal(
    resolveLinks({returnUrl: 'https://shop.example.com', scheme: 'shop'}).successUrl,
    'https://shop.example.com/success'
  )
})

test('needs a lower-case scheme', () => {
  throwsInvalid(() => resolveLinks({}), /needs a URL scheme/)
  throwsInvalid(() => resolveLinks({scheme: 'Shop'}), /lower-case URL scheme/)
  throwsInvalid(() => resolveLinks({scheme: '1shop'}), /lower-case URL scheme/)
})

test('refuses a return link both SDKs would misread', () => {
  throwsInvalid(() => resolveLinks({returnUrl: 'http://shop.example.com/paypal', scheme: 'shop'}), /must be https/)
  throwsInvalid(() => resolveLinks({returnUrl: 'not a url', scheme: 'shop'}), /is not a URL/)
  throwsInvalid(() => resolveLinks({returnUrl: 'https://shop.example.com/p?x=1', scheme: 'shop'}), /query/)
  throwsInvalid(() => resolveLinks({returnUrl: 'https://shop.example.com/cancelled', scheme: 'shop'}), /"cancel"/)
})

test('recognises the returns under the https base', () => {
  const links = {returnUrl: 'https://shop.example.com/paypal', scheme: 'shop'}

  assert.equal(isReturnUrl('https://shop.example.com/paypal/success?token=1&PayerID=2', links), true)
  assert.equal(isReturnUrl('https://shop.example.com/paypal/cancel', links), true)
  assert.equal(isReturnUrl('https://shop.example.com/paypal', links), true)
  assert.equal(isReturnUrl('HTTPS://SHOP.EXAMPLE.COM/paypal/success', links), true)
  assert.equal(isReturnUrl('https://shop.example.com/paypals', links), false)
  assert.equal(isReturnUrl('https://shop.example.com/products/1', links), false)
})

test('recognises the SDKs returns under the scheme, and nothing else there', () => {
  const links = {scheme: 'shop'}

  assert.equal(isReturnUrl('shop://x-callback-url/paypal-sdk/paypal-checkout?token=1&PayerID=2', links), true)
  assert.equal(isReturnUrl('shop://x-callback-url/paypal-sdk/card-contingency?state=1', links), true)
  assert.equal(isReturnUrl('shop://products/1', links), false)
  assert.equal(isReturnUrl('other://x-callback-url/paypal-sdk/paypal-checkout', links), false)
})

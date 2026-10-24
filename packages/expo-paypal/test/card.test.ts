import assert from 'node:assert/strict'
import {test} from 'node:test'

import {normalizeCard} from '../src/card'
import {PayPalError} from '../src/errors'
import type {PayPalCard} from '../src/types'

const card: PayPalCard = {
  expirationMonth: 1,
  expirationYear: 2030,
  number: '4111 1111 1111 1111',
  securityCode: '123',
}

const throwsInvalid = (input: unknown, message: RegExp) =>
  assert.throws(
    () => normalizeCard(input as PayPalCard),
    (error: unknown) => {
      assert.ok(error instanceof PayPalError)
      assert.equal(error.code, 'INVALID_ARGUMENT')
      assert.match(error.message, message)
      return true
    }
  )

test('puts the card in the form both SDKs take', () => {
  assert.deepEqual(normalizeCard(card), {
    expirationMonth: '01',
    expirationYear: '2030',
    number: '4111111111111111',
    securityCode: '123',
  })
})

test('takes a two-digit year and a month as text', () => {
  const normalized = normalizeCard({
    ...card,
    expirationMonth: '12',
    expirationYear: '31',
    number: '4111-1111-1111-1111',
  })

  assert.equal(normalized.expirationMonth, '12')
  assert.equal(normalized.expirationYear, '2031')
  assert.equal(normalized.number, '4111111111111111')
})

test('keeps the name and address, trimmed, and drops what is empty', () => {
  const normalized = normalizeCard({
    ...card,
    billingAddress: {addressLine1: ' Main 1 ', addressLine2: '  ', countryCode: 'cz', postalCode: '11000'},
    cardholderName: ' Jan Novak ',
  })

  assert.equal(normalized.cardholderName, 'Jan Novak')
  assert.deepEqual(normalized.billingAddress, {addressLine1: 'Main 1', countryCode: 'CZ', postalCode: '11000'})
  assert.equal(normalizeCard({...card, cardholderName: ' '}).cardholderName, undefined)
})

test('refuses a malformed card with what to fix', () => {
  throwsInvalid(undefined, /card is required/)
  throwsInvalid({...card, number: '4111'}, /12 to 19 digits/)
  throwsInvalid({...card, number: '4111 1111 1111 111x'}, /12 to 19 digits/)
  throwsInvalid({...card, securityCode: '12'}, /3 or 4 digits/)
  throwsInvalid({...card, expirationMonth: 13}, /1 to 12/)
  throwsInvalid({...card, expirationMonth: 0}, /1 to 12/)
  throwsInvalid({...card, expirationYear: 202}, /four digits/)
  throwsInvalid({...card, billingAddress: {countryCode: 'CZE'}}, /two letters/)
})

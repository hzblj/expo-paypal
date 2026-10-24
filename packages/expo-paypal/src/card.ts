import {PayPalError} from './errors'
import type {PayPalAddress, PayPalCard} from './types'

/** A card as both SDKs take it: digits only, `MM` and `YYYY`. */
export type NativeCard = {
  billingAddress?: PayPalAddress
  cardholderName?: string
  expirationMonth: string
  expirationYear: string
  number: string
  securityCode: string
}

const invalid = (message: string): never => {
  throw new PayPalError('INVALID_ARGUMENT', message)
}

const digits = (value: number | string): string => String(value).trim()

const normalizeMonth = (value: number | string): string => {
  const text = digits(value)
  const month = Number(text)

  if (!/^\d{1,2}$/.test(text) || month < 1 || month > 12) {
    return invalid(`card.expirationMonth must be 1 to 12, not "${text}".`)
  }

  return String(month).padStart(2, '0')
}

const normalizeYear = (value: number | string): string => {
  const text = digits(value)

  if (/^\d{2}$/.test(text)) {
    return `20${text}`
  }

  if (!/^\d{4}$/.test(text)) {
    return invalid(`card.expirationYear must have four digits, or two, not "${text}".`)
  }

  return text
}

const optional = (value: string | undefined): string | undefined => {
  const text = value?.trim()

  return text ? text : undefined
}

const normalizeAddress = (address: PayPalAddress): PayPalAddress => {
  const countryCode = address.countryCode?.trim().toUpperCase() ?? ''

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return invalid(`card.billingAddress.countryCode must be two letters (ISO 3166-1), not "${countryCode}".`)
  }

  const normalized: PayPalAddress = {countryCode}
  const fields = ['addressLine1', 'addressLine2', 'locality', 'postalCode', 'region'] as const

  for (const field of fields) {
    const value = optional(address[field])

    if (value) {
      normalized[field] = value
    }
  }

  return normalized
}

/**
 * Checks the shape of the card and puts it in the form both SDKs take. It doesn't judge the card itself (the Luhn
 * check, the brand, the expiry date): that is the card form's job, and PayPal declines what is wrong.
 */
export const normalizeCard = (card: PayPalCard | undefined): NativeCard => {
  if (!card || typeof card !== 'object') {
    return invalid('card is required.')
  }

  const number = String(card.number ?? '').replace(/[\s-]/g, '')

  if (!/^\d{12,19}$/.test(number)) {
    return invalid('card.number must have 12 to 19 digits.')
  }

  const securityCode = String(card.securityCode ?? '').trim()

  if (!/^\d{3,4}$/.test(securityCode)) {
    return invalid('card.securityCode must have 3 or 4 digits.')
  }

  const normalized: NativeCard = {
    expirationMonth: normalizeMonth(card.expirationMonth),
    expirationYear: normalizeYear(card.expirationYear),
    number,
    securityCode,
  }

  const cardholderName = optional(card.cardholderName)

  if (cardholderName) {
    normalized.cardholderName = cardholderName
  }

  if (card.billingAddress) {
    normalized.billingAddress = normalizeAddress(card.billingAddress)
  }

  return normalized
}

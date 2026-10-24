import {PayPalError} from './errors'

/** Where PayPal sends the buyer back: the config plugin's values, or `PayPal.configure()`'s overrides. */
export type PayPalLinks = {
  returnUrl?: string
  scheme?: string
}

export type ResolvedLinks = {
  /** The https base, without a trailing slash, when there is one. */
  returnUrl?: string
  /** `<returnUrl>/success`, or empty without an https base. */
  successUrl: string
  /** `<returnUrl>/cancel`, or empty without an https base. */
  cancelUrl: string
  scheme: string
}

/** The path both SDKs give a custom-scheme return: `<scheme>://x-callback-url/paypal-sdk/…`. */
export const SDK_CALLBACK_PATH = 'x-callback-url/paypal-sdk/'

// Lower case only: Android matches intent-filter schemes case-sensitively and expects them in lower case.
const SCHEME = /^[a-z][a-z0-9+.-]*$/

const invalid = (message: string): never => {
  throw new PayPalError('INVALID_ARGUMENT', message)
}

const resolveScheme = (scheme: string | undefined): string => {
  if (!scheme) {
    return invalid(
      'PayPal needs a URL scheme to return to the app. Set `scheme` in the config plugin, or the app config’s `scheme`.'
    )
  }

  if (!SCHEME.test(scheme)) {
    return invalid(
      `The PayPal return scheme "${scheme}" is not a lower-case URL scheme (a letter, then letters, digits, +, . or -).`
    )
  }

  return scheme
}

const resolveReturnUrl = (returnUrl: string): string => {
  let url: URL

  try {
    url = new URL(returnUrl)
  } catch {
    return invalid(`The PayPal returnUrl "${returnUrl}" is not a URL.`)
  }

  if (url.protocol !== 'https:') {
    return invalid(`The PayPal returnUrl "${returnUrl}" must be https: it is a Universal Link and an App Link.`)
  }

  if (url.search || url.hash) {
    return invalid(`The PayPal returnUrl "${returnUrl}" can't have a query or a fragment.`)
  }

  // Both SDKs read a return whose path contains "cancel" as a cancellation, the success link included.
  if (url.pathname.toLowerCase().includes('cancel')) {
    return invalid(`The PayPal returnUrl "${returnUrl}" can't contain "cancel" in its path.`)
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/** Validates the links and derives the URLs both SDKs take. Throws `INVALID_ARGUMENT` with what to fix. */
export const resolveLinks = ({returnUrl, scheme}: PayPalLinks): ResolvedLinks => {
  const resolvedScheme = resolveScheme(scheme)

  if (!returnUrl) {
    return {cancelUrl: '', scheme: resolvedScheme, successUrl: ''}
  }

  const base = resolveReturnUrl(returnUrl)

  return {cancelUrl: `${base}/cancel`, returnUrl: base, scheme: resolvedScheme, successUrl: `${base}/success`}
}

const startsWithIgnoringCase = (value: string, prefix: string): boolean =>
  value.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()

/**
 * Whether a URL is PayPal bringing the buyer back: under the https `returnUrl`, or the SDKs' path under the scheme.
 * Those URLs belong to the PayPal SDK, not to the app's navigation.
 */
export const isReturnUrl = (url: string, links: Pick<ResolvedLinks, 'returnUrl' | 'scheme'>): boolean => {
  if (startsWithIgnoringCase(url, `${links.scheme}://${SDK_CALLBACK_PATH}`)) {
    return true
  }

  const base = links.returnUrl

  if (!base || !startsWithIgnoringCase(url, base)) {
    return false
  }

  const rest = url.slice(base.length)

  return rest === '' || rest.startsWith('/') || rest.startsWith('?')
}

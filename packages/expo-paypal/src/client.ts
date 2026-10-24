import {normalizeCard} from './card'
import {PayPalError} from './errors'
import {isReturnUrl, type PayPalLinks, resolveLinks} from './links'
import type {NativeBuyer, NativeConfig, PayPalNativeModule} from './native'
import {cardCheckoutResult, cardVaultResult, checkoutResult, restoredResult, vaultResult} from './outcomes'
import type {
  PayPalBuyer,
  PayPalCardCheckoutOptions,
  PayPalCardCheckoutResult,
  PayPalCardVaultOptions,
  PayPalCardVaultResult,
  PayPalCheckoutOptions,
  PayPalCheckoutResult,
  PayPalConfig,
  PayPalDeviceDataOptions,
  PayPalFlow,
  PayPalPendingId,
  PayPalRestoredResult,
  PayPalVaultOptions,
  PayPalVaultResult,
} from './types'

export type PayPalApi = {
  /**
   * Sets the account every call uses. Call it once at startup, or again before a flow when the account comes from
   * your server. Throws `INVALID_ARGUMENT` for a missing or malformed value.
   */
  configure(config: PayPalConfig): void
  /** Whether this build has the native module: `false` in Expo Go, on web and in tests. */
  isAvailable(): boolean
  /**
   * Whether a URL is PayPal bringing the buyer back. Those URLs reach the app's own linking too; skip them in your
   * router, as in Expo Router's `+native-intent.ts`.
   */
  isReturnUrl(url: string): boolean
  /**
   * PayPal Checkout: the buyer approves the order in the PayPal app (App Switch) or in an in-app browser, and the
   * promise resolves when they are back. Pay Later and PayPal Credit are this same flow, chosen when your server
   * creates the order. Capture the order on your server after `approved`.
   */
  checkout(options: PayPalCheckoutOptions): Promise<PayPalCheckoutResult>
  /** Saves the buyer's PayPal account without a purchase, against a setup token. */
  vault(options: PayPalVaultOptions): Promise<PayPalVaultResult>
  /** Approves an order with a card from your own form, through 3D Secure when the issuer asks for it. */
  checkoutWithCard(options: PayPalCardCheckoutOptions): Promise<PayPalCardCheckoutResult>
  /** Saves a card without a purchase, against a setup token, through 3D Secure when needed. */
  vaultCard(options: PayPalCardVaultOptions): Promise<PayPalCardVaultResult>
  /**
   * PayPal's risk data for this device: a client metadata ID. Send it to your server and set it as the
   * `PayPal-Client-Metadata-Id` header when you create the order, to lower declines.
   */
  collectDeviceData(options?: PayPalDeviceDataOptions): Promise<string>
  /**
   * The outcome of a flow the system interrupted by ending the app, once, or `null`. Ask for it when the app starts:
   * an approved order there still needs capturing.
   */
  takeRestoredResult(): Promise<PayPalRestoredResult | null>
}

const ENVIRONMENTS = ['sandbox', 'live'] as const

const invalid = (message: string): never => {
  throw new PayPalError('INVALID_ARGUMENT', message)
}

const requireText = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    return invalid(`${name} must be a non-empty string.`)
  }

  return value.trim()
}

const optionalText = (value: unknown, name: string): string | undefined =>
  value === undefined || value === null || value === '' ? undefined : requireText(value, name)

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T, name: string): T => {
  if (value === undefined) {
    return fallback
  }

  return allowed.find(option => option === value) ?? invalid(`${name} must be one of ${allowed.join(', ')}.`)
}

const validateConfig = (config: PayPalConfig): PayPalConfig => {
  if (!config || typeof config !== 'object') {
    return invalid('PayPal.configure() needs a config.')
  }

  const environment = ENVIRONMENTS.find(option => option === config.environment)

  if (!environment) {
    return invalid('environment must be "sandbox" or "live".')
  }

  return {
    bnCode: optionalText(config.bnCode, 'bnCode'),
    clientId: requireText(config.clientId, 'clientId'),
    environment,
    merchantId: requireText(config.merchantId, 'merchantId'),
    returnUrl: optionalText(config.returnUrl, 'returnUrl'),
    scheme: optionalText(config.scheme, 'scheme'),
  }
}

const nativeBuyer = (buyer: PayPalBuyer | undefined): NativeBuyer | null => {
  if (!buyer) {
    return null
  }

  if ('sessionId' in buyer) {
    return {sessionId: requireText(buyer.sessionId, 'buyer.sessionId')}
  }

  const email = optionalText(buyer.email, 'buyer.email')
  const phone = buyer.phone
    ? {
        countryCode: requireText(buyer.phone.countryCode, 'buyer.phone.countryCode').replace(/^\+/, ''),
        nationalNumber: requireText(buyer.phone.nationalNumber, 'buyer.phone.nationalNumber').replace(/\D/g, ''),
      }
    : undefined

  if (!email && !phone) {
    return null
  }

  return {...(email ? {email} : {}), ...(phone ? {phone} : {})}
}

/** Awaits an ID the app may still be creating. The app's own error (a failed server call) passes through as it is. */
const resolveId = async (pending: PayPalPendingId | undefined, name: string): Promise<string> =>
  requireText(await (typeof pending === 'function' ? pending() : pending), name)

/** A native rejection is a bug or a broken build, not an outcome; it still reaches the app as a `PayPalError`. */
const callNative = async <T>(call: () => Promise<T>): Promise<T> => {
  try {
    return await call()
  } catch (error) {
    if (error instanceof PayPalError) {
      throw error
    }

    throw new PayPalError('FAILED', error instanceof Error ? error.message : String(error))
  }
}

/**
 * The PayPal API over a native module, or over none (Expo Go, web, tests). Kept apart from the module lookup so the
 * logic runs, and is tested, without a device.
 */
export const createPayPal = (native: PayPalNativeModule | null): PayPalApi => {
  let config: PayPalConfig | null = null
  let running: PayPalFlow | null = null

  const requireNative = (): PayPalNativeModule =>
    native ??
    (() => {
      throw new PayPalError(
        'UNAVAILABLE',
        'PayPal is not in this build. It needs a development build with @hzblj/expo-paypal, not Expo Go or web.'
      )
    })()

  const links = (): PayPalLinks => ({
    returnUrl: config?.returnUrl ?? native?.links?.returnUrl ?? undefined,
    scheme: config?.scheme ?? native?.links?.scheme ?? undefined,
  })

  const nativeConfig = (): NativeConfig => {
    if (!config) {
      throw new PayPalError('NOT_CONFIGURED', 'Call PayPal.configure() with your client ID and merchant ID first.')
    }

    const {cancelUrl, scheme, successUrl} = resolveLinks(links())

    return {
      ...(config.bnCode ? {bnCode: config.bnCode} : {}),
      cancelUrl,
      clientId: config.clientId,
      environment: config.environment,
      merchantId: config.merchantId,
      returnUrl: successUrl,
      scheme,
    }
  }

  /** One flow at a time: a second shopper session would replace the first one's while it is still running. */
  const exclusive = async <T>(flow: PayPalFlow, body: () => Promise<T>): Promise<T> => {
    if (running) {
      throw new PayPalError('IN_PROGRESS', `PayPal is still running ${running}. Flows run one at a time.`)
    }

    running = flow

    try {
      return await body()
    } finally {
      running = null
    }
  }

  return {
    checkout: options =>
      exclusive('checkout', async () => {
        const module = requireNative()
        const current = nativeConfig()
        const userAction = oneOf(options?.userAction, ['continue', 'payNow'] as const, 'continue', 'userAction')

        module.preparePayPalSession(current, 'checkout', nativeBuyer(options?.buyer), userAction)

        const orderId = await resolveId(options?.orderId, 'orderId')

        return checkoutResult(await callNative(() => module.checkout(current, orderId)), orderId)
      }),

    checkoutWithCard: options =>
      exclusive('checkoutWithCard', async () => {
        const module = requireNative()
        const current = nativeConfig()
        const card = normalizeCard(options?.card)
        const threeDSecure = oneOf(
          options?.threeDSecure,
          ['whenRequired', 'always'] as const,
          'whenRequired',
          'threeDSecure'
        )
        const orderId = await resolveId(options?.orderId, 'orderId')
        const outcome = await callNative(() => module.checkoutWithCard(current, orderId, card, threeDSecure))

        return cardCheckoutResult(outcome, orderId)
      }),

    collectDeviceData: async options => {
      const module = requireNative()
      const current = nativeConfig()
      const additionalData = Object.fromEntries(
        Object.entries(options?.additionalData ?? {}).map(([key, value]) => [key, String(value)])
      )

      return callNative(() =>
        module.collectDeviceData(current, options?.hasUserLocationConsent === true, additionalData)
      )
    },

    configure: next => {
      const validated = validateConfig(next)

      if (native) {
        resolveLinks({
          returnUrl: validated.returnUrl ?? native.links?.returnUrl ?? undefined,
          scheme: validated.scheme ?? native.links?.scheme ?? undefined,
        })
      }

      config = validated
    },

    isAvailable: () => native !== null,

    isReturnUrl: url => {
      try {
        return typeof url === 'string' && isReturnUrl(url, resolveLinks(links()))
      } catch {
        return false
      }
    },

    takeRestoredResult: async () => {
      if (!native) {
        return null
      }

      const restored = await callNative(() => native.takeRestoredResult())

      return restored ? restoredResult(restored) : null
    },

    vault: options =>
      exclusive('vault', async () => {
        const module = requireNative()
        const current = nativeConfig()
        const userAction = oneOf(options?.userAction, ['continue', 'setupNow'] as const, 'continue', 'userAction')

        module.preparePayPalSession(current, 'vault', nativeBuyer(options?.buyer), userAction)

        const setupTokenId = await resolveId(options?.setupTokenId, 'setupTokenId')

        return vaultResult(await callNative(() => module.vault(current, setupTokenId)), setupTokenId)
      }),

    vaultCard: options =>
      exclusive('vaultCard', async () => {
        const module = requireNative()
        const current = nativeConfig()
        const card = normalizeCard(options?.card)
        const setupTokenId = await resolveId(options?.setupTokenId, 'setupTokenId')

        return cardVaultResult(await callNative(() => module.vaultCard(current, setupTokenId, card)), setupTokenId)
      }),
  }
}

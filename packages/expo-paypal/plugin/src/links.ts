/**
 * The plugin's copy of `src/links.ts`'s validation: the plugin is built for Node on its own and cannot import the
 * app's source. `plugin/test` asserts the two accept and reject the same values; change both or neither.
 */

export type PluginLinks = {
  /** The https base, without a trailing slash. */
  returnUrl?: string
  host?: string
  /** The base's path, for the App Link's `pathPrefix`; empty for the whole host. */
  pathPrefix?: string
  scheme: string
}

const SCHEME = /^[a-z][a-z0-9+.-]*$/

const fail = (message: string): never => {
  throw new Error(`[expo-paypal] ${message}`)
}

export const resolveScheme = (scheme: string | undefined): string => {
  if (!scheme) {
    return fail(
      "PayPal needs a URL scheme to return to the app. Set `scheme` in the app config, or the plugin's own: ['@hzblj/expo-paypal', {scheme: 'myapp'}]"
    )
  }

  if (!SCHEME.test(scheme)) {
    return fail(
      `The PayPal return scheme "${scheme}" is not a lower-case URL scheme (a letter, then letters, digits, +, . or -).`
    )
  }

  return scheme
}

export const resolveReturnUrl = (returnUrl: string): {base: string; host: string; pathPrefix: string} => {
  let url: URL

  try {
    url = new URL(returnUrl)
  } catch {
    return fail(`The PayPal returnUrl "${returnUrl}" is not a URL.`)
  }

  if (url.protocol !== 'https:') {
    return fail(`The PayPal returnUrl "${returnUrl}" must be https: it is a Universal Link and an App Link.`)
  }

  if (url.search || url.hash) {
    return fail(`The PayPal returnUrl "${returnUrl}" can't have a query or a fragment.`)
  }

  if (url.pathname.toLowerCase().includes('cancel')) {
    return fail(`The PayPal returnUrl "${returnUrl}" can't contain "cancel" in its path.`)
  }

  const pathPrefix = url.pathname.replace(/\/+$/, '')

  return {base: `${url.origin}${pathPrefix}`, host: url.hostname, pathPrefix}
}

/** The scheme falls back to the app config's own (the first, when it lists several). */
export const resolvePluginLinks = (
  options: {returnUrl?: string; scheme?: string} | undefined,
  appScheme: string | string[] | undefined
): PluginLinks => {
  const scheme = resolveScheme(options?.scheme ?? (Array.isArray(appScheme) ? appScheme[0] : appScheme))

  if (!options?.returnUrl) {
    return {scheme}
  }

  const {base, host, pathPrefix} = resolveReturnUrl(options.returnUrl)

  return {host, pathPrefix, returnUrl: base, scheme}
}

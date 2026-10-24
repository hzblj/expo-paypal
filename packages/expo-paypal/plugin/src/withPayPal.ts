import {
  AndroidConfig,
  type ConfigPlugin,
  type InfoPlist,
  withAndroidManifest,
  withEntitlementsPlist,
  withInfoPlist,
} from 'expo/config-plugins'

import {type PluginLinks, resolvePluginLinks} from './links'

export type PayPalPluginOptions = {
  /**
   * The https address PayPal returns to, as `<returnUrl>/success` and `<returnUrl>/cancel`: an iOS Universal Link and
   * an Android App Link, which the plugin registers (Associated Domains, a verified intent filter). It is what App
   * Switch (approval in the PayPal app) returns through. Your domain has to serve the
   * `apple-app-site-association` and `assetlinks.json` files for the app. Without it, PayPal returns through `scheme`.
   */
  returnUrl?: string
  /** The custom URL scheme PayPal falls back to, and Android's 3D Secure returns to. The app config's `scheme` by default. */
  scheme?: string
}

/** Where the native module reads the links: an Info.plist dictionary, and `<meta-data>` in the manifest. */
export const INFO_PLIST_KEY = 'ExpoPayPal'
export const META_DATA_RETURN_URL = 'com.hzblj.expopaypal.RETURN_URL'
export const META_DATA_SCHEME = 'com.hzblj.expopaypal.SCHEME'

const PAYPAL_APP_SCHEME = 'paypal'
const ASSOCIATED_DOMAINS = 'com.apple.developer.associated-domains'

/** The links for the native module, the scheme as a URL type, and the PayPal app among the queried schemes. */
export const addIosLinks = (infoPlist: InfoPlist, links: PluginLinks): InfoPlist => {
  const urlTypes = infoPlist.CFBundleURLTypes ?? []
  const queried = (infoPlist.LSApplicationQueriesSchemes ?? []) as string[]
  const hasScheme = urlTypes.some(type => type.CFBundleURLSchemes?.includes(links.scheme))

  return {
    ...infoPlist,
    CFBundleURLTypes: hasScheme ? urlTypes : [...urlTypes, {CFBundleURLSchemes: [links.scheme]}],
    [INFO_PLIST_KEY]: {Scheme: links.scheme, ...(links.returnUrl ? {ReturnURL: links.returnUrl} : {})},
    LSApplicationQueriesSchemes: queried.includes(PAYPAL_APP_SCHEME) ? queried : [...queried, PAYPAL_APP_SCHEME],
  }
}

export const addAssociatedDomain = <T extends Record<string, unknown>>(entitlements: T, host: string): T => {
  const domains = (entitlements[ASSOCIATED_DOMAINS] ?? []) as string[]
  const domain = `applinks:${host}`

  return domains.includes(domain) ? entitlements : {...entitlements, [ASSOCIATED_DOMAINS]: [...domains, domain]}
}

type ManifestData = Record<string, string>
type IntentFilter = {
  $?: Record<string, string>
  action?: {$: ManifestData}[]
  category?: {$: ManifestData}[]
  data?: {$: ManifestData}[]
}

const VIEW = 'android.intent.action.VIEW'
const CATEGORIES = ['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE']

const intentFilter = (data: ManifestData, autoVerify: boolean): IntentFilter => ({
  ...(autoVerify ? {$: {'android:autoVerify': 'true'}} : {}),
  action: [{$: {'android:name': VIEW}}],
  category: CATEGORIES.map(name => ({$: {'android:name': name}})),
  data: [{$: data}],
})

/** Whether a filter already routes exactly this to the activity, so a second prebuild adds no duplicate. */
const hasFilterFor = (filters: IntentFilter[], data: ManifestData): boolean =>
  filters.some(filter =>
    (filter.data ?? []).some(entry => {
      const attributes = entry.$ ?? {}
      const keys = Object.keys(data)

      return Object.keys(attributes).length === keys.length && keys.every(key => attributes[key] === data[key])
    })
  )

/**
 * The main activity's intent filters for both returns (the verified App Link, scoped to the return path, and the
 * scheme), and the links as `<meta-data>` for the native module.
 */
export const addAndroidLinks = (
  manifest: AndroidConfig.Manifest.AndroidManifest,
  links: PluginLinks
): AndroidConfig.Manifest.AndroidManifest => {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest)
  const filters = (activity['intent-filter'] ?? []) as IntentFilter[]

  if (links.host) {
    const appLink: ManifestData = {'android:host': links.host, 'android:scheme': 'https'}

    // A path keeps the filter from claiming every link on the host.
    if (links.pathPrefix) {
      appLink['android:pathPrefix'] = links.pathPrefix
    }

    if (!hasFilterFor(filters, appLink)) {
      filters.push(intentFilter(appLink, true))
    }
  }

  const deepLink: ManifestData = {'android:scheme': links.scheme}

  if (!hasFilterFor(filters, deepLink)) {
    filters.push(intentFilter(deepLink, false))
  }

  activity['intent-filter'] = filters as (typeof activity)['intent-filter']

  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)

  AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, META_DATA_SCHEME, links.scheme)

  if (links.returnUrl) {
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, META_DATA_RETURN_URL, links.returnUrl)
  } else {
    AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(application, META_DATA_RETURN_URL)
  }

  return manifest
}

/**
 * Registers the app for PayPal's returns on both platforms and hands the links to the native module. The links are
 * validated when the config is read, so a mistake fails `expo start` and prebuild with what to fix.
 */
export const withPayPal: ConfigPlugin<PayPalPluginOptions | undefined> = (config, options) => {
  const links = resolvePluginLinks(options, config.scheme)

  config = withInfoPlist(config, config => {
    config.modResults = addIosLinks(config.modResults, links)
    return config
  })

  if (links.host) {
    const host = links.host

    config = withEntitlementsPlist(config, config => {
      config.modResults = addAssociatedDomain(config.modResults, host)
      return config
    })
  }

  return withAndroidManifest(config, config => {
    config.modResults = addAndroidLinks(config.modResults, links)
    return config
  })
}

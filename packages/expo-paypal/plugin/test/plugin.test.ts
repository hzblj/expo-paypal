import assert from 'node:assert/strict'
import {test} from 'node:test'
import type {AndroidConfig} from 'expo/config-plugins'

import {resolveLinks} from '../../src/links'
import {resolvePluginLinks} from '../src/links'
import {addAndroidLinks, addAssociatedDomain, addIosLinks, INFO_PLIST_KEY, META_DATA_SCHEME} from '../src/withPayPal'

const manifest = (): AndroidConfig.Manifest.AndroidManifest => ({
  manifest: {
    $: {'xmlns:android': 'http://schemas.android.com/apk/res/android'},
    application: [
      {
        $: {'android:name': '.MainApplication'},
        activity: [
          {
            $: {'android:launchMode': 'singleTask', 'android:name': '.MainActivity'},
            'intent-filter': [
              {
                action: [{$: {'android:name': 'android.intent.action.MAIN'}}],
                category: [{$: {'android:name': 'android.intent.category.LAUNCHER'}}],
              },
            ],
          },
        ],
      },
    ],
    queries: [],
  },
})

const filtersOf = (value: AndroidConfig.Manifest.AndroidManifest) =>
  value.manifest.application?.[0]?.activity?.[0]?.['intent-filter'] ?? []

const metaDataOf = (value: AndroidConfig.Manifest.AndroidManifest) =>
  Object.fromEntries(
    (value.manifest.application?.[0]?.['meta-data'] ?? []).map(item => [
      item.$['android:name'],
      item.$['android:value'],
    ])
  )

const links = resolvePluginLinks({returnUrl: 'https://shop.example.com/paypal/'}, 'shop')

test('the scheme falls back to the app config, its first when it lists several', () => {
  assert.deepEqual(resolvePluginLinks(undefined, 'shop'), {scheme: 'shop'})
  assert.deepEqual(resolvePluginLinks(undefined, ['shop', 'shop-dev']), {scheme: 'shop'})
  assert.deepEqual(resolvePluginLinks({scheme: 'pay'}, 'shop'), {scheme: 'pay'})
  assert.deepEqual(links, {
    host: 'shop.example.com',
    pathPrefix: '/paypal',
    returnUrl: 'https://shop.example.com/paypal',
    scheme: 'shop',
  })
  assert.throws(() => resolvePluginLinks(undefined, undefined), /\[expo-paypal\] PayPal needs a URL scheme/)
})

test('the plugin accepts and refuses exactly what the app does', () => {
  const cases = [
    {returnUrl: 'https://shop.example.com/paypal', scheme: 'shop'},
    {returnUrl: 'https://shop.example.com', scheme: 'shop'},
    {scheme: 'com.example.shop'},
    {scheme: 'Shop'},
    {scheme: '9shop'},
    {scheme: ''},
    {returnUrl: 'http://shop.example.com/paypal', scheme: 'shop'},
    {returnUrl: 'https://shop.example.com/paypal?x=1', scheme: 'shop'},
    {returnUrl: 'https://shop.example.com/paypal#x', scheme: 'shop'},
    {returnUrl: 'https://shop.example.com/Cancel', scheme: 'shop'},
    {returnUrl: 'shop', scheme: 'shop'},
  ]
  const accepts = (run: () => unknown) => {
    try {
      run()
      return true
    } catch {
      return false
    }
  }

  for (const input of cases) {
    const app = accepts(() => resolveLinks(input))
    const plugin = accepts(() => resolvePluginLinks(input, undefined))

    assert.equal(plugin, app, `${JSON.stringify(input)}: the app ${app ? 'accepts' : 'refuses'} it`)

    if (app) {
      assert.equal(resolvePluginLinks(input, undefined).returnUrl, resolveLinks(input).returnUrl)
    }
  }
})

test('iOS: the links for the module, the scheme as a URL type and the PayPal app as a queried scheme', () => {
  const plist = addIosLinks({CFBundleURLTypes: [{CFBundleURLSchemes: ['other']}]}, links)

  assert.deepEqual(plist[INFO_PLIST_KEY], {ReturnURL: 'https://shop.example.com/paypal', Scheme: 'shop'})
  assert.deepEqual(plist.CFBundleURLTypes, [{CFBundleURLSchemes: ['other']}, {CFBundleURLSchemes: ['shop']}])
  assert.deepEqual(plist.LSApplicationQueriesSchemes, ['paypal'])
  assert.deepEqual(addIosLinks(plist, links), plist, 'a second prebuild changes nothing')
  assert.deepEqual(addIosLinks({}, {scheme: 'shop'})[INFO_PLIST_KEY], {Scheme: 'shop'})
})

test('iOS: the return host as an associated domain, once', () => {
  const entitlements = addAssociatedDomain(
    {'com.apple.developer.associated-domains': ['applinks:other.com']},
    'shop.example.com'
  )

  assert.deepEqual(entitlements['com.apple.developer.associated-domains'], [
    'applinks:other.com',
    'applinks:shop.example.com',
  ])
  assert.deepEqual(addAssociatedDomain(entitlements, 'shop.example.com'), entitlements)
})

test('Android: a verified App Link scoped to the return path, the scheme, and the links as meta-data', () => {
  const result = addAndroidLinks(manifest(), links)
  const filters = filtersOf(result)

  assert.equal(filters.length, 3)
  assert.deepEqual(filters[1], {
    $: {'android:autoVerify': 'true'},
    action: [{$: {'android:name': 'android.intent.action.VIEW'}}],
    category: [
      {$: {'android:name': 'android.intent.category.DEFAULT'}},
      {$: {'android:name': 'android.intent.category.BROWSABLE'}},
    ],
    data: [{$: {'android:host': 'shop.example.com', 'android:pathPrefix': '/paypal', 'android:scheme': 'https'}}],
  })
  assert.deepEqual(filters[2]?.data, [{$: {'android:scheme': 'shop'}}])
  assert.deepEqual(metaDataOf(result), {
    'com.hzblj.expopaypal.RETURN_URL': 'https://shop.example.com/paypal',
    [META_DATA_SCHEME]: 'shop',
  })
})

test('Android: a second prebuild adds nothing, and a removed returnUrl goes', () => {
  const twice = addAndroidLinks(addAndroidLinks(manifest(), links), links)

  assert.equal(filtersOf(twice).length, 3)

  const without = addAndroidLinks(twice, {scheme: 'shop'})

  assert.deepEqual(metaDataOf(without), {[META_DATA_SCHEME]: 'shop'})
})

test('Android: a link at the root of the host has no pathPrefix', () => {
  const result = addAndroidLinks(manifest(), resolvePluginLinks({returnUrl: 'https://pay.example.com'}, 'shop'))

  assert.deepEqual(filtersOf(result)[1]?.data, [{$: {'android:host': 'pay.example.com', 'android:scheme': 'https'}}])
})

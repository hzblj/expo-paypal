/**
 * Checks what npm would receive, the way a consumer meets it. Packs every published package (each `prepack` builds it
 * through turbo's cache), asserts what must and must not ship in each tarball, then installs it into a throwaway app
 * and type-checks real usage with a consumer's TypeScript: no `source` condition, no workspace links, only what the
 * tarball declares. The config plugin is loaded from the tarball too, the way prebuild loads it.
 *
 * The negative cases matter as much as the positive ones: if a declaration failed to resolve, its imports would
 * quietly become `any` and everything would compile, so each `@ts-expect-error` is there to prove the types are real.
 */
import {execFileSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const WORK = path.join(ROOT, '.pack-check')

const run = (command, args, cwd = ROOT) => execFileSync(command, args, {cwd, encoding: 'utf8'})

const fail = message => {
  console.error(`pack-check: ${message}`)
  process.exit(1)
}

const REQUIRED = {
  '@hzblj/expo-paypal': [
    'package.json',
    'README.md',
    'LICENSE',
    'app.plugin.js',
    'build/index.js',
    'build/index.d.ts',
    'src/index.ts',
    'plugin/build/index.js',
    'plugin/build/index.d.ts',
    'expo-module.config.json',
    'ios/ExpoPayPal.podspec',
    'ios/ExpoPayPalModule.swift',
    'ios/ExpoPayPalAppDelegateSubscriber.swift',
    'ios/Core/PayPalReturnLinks.swift',
    'android/build.gradle',
    'android/src/main/AndroidManifest.xml',
    'android/src/main/java/com/hzblj/expopaypal/ExpoPayPalModule.kt',
  ],
}

// The tests of all four and the build output of the native projects stay home. The TypeScript source ships: `exports`
// names it under the `source` condition.
const FORBIDDEN = [
  /^test\//,
  /^plugin\/(src|test)\//,
  /^ios\/Tests\//,
  /^android\/src\/test\//,
  /\/build\/intermediates\//,
  /\.DS_Store$/,
]

const packages = []

for (const directory of await readdir(path.join(ROOT, 'packages'))) {
  const manifestPath = path.join(ROOT, 'packages', directory, 'package.json')

  if (!existsSync(manifestPath)) {
    continue
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

  if (!manifest.private) {
    packages.push({directory, name: manifest.name})
  }
}

await rm(WORK, {force: true, recursive: true})
await mkdir(path.join(WORK, 'tarballs'), {recursive: true})

let fileCount = 0

for (const {directory, name} of packages) {
  const tarball = path.join(WORK, 'tarballs', `${directory}.tgz`)

  run('yarn', ['pack', '--out', tarball], path.join(ROOT, 'packages', directory))

  const files = run('tar', ['-tzf', tarball])
    .split('\n')
    .filter(Boolean)
    .map(file => file.replace(/^package\//, ''))

  const missing = (REQUIRED[name] ?? ['package.json', 'README.md']).filter(file => !files.includes(file))
  const leaked = files.filter(file => FORBIDDEN.some(pattern => pattern.test(file)))

  if (missing.length > 0) {
    fail(`${name} is missing:\n  ${missing.join('\n  ')}`)
  }

  if (leaked.length > 0) {
    fail(`${name} must not ship:\n  ${leaked.join('\n  ')}`)
  }

  const packed = JSON.parse(run('tar', ['-xzOf', tarball, 'package/package.json']))

  if (JSON.stringify(packed.dependencies ?? {}).includes('workspace:')) {
    fail(`${name} still declares a workspace: range: it would not install outside this repo`)
  }

  const installed = path.join(WORK, 'node_modules', name)

  await mkdir(installed, {recursive: true})
  run('tar', ['-xzf', tarball, '-C', installed, '--strip-components', '1'])
  fileCount += files.length
}

// The config plugin, as prebuild requires it: `app.plugin.js` from the tarball, run over a minimal config.
const plugin = createRequire(path.join(WORK, 'package.json'))('@hzblj/expo-paypal/app.plugin.js')
const withPayPal = plugin.default ?? plugin

if (typeof withPayPal !== 'function') {
  fail('app.plugin.js does not export a config plugin')
}

withPayPal({name: 'Consumer', scheme: 'consumer', slug: 'consumer'}, {returnUrl: 'https://shop.example.com/paypal'})

const consumer = `import {
  isPayPalError,
  isPayPalReturnUrl,
  PayLaterButton,
  PayPal,
  PayPalButton,
  type PayPalCheckoutResult,
  PayPalCreditButton,
  PayPalError,
} from '@hzblj/expo-paypal'
import type {PayPalPluginOptions} from '@hzblj/expo-paypal/plugin'

PayPal.configure({clientId: 'client', environment: 'sandbox', merchantId: 'merchant'})

export const pay = async (): Promise<PayPalCheckoutResult> => {
  const result = await PayPal.checkout({buyer: {email: 'buyer@example.com'}, orderId: async () => 'ORDER', userAction: 'payNow'})

  if (result.status === 'approved') {
    const payer: string = result.payerId
    return {...result, payerId: payer}
  }

  return result
}

export const card = () =>
  PayPal.checkoutWithCard({
    card: {expirationMonth: 1, expirationYear: 2030, number: '4111111111111111', securityCode: '123'},
    orderId: 'ORDER',
    threeDSecure: 'always',
  })

export const handle = (error: unknown) => (isPayPalError(error) ? error.code : error instanceof PayPalError)

export const skip = isPayPalReturnUrl('consumer://x-callback-url/paypal-sdk/paypal-checkout')

export const Buttons = () => (
  <>
    <PayPalButton color="blue" label="checkout" onPress={() => undefined} shape="pill" size="large" />
    <PayLaterButton color="black" />
    <PayPalCreditButton color="darkBlue" />
  </>
)

export const options: PayPalPluginOptions = {returnUrl: 'https://shop.example.com/paypal', scheme: 'consumer'}

// @ts-expect-error: the environment has no default
PayPal.configure({clientId: 'client', merchantId: 'merchant'})

// @ts-expect-error: setupNow is for vaulting
export const wrongAction = () => PayPal.checkout({orderId: 'ORDER', userAction: 'setupNow'})

// @ts-expect-error: PayPal Credit has no gold
export const NoGoldCredit = () => <PayPalCreditButton color="gold" />

// @ts-expect-error: only the PayPal button takes a label
export const NoLabel = () => <PayLaterButton label="checkout" />
`

await writeFile(path.join(WORK, 'consumer.tsx'), consumer)
await writeFile(
  path.join(WORK, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {noEmit: true, skipLibCheck: true, strict: true},
      extends: 'expo/tsconfig.base',
      include: ['consumer.tsx'],
    },
    null,
    2
  )
)

try {
  run('yarn', ['run', '-T', 'tsc', '-p', WORK])
} catch (error) {
  fail(`a consumer's type check failed:\n${error.stdout}`)
}

await rm(WORK, {force: true, recursive: true})

console.log(`pack-check: ${packages.length} package, ${fileCount} files, the plugin runs and a consumer type-checks`)

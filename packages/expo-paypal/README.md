# @hzblj/expo-paypal

[![npm](https://img.shields.io/npm/v/@hzblj/expo-paypal.svg)](https://www.npmjs.com/package/@hzblj/expo-paypal)
[![license](https://img.shields.io/npm/l/@hzblj/expo-paypal.svg)](https://github.com/hzblj/expo-paypal/blob/main/LICENSE)

PayPal for Expo on the native PayPal SDK 3 (iOS and Android). Every flow is one promise that resolves `approved` or `canceled`, and PayPal's own buttons are native views.

<p>
  <img src="https://raw.githubusercontent.com/hzblj/expo-paypal/main/media/ios/checkout-light.png" alt="Checkout with PayPal, Pay Later and PayPal Credit buttons on iOS" width="200">
  <img src="https://raw.githubusercontent.com/hzblj/expo-paypal/main/media/ios/card-dark.png" alt="A card payment form with 3D Secure on iOS" width="200">
  <img src="https://raw.githubusercontent.com/hzblj/expo-paypal/main/media/android/checkout-light.png" alt="Checkout on Android" width="200">
  <img src="https://raw.githubusercontent.com/hzblj/expo-paypal/main/media/android/buttons-dark.png" alt="PayPal's payment buttons on Android" width="200">
</p>

- PayPal Checkout with App Switch: the buyer approves in the PayPal app with Face ID or a passkey, or in an in-app browser when that isn't possible
- Pay Later and PayPal Credit, through the same checkout
- Vaulting: save a PayPal account or a card without a purchase, or along with one
- Card payments with 3D Secure, from your own card form
- PayPal's branded buttons (PayPal, Pay Later, PayPal Credit), drawn by the SDK
- Device data for PayPal's risk checks
- A config plugin that registers the return links on both platforms
- A flow the system interrupted by ending the app is restored when the app opens again

## Install

```sh
npx expo install @hzblj/expo-paypal
```

Requires Expo SDK 57 or newer and a [development build](https://docs.expo.dev/develop/development-builds/introduction/). Expo Go doesn't include this native module. The PayPal SDK needs iOS 16.

You need a PayPal app's **client ID** and the **merchant ID** of the account it pays (Developer Dashboard, then Account settings: the encrypted merchant ID, not the email), and a server that creates and captures orders with the [Orders v2 API](https://developer.paypal.com/docs/api/orders/v2/). The SDK never creates or captures an order, and the client secret never belongs in the app.

## Configure

Add the plugin in `app.config.ts`:

```ts
plugins: [['@hzblj/expo-paypal', {returnUrl: 'https://shop.example.com/paypal'}]]
```

| Option | Default | Meaning |
| --- | --- | --- |
| `returnUrl` | None | The https address PayPal returns to, as `<returnUrl>/success` and `<returnUrl>/cancel`. It is a Universal Link on iOS and an App Link on Android, and what App Switch returns through. Without it, PayPal returns through `scheme` and App Switch is unavailable |
| `scheme` | The app config's `scheme` | The custom URL scheme PayPal falls back to when a link can't open the app, and that Android's 3D Secure returns to. Lower case |

The plugin adds the return host to Associated Domains and a verified intent filter for its path, registers the scheme, and declares the PayPal app among the queried schemes. For `returnUrl` to open the app, your domain has to serve [`apple-app-site-association`](https://developer.apple.com/documentation/xcode/supporting-associated-domains) and [`assetlinks.json`](https://developer.android.com/training/app-links/verify-android-applinks) for it. Run `npx expo prebuild` after changing the options.

Then configure the account once, before the first flow:

```ts
import {PayPal} from '@hzblj/expo-paypal'

PayPal.configure({clientId, environment: 'sandbox', merchantId})
```

`environment` has no default, so a build never takes payments by accident. `configure()` can run again at any time, for instance when your server hands out the account per payment. It also takes `bnCode` for partner integrations, and `returnUrl` and `scheme` to replace the plugin's.

### Expo Router

PayPal's returns reach the app's own linking too. Skip them, so the router doesn't open a "not found" screen when the buyer comes back:

```ts
// app/+native-intent.ts
import {isPayPalReturnUrl} from '@hzblj/expo-paypal'

export const redirectSystemPath = ({path}: {path: string}) => (isPayPalReturnUrl(path) ? null : path)
```

## PayPal Checkout

```ts
const result = await PayPal.checkout({
  buyer: {email: user.email},
  orderId: () => api.createOrder(cart),
})

if (result.status === 'approved') {
  await api.captureOrder(result.orderId)
}
```

`orderId` takes the ID, a promise of it, or a function that creates the order. Passing the work lets PayPal's session start while your server creates the order, which is what PayPal recommends. The promise resolves once the buyer is back in the app:

| Result | Meaning |
| --- | --- |
| `{status: 'approved', orderId, payerId}` | Capture the order on your server |
| `{status: 'canceled', orderId}` | The buyer left PayPal without approving, or came back to the app by hand. Nothing was charged |

| Option | Default | Meaning |
| --- | --- | --- |
| `orderId` | Required | The Orders v2 order to approve |
| `buyer` | None | `{email, phone: {countryCode, nationalNumber}}`, or `{sessionId}` for a shopper session your server created. It helps PayPal recognise the buyer, for App Switch and approval rates. The SDK hashes it before sending |
| `userAction` | `continue` | PayPal's button on its review page: `continue` when your app shows a review step before it captures, `payNow` when approval is the last step |

**App Switch** happens when PayPal decides the buyer is eligible and the PayPal app is installed: it needs `returnUrl`, a physical device, and App Switch enabled for your account. Otherwise checkout opens in an in-app browser. Both return the same way.

**Pay Later and PayPal Credit** are the same `checkout()`. Your server picks the funding source when it creates the order, with `payment_source.paypal.experience_context.payment_method_selected` set to `PAYPAL_PAY_LATER` or `PAYPAL_CREDIT`.

**Vault with purchase** is the same `checkout()` too, over an order created with `payment_source.paypal.attributes.vault`. The result carries no payment token: your server reads it from the captured order.

## Save a PayPal account

```ts
const result = await PayPal.vault({
  setupTokenId: () => api.createSetupToken(),
  userAction: 'setupNow',
})

if (result.status === 'approved') {
  await api.createPaymentToken(result.setupTokenId)
}
```

Resolves `{status: 'approved', setupTokenId, approvalSessionId}` or `{status: 'canceled', setupTokenId}`. Your server creates the setup token with the Payment Method Tokens API, and turns the approved one into a payment token to charge later.

## Cards

The SDK has no card fields: build your own form, and check the number, the brand and the expiry date there. The card goes from the app to PayPal and is never stored.

```ts
const result = await PayPal.checkoutWithCard({
  card: {cardholderName, expirationMonth: 12, expirationYear: 2030, number, securityCode},
  orderId: () => api.createOrder(cart),
})

if (result.status === 'approved') {
  await api.captureOrder(result.orderId)
}
```

When the issuer asks for 3D Secure, the SDK presents the challenge itself and the promise resolves after it. `threeDSecure: 'always'` challenges every time, which is how you test it.

| Result | Meaning |
| --- | --- |
| `{status: 'approved', orderId, orderStatus, threeDSecureAttempted}` | Your server reads the 3D Secure outcome from the order, then captures |
| `{status: 'canceled', orderId}` | The buyer closed the 3D Secure challenge |

`PayPal.vaultCard({card, setupTokenId})` saves a card without a purchase the same way, and resolves with `setupTokenId`, `setupTokenStatus` and `threeDSecureAttempted`.

## Payment buttons

```tsx
import {PayLaterButton, PayPalButton, PayPalCreditButton} from '@hzblj/expo-paypal'

<PayPalButton label="checkout" onPress={pay} />
<PayLaterButton onPress={payLater} />
<PayPalCreditButton onPress={payWithCredit} />
```

The SDK's own buttons: the wordmark, the brand colours, the font and an accessibility label, as PayPal's brand guidelines ask. They need no order to show.

| Prop | Default | Meaning |
| --- | --- | --- |
| `onPress` | None | Start the flow here |
| `color` | `gold` | `gold`, `blue`, `black`, `white` or `silver`. PayPal Credit: `darkBlue`, `black` or `white` |
| `label` | `paypal` | PayPal button only: `paypal` (the wordmark alone), `checkout`, `buyNow` or `payWith` |
| `shape` | `rounded` | `rounded` (4 point corners), `pill` or `rectangle` |
| `cornerRadius` | None | A radius of your own, in points, in place of `shape` |
| `size` | `medium` | `small` (the wordmark alone, no label), `medium` or `large` |
| `disabled` | `false` | Ignores taps and dims the button, while the flow it started runs |

The height comes from `size` (PayPal's own: 45 to 56 points on iOS, 48 or 55 on Android) and the width from the layout around it.

## Device data

```ts
const clientMetadataId = await PayPal.collectDeviceData()
```

Send it to your server and set it as the `PayPal-Client-Metadata-Id` header when you create the order: PayPal's risk checks decline less with it. On Android, `{hasUserLocationConsent: true}` passes on the buyer's consent to use their location.

## Errors

A failure rejects with a `PayPalError`. Its `code` is one of:

| Code | Meaning |
| --- | --- |
| `UNAVAILABLE` | The build has no native module: Expo Go, web, or a build from before the package was installed |
| `NOT_CONFIGURED` | `PayPal.configure()` was never called |
| `INVALID_ARGUMENT` | A missing or malformed config value or option. The message says which |
| `IN_PROGRESS` | Another flow is still running. Flows run one at a time |
| `FAILED` | The SDK failed: the network, a session PayPal refused, a declined card. `nativeCode`, `nativeDomain` and `correlationId` carry PayPal's details |

An error your own `orderId` function throws (your server is down) passes through as it is.

## Restored flows

The system can end an app while the buyer is in PayPal. When the return opens the app again, the flow is finished from what the SDK wrote down before it left, and kept for you:

```ts
const restored = await PayPal.takeRestoredResult()

if (restored?.flow === 'checkout' && restored.result?.status === 'approved') {
  await api.captureOrder(restored.result.orderId)
}
```

It answers once, then `null`; a failure comes back as `restored.error`. Ask for it when the app starts.

## Platform behavior

- A buyer who comes back to the app by hand, from the PayPal app or by closing the browser, ends the flow as `canceled`. On iOS the in-app browser stays open when the buyer visits another app (for a password or a code) and comes back to it.
- The returns go to the SDK before any JavaScript runs, so a return that relaunched the app is never lost.
- App Switch can't be tested on a simulator or an emulator: the PayPal app is needed. The in-app browser works everywhere, in the sandbox too.

## More libraries

The other libraries from the same author are at **[libraries.janblazej.dev](https://www.libraries.janblazej.dev)**.

## License

MIT © Jan Blazej

# @hzblj/expo-paypal

PayPal on the native SDK 3: the JavaScript API (`src/` → `build/`), the config plugin (`plugin/src` → `plugin/build`,
CommonJS for Node) and the `ExpoPayPal` module (`ios/`, `android/`). The SDK's docs live in its repos
(`paypal/paypal-ios` `Guides/`, `paypal/paypal-android` `Docs/`); read the source when they disagree, they do.

| Path | What it is |
| --- | --- |
| `src/client.ts` | `createPayPal(native)`: the whole API over a native module or `null`. No `expo` or `react-native` import, so `test/` runs it in Node with a fake module. `src/PayPal.ts` wires the real one. |
| `src/links.ts`, `src/card.ts`, `src/outcomes.ts` | Return-link validation and derivation, card normalization, native outcome → result or `PayPalError`. |
| `src/PaymentButtons.tsx` | The three buttons over one native view (`PayPalButtonView`, prop `kind`), with the SDKs' heights per size. |
| `plugin/src` | Associated Domains, URL scheme, `LSApplicationQueriesSchemes`, the `ExpoPayPal` Info.plist dictionary; the App Link and scheme intent filters and `<meta-data>` on Android. |
| `ios/PayPalFlows.swift` | The flows (one `PayPalClient`/`CardClient` per account), return routing, the ledger. `ios/Core` is its Foundation-only logic. |
| `android/.../PayPalFlows.kt` | The same on Android; `FlowSlot`, `PendingFlow`, `ReturnLinks` are its plain-Kotlin logic. |

**The native side never rejects for an outcome.** Every flow resolves `{status: 'approved' | 'canceled' | 'failed'}`;
`src/outcomes.ts` turns `failed` into a `PayPalError` (its `code` field carries `IN_PROGRESS` and the like from native).
A native rejection is a bug and still reaches the app as `FAILED`.

**One flow at a time, guarded twice.** A second `createPayPalSession()` would replace the running flow's session, so
JavaScript refuses a second flow before it prepares anything, and native ignores `preparePayPalSession` and answers
`IN_PROGRESS` while a flow holds the slot. Each flow has a token: a late SDK answer for an ended flow is dropped.

**The links exist three times.** `src/links.ts` (the app), `plugin/src/links.ts` (Node can't import the app's source)
and the native `ReturnLinks` (derived from the plugin's base when no flow is running). `plugin/test` asserts the first
two agree; the native ones are tested in `ios/Tests` and `android/src/test`. Both SDKs read any return whose path holds
"cancel" as a cancellation, so `returnUrl` may not contain it. Android's `fallbackSchemeUrl` is a bare scheme despite
its name; iOS's is a full URL. Without an https `returnUrl`, iOS gets scheme URLs in the shape Android's SDK makes.

**iOS.** `ExpoPayPalAppDelegateSubscriber` hands every opened URL and Universal Link to `PayPalFlows.shared.handle`,
which gives a running flow's return to its client (`handleReturnURL`), parses a return for a flow the system ended
(`PendingFlowLedger` in `UserDefaults`, `PayPalReturnParser`), and swallows late PayPal returns. App Switch never calls
back when the buyer returns by hand, so `ReturnWatcher` ends the flow as cancelled: only when the app went to the
background and nothing was presented over the controller on top at the start (the in-app browser is presented, and
reports its own cancel). Card 3D Secure runs in `ASWebAuthenticationSession`: no ledger, no watcher.

**Android.** Returns arrive through `OnNewIntent` (Expo's single-task activity) or the activity's intent on resume.
`FlowSlot` remembers the activity's intent at launch: on resume, the same intent means the buyer came back by hand,
and the flow ends as cancelled. The ledger stores the client's `instanceState`; after a process death, a return that
matches it is finished by a restored client (`OnCreate` and every resume look). `PaymentButton.shape` resets the
custom corner radius, so it is set first, and `customCornerRadius` is in pixels.

**Buttons.** iOS builds a new SDK button when its look changes (the SDK takes it only in the initializer) and pins it
with Auto Layout (the SDK turns autoresizing off itself). Android sets the look in place and uses
`shouldUseAndroidLayout`. `small` shows the wordmark alone on both: iOS's collapsed size hides labels, so Android drops
its label to match. iOS's `mini` size is left out: Android has nothing like it.

**Tests.** `yarn test` (node:test over `test/` and `plugin/test`), `yarn test:ios` (`swift test` over `ios/Tests`,
whose `Sources/ExpoPayPalCore` links to `../Core`; the pod compiles only `*.swift` and `Core/`), `yarn test:android`
(JUnit through the example's Gradle, with the real `org.json`). The flows themselves need the sandbox: `apps/example`.

Code style follows `@hzblj/biome-config`. Docs copy (README, JSDoc, changesets) has no em dashes.

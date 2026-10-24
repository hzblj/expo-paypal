# example

The example app for `@hzblj/expo-paypal`: every flow against the PayPal sandbox, built from `@hzblj/kara-ui`, the way
a real checkout would look on iOS and Android. Private; never published.

| Path | What it is |
| --- | --- |
| `app/(tabs)/` | Native tabs (`Tabs` from `@hzblj/kara-ui/router`), each a stack with a large title: Checkout, Card, Wallet, Buttons. Route files only re-export a screen from `src/`. |
| `app/api/` | API routes, run by the dev server: create orders and setup tokens, capture, turn setup tokens into payment tokens. They hold the client secret (`src/server/paypal.ts`), which never reaches the app. |
| `app/+native-intent.ts` | Skips PayPal's returns in Expo Router, with `isPayPalReturnUrl`. |
| `src/checkout/`, `src/card/`, `src/wallet/`, `src/buttons/` | The screens. |
| `src/ui/` | `Page` and `Section` (kara's grouped-page parts), `useFlow` (one flow per screen: busy, the result sheet, the cancel snackbar), `FlowResult`, `SandboxNotice`, `TabStack`. |
| `src/theme.ts` | PayPal's blue as kara's accent, every accent token at once, and the Android seed. |
| `src/api.ts`, `src/paypal.ts` | The client of the API routes (on the dev server's address), and `PayPal.configure()` from `.env`. |
| `assets/icons/` | Material Symbols SVGs, turned into native assets by kara's plugin at prebuild; `native-icons.d.ts` is written from them. |
| `assets/icon.png`, `assets/adaptive-icon.png` | The app icon: a card from plain shapes on PayPal's blues (iOS), the card alone on `ICON_BACKGROUND` (Android). |

**The sandbox account lives in `.env`** (copy `.env.example`): `EXPO_PUBLIC_PAYPAL_CLIENT_ID` and
`EXPO_PUBLIC_PAYPAL_MERCHANT_ID` reach the app, `PAYPAL_CLIENT_SECRET` only the API routes. Without them every screen
shows `SandboxNotice`; the buttons still render.

**Pages follow kara's example.** An `RnScrollView` of sections, native controls in an `Island` each, the PayPal buttons
(React Native views) straight in a `Box`. TextFields are uncontrolled: switching the test card remounts the form with a
`key`.

**No returnUrl here.** The example has no domain to serve `apple-app-site-association` and `assetlinks.json`, so
PayPal returns through the `paypal-example` scheme, and App Switch is out of reach (it needs a physical device with
the PayPal app anyway).

**Native changes need a rebuild**: `yarn prebuild` (it builds the package's config plugin first), then a native run.

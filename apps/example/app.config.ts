import type {ExpoConfig} from 'expo/config'

// Not "Expo PayPal": the generated Xcode target would be `ExpoPayPal`, the Swift module of the package's native module.
const NAME = 'PayPal Example'
const BUNDLE_ID = 'com.hzblj.expopaypal.example'
// The middle of the iOS icon's gradient: what the Android icon's card sits on.
const ICON_BACKGROUND = '#00669f'

export default {
  android: {
    adaptiveIcon: {
      backgroundColor: ICON_BACKGROUND,
      foregroundImage: './assets/adaptive-icon.png',
    },
    package: BUNDLE_ID,
  },
  experiments: {
    typedRoutes: true,
  },
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: true,
  },
  name: NAME,
  orientation: 'portrait',
  plugins: [
    'expo-router',
    // The example's icons (Material Symbols): every SVG in assets/icons becomes a native asset on both platforms, and
    // its name a type in native-icons.d.ts.
    ['@hzblj/kara-ui', {icons: {source: './assets/icons'}}],
    // Registers PayPal's returns: the scheme below, as the example has no domain for an https returnUrl (App Switch
    // needs one, and a physical device). Built from packages/expo-paypal, which is why `yarn prebuild` builds it first.
    '@hzblj/expo-paypal',
  ],
  scheme: 'paypal-example',
  slug: 'expo-paypal-example',
  userInterfaceStyle: 'automatic',
  version: '1.0.0',
  // The API routes in app/api create and capture the sandbox orders, with the secret that never reaches the app.
  web: {
    output: 'server',
  },
} satisfies ExpoConfig

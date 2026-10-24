import {requireOptionalNativeModule} from 'expo'

import type {PayPalNativeModule} from './native'

/** `null` where the build has no native module: Expo Go, web, a build from before the package was installed. */
export const ExpoPayPal = requireOptionalNativeModule<PayPalNativeModule & object>('ExpoPayPal')

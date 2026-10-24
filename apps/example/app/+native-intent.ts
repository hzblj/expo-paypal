import {isPayPalReturnUrl} from '@hzblj/expo-paypal'

/**
 * PayPal's returns reach the app's linking too. They belong to the PayPal SDK, not to a screen: skipping them keeps
 * Expo Router from opening "not found" when the buyer comes back.
 */
export const redirectSystemPath = ({path}: {path: string; initial: boolean}) => (isPayPalReturnUrl(path) ? null : path)

import {requireNativeView} from 'expo'
import {type ComponentType, useCallback, useMemo} from 'react'
import {Platform, type StyleProp, type ViewProps, type ViewStyle} from 'react-native'

import {ExpoPayPal} from './ExpoPayPalModule'

/** `rounded` (the default) has PayPal's 4 point corners, `pill` fully rounded ends, `rectangle` square corners. */
export type PaymentButtonShape = 'rectangle' | 'rounded' | 'pill'

/**
 * The SDK's sizes. `small` shows the wordmark alone and ignores `label`; `medium` (the default) and `large` show the
 * label, `large` taller and with a bigger wordmark.
 */
export type PaymentButtonSize = 'small' | 'medium' | 'large'

export type PaymentButtonProps = Omit<ViewProps, 'children'> & {
  /** Called when the buyer taps the button: start the flow here, with `PayPal.checkout()`. */
  onPress?: () => void
  /** Ignores taps and dims the button, for while the flow it started runs. */
  disabled?: boolean
  shape?: PaymentButtonShape
  /** A corner radius of your own, in points, in place of `shape`. At most half the button's height. */
  cornerRadius?: number
  size?: PaymentButtonSize
  /**
   * The button's height comes from `size`, the width from the layout around it. Set a height here only to override
   * PayPal's, which keeps the wordmark legible.
   */
  style?: StyleProp<ViewStyle>
}

/** Gold converts best, by PayPal's research; blue is the preferred alternative. */
export type PayPalButtonColor = 'gold' | 'blue' | 'white' | 'black' | 'silver'

export type PayPalButtonProps = PaymentButtonProps & {
  color?: PayPalButtonColor
  /** Words beside the wordmark: none (`paypal`, the default), `checkout`, `buyNow` or `payWith`. */
  label?: 'paypal' | 'checkout' | 'buyNow' | 'payWith'
}

export type PayLaterButtonProps = PaymentButtonProps & {
  color?: PayPalButtonColor
}

export type PayPalCreditButtonProps = PaymentButtonProps & {
  /** `darkBlue` by default. */
  color?: 'darkBlue' | 'black' | 'white'
}

type NativeButtonProps = Omit<PaymentButtonProps, 'onPress'> & {
  color: string
  kind: 'paypal' | 'payLater' | 'credit'
  label?: string
  /** Not `onPress`: React Native registers `topPress` as a bubbling event, and a direct one by that name throws. */
  onButtonPress?: () => void
}

type PaymentButtonViewProps = Omit<NativeButtonProps, 'onButtonPress'> & {onPress?: () => void}

/** The SDKs' own heights: the iOS button sizes itself around its wordmark, the Android one has a minimum height. */
const HEIGHTS: Record<'ios' | 'android', Record<PaymentButtonSize, number>> = {
  android: {large: 55, medium: 48, small: 48},
  ios: {large: 56, medium: 46, small: 45},
}

const NativeButton: ComponentType<NativeButtonProps> | null = ExpoPayPal
  ? requireNativeView<NativeButtonProps>('ExpoPayPal', 'PayPalButtonView')
  : null

const PaymentButton = ({onPress, shape = 'rounded', size = 'medium', style, ...props}: PaymentButtonViewProps) => {
  const handlePress = useCallback(() => onPress?.(), [onPress])
  const height = useMemo(() => ({height: HEIGHTS[Platform.OS === 'android' ? 'android' : 'ios'][size]}), [size])

  if (!NativeButton) {
    return null
  }

  return <NativeButton {...props} onButtonPress={handlePress} shape={shape} size={size} style={[height, style]} />
}

/**
 * PayPal's own button, drawn by the native SDK: the wordmark, the brand colours and its accessibility label. Use it
 * rather than a button of your own, as PayPal's brand guidelines ask. It needs no order to show: create the order
 * when it is tapped.
 *
 * ```tsx
 * <PayPalButton label="checkout" onPress={pay} />
 * ```
 */
export const PayPalButton = ({color = 'gold', label = 'paypal', ...props}: PayPalButtonProps) => (
  <PaymentButton {...props} color={color} kind="paypal" label={label} />
)

/**
 * PayPal's Pay Later button. It starts the same `PayPal.checkout()`: Pay Later is chosen when your server creates the
 * order (`payment_source.paypal.experience_context.payment_method_selected: 'PAYPAL_PAY_LATER'`).
 */
export const PayLaterButton = ({color = 'gold', ...props}: PayLaterButtonProps) => (
  <PaymentButton {...props} color={color} kind="payLater" />
)

/** PayPal's PayPal Credit button, for the same `PayPal.checkout()` with `PAYPAL_CREDIT` chosen on the server. */
export const PayPalCreditButton = ({color = 'darkBlue', ...props}: PayPalCreditButtonProps) => (
  <PaymentButton {...props} color={color} kind="credit" />
)

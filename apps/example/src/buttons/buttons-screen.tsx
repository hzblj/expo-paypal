import {
  PayLaterButton,
  type PaymentButtonShape,
  type PaymentButtonSize,
  PayPalButton,
  type PayPalButtonColor,
  type PayPalButtonProps,
  PayPalCreditButton,
  type PayPalCreditButtonProps,
} from '@hzblj/expo-paypal'
import {Box, Snackbar} from '@hzblj/kara-ui'
import {useState} from 'react'

import {Page, Section} from '../ui'

const COLORS: PayPalButtonColor[] = ['gold', 'blue', 'black', 'white', 'silver']
const LABELS: NonNullable<PayPalButtonProps['label']>[] = ['paypal', 'checkout', 'buyNow', 'payWith']
const CREDIT_COLORS: NonNullable<PayPalCreditButtonProps['color']>[] = ['darkBlue', 'black', 'white']
const SHAPES: PaymentButtonShape[] = ['rectangle', 'rounded', 'pill']
const SIZES: PaymentButtonSize[] = ['small', 'medium', 'large']

/** Every look the SDK's buttons have, drawn by the SDK itself. A tap names the button it was. */
export const ButtonsScreen = () => {
  const [tapped, setTapped] = useState<string | null>(null)
  const tap = (what: string) => () => setTapped(what)

  return (
    <Page
      overlay={
        <Snackbar
          duration="short"
          message={`Tapped ${tapped ?? ''}`}
          offset="s80"
          onDismiss={() => setTapped(null)}
          visible={tapped !== null}
        />
      }
    >
      <Section caption="Gold converts best, by PayPal's research. Blue is the preferred alternative." title="PayPal">
        <Box gap="s12">
          {COLORS.map(color => (
            <PayPalButton color={color} key={color} label="checkout" onPress={tap(`PayPal, ${color}`)} />
          ))}
        </Box>
      </Section>
      <Section caption="Words beside the wordmark. The small size shows the wordmark alone." title="Labels">
        <Box gap="s12">
          {LABELS.map(label => (
            <PayPalButton key={label} label={label} onPress={tap(`the ${label} label`)} />
          ))}
        </Box>
      </Section>
      <Section caption="The same checkout, with Pay Later chosen when the server creates the order." title="Pay Later">
        <Box gap="s12">
          {COLORS.map(color => (
            <PayLaterButton color={color} key={color} onPress={tap(`Pay Later, ${color}`)} />
          ))}
        </Box>
      </Section>
      <Section title="PayPal Credit">
        <Box gap="s12">
          {CREDIT_COLORS.map(color => (
            <PayPalCreditButton color={color} key={color} onPress={tap(`PayPal Credit, ${color}`)} />
          ))}
        </Box>
      </Section>
      <Section caption="Or a corner radius of your own, here 12 points." title="Shapes">
        <Box gap="s12">
          {SHAPES.map(shape => (
            <PayPalButton key={shape} label="buyNow" onPress={tap(`the ${shape} shape`)} shape={shape} />
          ))}
          <PayPalButton cornerRadius={12} label="buyNow" onPress={tap('a 12 point radius')} />
        </Box>
      </Section>
      <Section title="Sizes">
        <Box gap="s12">
          {SIZES.map(size => (
            <PayPalButton key={size} label="payWith" onPress={tap(`the ${size} size`)} size={size} />
          ))}
        </Box>
      </Section>
      <Section caption="While the flow it started runs." title="Disabled">
        <PayPalButton disabled label="checkout" onPress={tap('a disabled button')} />
      </Section>
    </Page>
  )
}

import {PayLaterButton, PayPal, PayPalButton, PayPalCreditButton} from '@hzblj/expo-paypal'
import {
  Box,
  Divider,
  HStack,
  Icon,
  Island,
  LabeledContent,
  SegmentedControl,
  Spacer,
  Stepper,
  Switch,
  Text,
  TextField,
  VStack,
  ZStack,
} from '@hzblj/kara-ui'
import {useEffect, useState} from 'react'

import {api, type PaymentMethod} from '../api'
import {FlowResult, type Outcome, Page, SandboxNotice, Section, useFlow} from '../ui'
import {saveMethod} from '../wallet/saved'

const PRICE = 129
const USER_ACTIONS = ['continue', 'payNow'] as const
const METHOD_NAMES: Record<PaymentMethod, string> = {
  PAYPAL: 'PayPal',
  PAYPAL_CREDIT: 'PayPal Credit',
  PAYPAL_PAY_LATER: 'Pay Later',
}

const money = (amount: number) => `$${amount.toFixed(2)}`

const Bag = ({onQuantityChange, quantity}: {onQuantityChange: (value: number) => void; quantity: number}) => (
  <Island>
    <VStack bg="surface.primary" borderRadius="large" p="s16" spacing="s12" wide>
      <HStack align="center" spacing="s12" wide>
        <ZStack align="center" bg="fill.accent.base" borderRadius="medium" h={56} w={56}>
          <Icon color="content.accent" name="shopping-bag" />
        </ZStack>
        <VStack align="start" spacing="s2">
          <Text variant="headline">Trail Runner</Text>
          <Text color="content.secondary" variant="footnote">
            EU 42 · Black
          </Text>
        </VStack>
        <Spacer />
        <Text variant="headline">{money(PRICE)}</Text>
      </HStack>
      <Divider />
      <Stepper label="Quantity" max={5} min={1} onValueChange={onQuantityChange} value={quantity} />
      <Divider />
      <LabeledContent label="Total" value={money(PRICE * quantity)} />
    </VStack>
  </Island>
)

/**
 * A flow the system interrupted by ending the app comes back once, at start. An approved order there still needs
 * capturing, exactly as if `PayPal.checkout()` had resolved.
 */
const useRestoredCheckout = (show: (outcome: Outcome) => void) => {
  useEffect(() => {
    PayPal.takeRestoredResult().then(async restored => {
      if (restored?.flow === 'checkout' && restored.result?.status === 'approved') {
        const capture = await api.capture(restored.result.orderId)
        show({
          message: 'The app was closed while you were in PayPal; the payment was finished when it opened again.',
          rows: [
            {label: 'Order', value: capture.id},
            {label: 'Status', value: capture.captureStatus ?? capture.status},
          ],
          title: 'Payment restored',
          tone: 'success',
        })
      }
    })
  }, [show])
}

export const CheckoutScreen = () => {
  const [quantity, setQuantity] = useState(1)
  const [email, setEmail] = useState('')
  const [userAction, setUserAction] = useState<(typeof USER_ACTIONS)[number]>('payNow')
  const [saveAccount, setSaveAccount] = useState(false)
  const flow = useFlow()
  const total = PRICE * quantity

  useRestoredCheckout(flow.show)

  /**
   * The flow PayPal recommends: device data first, then the order created while the PayPal session starts (`orderId`
   * is a function), and the capture once the buyer approved. Pay Later and PayPal Credit differ only in the order.
   */
  const pay = (paymentMethod: PaymentMethod) =>
    flow.run(async () => {
      const clientMetadataId = await PayPal.collectDeviceData()
      const result = await PayPal.checkout({
        buyer: email ? {email} : undefined,
        orderId: () => api.createOrder({amount: total.toFixed(2), clientMetadataId, paymentMethod, vault: saveAccount}),
        userAction,
      })

      if (result.status === 'canceled') {
        return 'canceled'
      }

      const capture = await api.capture(result.orderId)

      if (capture.vaultId) {
        saveMethod({detail: capture.payerEmail ?? 'Saved with a purchase', kind: 'paypal', tokenId: capture.vaultId})
      }

      return {
        message: `${METHOD_NAMES[paymentMethod]}, captured on the sandbox server.`,
        rows: [
          {label: 'Order', value: result.orderId},
          {label: 'Payer', value: result.payerId},
          ...(capture.captureId ? [{label: 'Capture', value: capture.captureId}] : []),
          {label: 'Status', value: capture.captureStatus ?? capture.status},
          ...(capture.vaultId ? [{label: 'Saved PayPal', value: capture.vaultId}] : []),
        ],
        title: `Paid ${money(total)}`,
        tone: 'success',
      }
    })

  return (
    <Page overlay={<FlowResult canceledMessage="Payment canceled. Nothing was charged." flow={flow} />}>
      <SandboxNotice />
      <Section title="Your bag">
        <Bag onQuantityChange={setQuantity} quantity={quantity} />
      </Section>
      <Section
        caption="PayPal opens in an in-app browser here. On a phone with the PayPal app and App Switch, the buyer approves there, with biometrics or a passkey."
        title="Pay with"
      >
        <Box gap="s12">
          <PayPalButton disabled={flow.busy} label="checkout" onPress={() => pay('PAYPAL')} size="large" />
          <PayLaterButton disabled={flow.busy} onPress={() => pay('PAYPAL_PAY_LATER')} size="large" />
          <PayPalCreditButton disabled={flow.busy} onPress={() => pay('PAYPAL_CREDIT')} size="large" />
        </Box>
      </Section>
      <Section
        caption="Pay now makes approval the last step. Continue leaves a review step in the app before it captures."
        title="On PayPal's page"
      >
        <SegmentedControl
          onChange={index => setUserAction(USER_ACTIONS[index] ?? 'payNow')}
          selectedIndex={USER_ACTIONS.indexOf(userAction)}
          values={['Continue', 'Pay now']}
        />
      </Section>
      <Section caption="An email helps PayPal recognise the buyer and offer App Switch." title="Buyer">
        <Island>
          <VStack bg="surface.primary" borderRadius="large" p="s16" spacing="s16" wide>
            <TextField label="Email" onChangeText={setEmail} />
            <Divider />
            <Switch label="Save PayPal for next time" onValueChange={setSaveAccount} value={saveAccount} />
          </VStack>
        </Island>
      </Section>
    </Page>
  )
}

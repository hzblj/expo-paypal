import {PayPal, type PayPalCard} from '@hzblj/expo-paypal'
import {Button, Divider, HStack, Icon, Island, SegmentedControl, Spacer, Text, TextField, VStack} from '@hzblj/kara-ui'
import {useState} from 'react'

import {api} from '../api'
import {FlowResult, Page, SandboxNotice, Section, useFlow} from '../ui'
import {saveMethod} from '../wallet/saved'

const AMOUNT = '19.99'

/** The sandbox cards PayPal's own demo app uses, each for one 3D Secure path. */
const TEST_CARDS = [
  {label: 'Authenticates', number: '4868 7194 6070 7704'},
  {label: 'Steps up', number: '5314 6090 4083 0349'},
  {label: 'No 3DS', number: '4000 0000 0000 0002'},
] as const

const THREE_D_SECURE = ['whenRequired', 'always'] as const

const HALF = {weight: 1}

const brandOf = (number: string) => {
  switch (number.trim()[0]) {
    case '3':
      return 'AMEX'
    case '5':
      return 'MASTERCARD'
    default:
      return 'VISA'
  }
}

const lastFour = (number: string) => number.replace(/\D/g, '').slice(-4)

/** The card as it is typed, drawn in the accent: the form's live preview. */
const CardPreview = ({expiry, name, number}: {expiry: string; name: string; number: string}) => (
  <Island>
    <VStack bg="fill.accent.primary" borderRadius="large" p="s20" spacing="s24" wide>
      <HStack align="center" wide>
        <Text color="content.on.accent" variant="headline">
          {brandOf(number)}
        </Text>
        <Spacer />
        <Icon color="content.on.accent" name="credit-card" />
      </HStack>
      <Text color="content.on.accent" variant="headingS">{`•••• •••• •••• ${lastFour(number) || '••••'}`}</Text>
      <HStack align="end" wide>
        <VStack align="start" spacing="s2">
          <Text color="content.on.accent" variant="caption">
            CARDHOLDER
          </Text>
          <Text color="content.on.accent" variant="subheadlineMedium">
            {name || 'Your name'}
          </Text>
        </VStack>
        <Spacer />
        <VStack align="end" spacing="s2">
          <Text color="content.on.accent" variant="caption">
            EXPIRES
          </Text>
          <Text color="content.on.accent" variant="subheadlineMedium">
            {expiry || 'MM/YY'}
          </Text>
        </VStack>
      </HStack>
    </VStack>
  </Island>
)

/**
 * The SDK has no card fields, so an app builds its own form; this one starts from PayPal's sandbox cards. The card
 * goes from the app to PayPal and is never stored.
 */
export const CardScreen = () => {
  const [testCard, setTestCard] = useState(0)
  const [number, setNumber] = useState<string>(TEST_CARDS[0].number)
  const [expiry, setExpiry] = useState('12/30')
  const [securityCode, setSecurityCode] = useState('123')
  const [name, setName] = useState('Jan Novak')
  const [threeDSecure, setThreeDSecure] = useState<(typeof THREE_D_SECURE)[number]>('whenRequired')
  const flow = useFlow()

  const pickTestCard = (index: number) => {
    setTestCard(index)
    setNumber(TEST_CARDS[index]?.number ?? '')
  }

  const card = (): PayPalCard => {
    const [month = '', year = ''] = expiry.split('/')
    return {cardholderName: name, expirationMonth: month, expirationYear: year, number, securityCode}
  }

  const pay = () =>
    flow.run(async () => {
      const result = await PayPal.checkoutWithCard({
        card: card(),
        orderId: () => api.createOrder({amount: AMOUNT}),
        threeDSecure,
      })

      if (result.status === 'canceled') {
        return 'canceled'
      }

      const capture = await api.capture(result.orderId)

      return {
        message: `${brandOf(number)} •••• ${lastFour(number)}, captured on the sandbox server.`,
        rows: [
          {label: 'Order', value: result.orderId},
          {label: '3D Secure', value: result.threeDSecureAttempted ? 'Challenged' : 'Not needed'},
          {label: 'Status', value: capture.captureStatus ?? capture.status},
        ],
        title: `Paid $${AMOUNT}`,
        tone: 'success',
      }
    })

  const save = () =>
    flow.run(async () => {
      const result = await PayPal.vaultCard({
        card: card(),
        setupTokenId: () => api.createSetupToken({paymentSource: 'card', threeDSecure}),
      })

      if (result.status === 'canceled') {
        return 'canceled'
      }

      const token = await api.createPaymentToken(result.setupTokenId)

      saveMethod({detail: `${brandOf(number)} •••• ${lastFour(number)}`, kind: 'card', tokenId: token.id})

      return {
        message: 'Saved for later, without a purchase. It is in the Wallet tab.',
        rows: [
          {label: 'Setup token', value: result.setupTokenId},
          {label: 'Payment token', value: token.id},
          {label: '3D Secure', value: result.threeDSecureAttempted ? 'Challenged' : 'Not needed'},
        ],
        title: 'Card saved',
        tone: 'success',
      }
    })

  return (
    <Page overlay={<FlowResult canceledMessage="3D Secure canceled. Nothing was charged." flow={flow} />}>
      <SandboxNotice />
      <CardPreview expiry={expiry} name={name} number={number} />
      <Section caption="PayPal's sandbox cards, one for each 3D Secure path." title="Test card">
        <SegmentedControl
          onChange={pickTestCard}
          selectedIndex={testCard}
          values={TEST_CARDS.map(card => card.label)}
        />
      </Section>
      <Section title="Card details">
        <Island key={testCard}>
          <VStack bg="surface.primary" borderRadius="large" p="s16" spacing="s16" wide>
            <TextField defaultValue={number} label="Card number" onChangeText={setNumber} />
            {/* Half the row each: an infinite width shares it in SwiftUI, a weight in Compose. */}
            <HStack spacing="s12" wide>
              <VStack android={HALF} wide>
                <TextField defaultValue={expiry} label="Expiry" onChangeText={setExpiry} />
              </VStack>
              <VStack android={HALF} wide>
                <TextField defaultValue={securityCode} label="CVC" onChangeText={setSecurityCode} secure />
              </VStack>
            </HStack>
            <Divider />
            <TextField defaultValue={name} label="Name on card" onChangeText={setName} />
          </VStack>
        </Island>
      </Section>
      <Section caption="Always challenges every payment: the way to see the challenge page." title="3D Secure">
        <SegmentedControl
          onChange={index => setThreeDSecure(THREE_D_SECURE[index] ?? 'whenRequired')}
          selectedIndex={THREE_D_SECURE.indexOf(threeDSecure)}
          values={['When required', 'Always']}
        />
      </Section>
      <Island>
        <VStack spacing="s12" wide>
          <Button disabled={flow.busy} label={`Pay $${AMOUNT}`} onPress={pay} />
          <Button disabled={flow.busy} label="Save card" onPress={save} variant="secondary" />
        </VStack>
      </Island>
    </Page>
  )
}

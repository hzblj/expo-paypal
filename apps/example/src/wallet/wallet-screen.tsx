import {isPayPalError, PayPal, PayPalButton} from '@hzblj/expo-paypal'
import {Box, EmptyState, Island, LabeledContent, RnListItem, VStack} from '@hzblj/kara-ui'
import {Fragment, useState} from 'react'

import {api} from '../api'
import {FlowResult, InsetDivider, Page, SandboxNotice, Section, useFlow} from '../ui'
import {saveMethod, useSavedMethods} from './saved'

const SavedMethods = () => {
  const saved = useSavedMethods()

  if (saved.length === 0) {
    return (
      <Island>
        <VStack bg="surface.primary" borderRadius="large" p="s24" wide>
          <EmptyState
            description="Save a PayPal account below, or a card in the Card tab."
            icon="wallet"
            title="Nothing saved yet"
          />
        </VStack>
      </Island>
    )
  }

  return (
    <Box bg="surface.primary" borderRadius="large" overflow="hidden">
      {saved.map((method, index) => (
        <Fragment key={method.tokenId}>
          {index > 0 ? <Box bg="border.tertiary" h={1} mx="s16" /> : null}
          <RnListItem
            icon={method.kind === 'paypal' ? 'payments' : 'credit-card'}
            px="s16"
            subtitle={`${method.detail} · ${method.tokenId}`}
            title={method.kind === 'paypal' ? 'PayPal' : 'Card'}
          />
        </Fragment>
      ))}
    </Box>
  )
}

const DeviceData = () => {
  const [value, setValue] = useState('Not collected')

  const collect = async () => {
    setValue('Collecting…')

    try {
      setValue(await PayPal.collectDeviceData())
    } catch (error) {
      setValue(isPayPalError(error) ? error.code : 'Failed')
    }
  }

  return (
    <Island>
      <VStack bg="surface.primary" borderRadius="large" wide>
        <LabeledContent icon="fingerprint" label="Client metadata ID" px="s16" value={value} />
        <InsetDivider />
        <LabeledContent icon="verified-user" label="Collect device data" onPress={collect} px="s16" />
      </VStack>
    </Island>
  )
}

export const WalletScreen = () => {
  const flow = useFlow()

  /** Vault without purchase: a setup token, approved by the buyer, turned into a payment token by the server. */
  const savePayPal = () =>
    flow.run(async () => {
      const result = await PayPal.vault({
        setupTokenId: () => api.createSetupToken({paymentSource: 'paypal'}),
        userAction: 'setupNow',
      })

      if (result.status === 'canceled') {
        return 'canceled'
      }

      const token = await api.createPaymentToken(result.setupTokenId)

      saveMethod({detail: 'Saved without a purchase', kind: 'paypal', tokenId: token.id})

      return {
        message: 'Your server can charge it later, without the buyer.',
        rows: [
          {label: 'Setup token', value: result.setupTokenId},
          {label: 'Approval', value: result.approvalSessionId},
          {label: 'Payment token', value: token.id},
        ],
        title: 'PayPal saved',
        tone: 'success',
      }
    })

  return (
    <Page overlay={<FlowResult canceledMessage="Nothing was saved." flow={flow} />}>
      <SandboxNotice />
      <Section caption="Payment tokens saved this session. A real app lists them from its server." title="Saved">
        <SavedMethods />
      </Section>
      <Section
        caption="The buyer approves once, in PayPal, and your server charges the account later."
        title="Add PayPal"
      >
        <PayPalButton disabled={flow.busy} onPress={savePayPal} shape="pill" size="large" />
      </Section>
      <Section
        caption="PayPal's risk data for this phone. Send it with the order, as the PayPal-Client-Metadata-Id header."
        title="Device data"
      >
        <DeviceData />
      </Section>
    </Page>
  )
}

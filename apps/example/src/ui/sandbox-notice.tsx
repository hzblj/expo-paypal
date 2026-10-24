import {Island, Label, Text, VStack} from '@hzblj/kara-ui'

import {hasCredentials} from '../paypal'

/** Shown until `apps/example/.env` has a sandbox account: the buttons work without one, the flows don't. */
export const SandboxNotice = () =>
  hasCredentials ? null : (
    <Island>
      <VStack align="start" bg="fill.accent.base" borderRadius="large" p="s16" spacing="s8" wide>
        <Label color="content.accent" icon="info" title="Sandbox account needed" variant="headline" />
        <Text color="content.secondary" variant="subheadline">
          Copy apps/example/.env.example to .env, fill in a PayPal sandbox app's client ID and secret and its merchant
          ID, then restart Metro.
        </Text>
      </VStack>
    </Island>
  )

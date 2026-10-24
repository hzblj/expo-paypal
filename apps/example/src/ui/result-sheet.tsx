import {
  Box,
  Button,
  Divider,
  Icon,
  Island,
  LabeledContent,
  type NavigationBarItem,
  Sheet,
  Snackbar,
  Text,
  VStack,
} from '@hzblj/kara-ui'
import {Fragment, useMemo} from 'react'

import type {Flow} from './use-flow'

/** How a flow ended: a sheet for an approval or an error, a snackbar for a cancellation. */
export const FlowResult = ({canceledMessage, flow}: {canceledMessage: string; flow: Flow}) => {
  const {canceled, dismissCanceled, dismissOutcome, outcome} = flow
  const closeItem = useMemo<NavigationBarItem[]>(() => [{onPress: dismissOutcome, type: 'close'}], [dismissOutcome])
  const success = outcome?.tone === 'success'

  return (
    <>
      <Sheet onDismiss={dismissOutcome} visible={outcome !== null}>
        <Sheet.Header trailingItems={closeItem} />
        <Box gap="s16" pb="s32" px="s20">
          <Island>
            <VStack spacing="s20" wide>
              <VStack spacing="s8" wide>
                <Icon
                  color={success ? 'content.success' : 'content.destructive'}
                  name={success ? 'check-circle' : 'error'}
                  size="s56"
                />
                <Text variant="headingS">{outcome?.title ?? ''}</Text>
                {outcome?.message ? <Text color="content.secondary">{outcome.message}</Text> : null}
              </VStack>
              {outcome && outcome.rows.length > 0 ? (
                <VStack bg="surface.base" borderRadius="large" px="s16" wide>
                  {outcome.rows.map((row, index) => (
                    <Fragment key={row.label}>
                      {index > 0 ? <Divider /> : null}
                      <LabeledContent label={row.label} value={row.value} />
                    </Fragment>
                  ))}
                </VStack>
              ) : null}
              <Button label="Done" onPress={dismissOutcome} variant={success ? 'accent' : 'secondary'} />
            </VStack>
          </Island>
        </Box>
      </Sheet>
      <Snackbar
        duration="short"
        message={canceledMessage}
        offset="s80"
        onDismiss={dismissCanceled}
        visible={canceled}
      />
    </>
  )
}

import {isPayPalError} from '@hzblj/expo-paypal'
import {useCallback, useState} from 'react'

/** What a flow ended with, for the result sheet. */
export type Outcome = {
  rows: {label: string; value: string}[]
  message?: string
  title: string
  tone: 'success' | 'error'
}

/**
 * Runs one payment flow at a time for a screen: `busy` disables its buttons, an approval or an error opens the result
 * sheet, a cancellation shows a snackbar (nothing was charged, there is nothing to look at).
 */
export const useFlow = () => {
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [canceled, setCanceled] = useState(false)

  const run = useCallback(async (flow: () => Promise<Outcome | 'canceled'>) => {
    setBusy(true)
    setCanceled(false)

    try {
      const result = await flow()

      if (result === 'canceled') {
        setCanceled(true)
      } else {
        setOutcome(result)
      }
    } catch (error) {
      setOutcome({
        message: error instanceof Error ? error.message : String(error),
        rows: isPayPalError(error)
          ? [
              {label: 'Code', value: error.code},
              ...(error.nativeCode !== undefined ? [{label: 'Native code', value: String(error.nativeCode)}] : []),
              ...(error.correlationId ? [{label: 'Correlation ID', value: error.correlationId}] : []),
            ]
          : [],
        title: 'Something went wrong',
        tone: 'error',
      })
    } finally {
      setBusy(false)
    }
  }, [])

  return {
    busy,
    canceled,
    dismissCanceled: useCallback(() => setCanceled(false), []),
    dismissOutcome: useCallback(() => setOutcome(null), []),
    outcome,
    run,
    show: setOutcome,
  }
}

export type Flow = ReturnType<typeof useFlow>

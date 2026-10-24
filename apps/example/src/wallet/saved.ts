import {useSyncExternalStore} from 'react'

/** A payment method saved this session: a PayPal account or a card, as the payment token your server keeps. */
export type SavedMethod = {
  detail: string
  kind: 'paypal' | 'card'
  tokenId: string
}

let methods: readonly SavedMethod[] = []
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The example keeps them in memory: a real app lists the buyer's payment tokens from its server. */
export const saveMethod = (method: SavedMethod) => {
  methods = [method, ...methods.filter(saved => saved.tokenId !== method.tokenId)]
  for (const listener of listeners) {
    listener()
  }
}

export const useSavedMethods = () => useSyncExternalStore(subscribe, () => methods)

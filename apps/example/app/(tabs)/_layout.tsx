import {Tabs} from '@hzblj/kara-ui/router'

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen icon="shopping-bag" name="(checkout)" selectedIcon="shopping-bag-filled" title="Checkout" />
      <Tabs.Screen icon="credit-card" name="card" selectedIcon="credit-card-filled" title="Card" />
      <Tabs.Screen icon="wallet" name="wallet" selectedIcon="wallet-filled" title="Wallet" />
      <Tabs.Screen icon="palette" name="buttons" selectedIcon="palette-filled" title="Buttons" />
    </Tabs>
  )
}

import {adaptive, defineTheme} from '@hzblj/kara-ui'

/**
 * PayPal's blue as kara's accent: every accent token overridden in one place, and the Android seed moved with them,
 * so Material's controls grow from the same hue as the payment buttons.
 */
export const theme = defineTheme({
  colors: {
    border: {accent: '#0070ba'},
    content: {accent: adaptive({dark: '#6cb8ff', light: '#005ea6'})},
    fill: {
      accent: {
        base: adaptive({dark: '#0070ba33', light: '#e8f2fb'}),
        disabled: adaptive({dark: '#0070ba1f', light: '#cfe3f5'}),
        primary: '#0070ba',
      },
    },
    shadow: {btn: {accent: {ring: adaptive({dark: '#0070ba00', light: '#b3d4ef'})}}},
  },
  materialSeed: '#0070ba',
})

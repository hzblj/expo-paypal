import {createRunOncePlugin} from 'expo/config-plugins'

import {withPayPal} from './withPayPal'

export {type PluginLinks, resolvePluginLinks} from './links'
export {
  addAndroidLinks,
  addAssociatedDomain,
  addIosLinks,
  INFO_PLIST_KEY,
  META_DATA_RETURN_URL,
  META_DATA_SCHEME,
  type PayPalPluginOptions,
  withPayPal,
} from './withPayPal'

const pkg: {name: string; version: string} = require('../../package.json')

export default createRunOncePlugin(withPayPal, pkg.name, pkg.version)

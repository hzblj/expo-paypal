# expo-paypal

Turborepo + Yarn 4 workspaces for **`@hzblj/expo-paypal`**: PayPal for Expo on the native PayPal SDK 3 (iOS `PayPal`
pod 3.1, Android `com.paypal.android:*` 3.1). React Native and Expo only, no web.

Every package has its own `CLAUDE.md`: read that one before touching it.

| Path | Package | What lives there |
| --- | --- | --- |
| `packages/expo-paypal/` | `@hzblj/expo-paypal` | The JavaScript API (`src/`), the config plugin (`plugin/`), the module (`ios/`, `android/`) and the tests of all four. |
| `apps/example/` | `expo-paypal-example` (private) | Expo Router app: every flow against the sandbox, API routes in `app/api` that create and capture orders with the secret from `.env`, the button gallery. Runs the package from **source**. |
| `scripts/` | | `pack-check.mjs`: the tarball as npm gets it, the plugin loaded from it, a consumer type-checked against it. |
| `media/` | | The example's screens on iOS and Android, light and dark, as the README shows them. Retake them when the example's look changes. |
| `.changeset/`, `.github/workflows/` | | Release notes (`yarn changeset`), CI (Biome, typecheck, tests on Node, iOS and Android, pack check) and the changesets → npm release. |

## Commands

```bash
yarn ios / yarn android      # run the example (dev client)
yarn prebuild                # build the package, then a clean `expo prebuild` of the example
yarn test                    # JavaScript and config plugin tests (node:test)
yarn test:ios                # ios/Core with SwiftPM: `swift test --package-path packages/expo-paypal/ios/Tests`
yarn test:android            # the Android module on the JVM, through the example's Gradle (prebuild first)
yarn typecheck / yarn lint   # tsc, Biome
yarn pack:check              # what npm receives, and a consumer type-check
yarn changeset               # describe a change for the next release
```

## Conventions that bite

**The example runs the package's source; the world runs `build/`.** The package's `exports` names a `source` entry,
which the example's `metro.config.js` maps and its `tsconfig.json` mirrors with `paths`, so nothing waits for a build.
Not a global `source` condition: published packages ship one too, and kara-ui's points at platform-split sources. The config plugin is the exception: prebuild loads `app.plugin.js` → `plugin/build`, which is why
`yarn prebuild` builds the package first.

**Publish through Yarn, tag through changesets.** `yarn release` runs `yarn npm publish` in every public workspace and
then `changeset tag`. Never `changeset publish`: its npm call would ship `workspace:` ranges verbatim.

**Docs copy has no em dashes.** Not in the READMEs, the JSDoc in `src/` (it is the API reference), changesets or the
example's captions. Rewrite with a comma, a colon, parentheses or a second sentence. Code comments are exempt.

**Commits are Jan's alone.** Author `Jan Blazej <hello@janblazej.dev>` (set locally in this repo), no co-author or
generated-by lines.

Code style is Biome-enforced (`@hzblj/biome-config`): 2 spaces, 120 cols, single quotes, no semicolons, sorted imports
and object keys. Named exports and `const` arrow functions; `type` over `interface`.

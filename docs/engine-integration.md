# Engine Integration

## Overview

The frontend consumes the MAGE engine through a vendored packaged dependency, not a public npm package from the registry. This is an important repository assumption.

## Package Source

The current dependency in `package.json` is:

```json
"mage": "file:vendor/mage-engine/mage-1.0.0.tgz"
```

The tarball is kept inside this repository so local installs, CI, and production image builds do not depend on a sibling checkout.

## Why The Frontend Uses An Alias

The frontend does not import the package root directly. Instead, `@mage/engine` is aliased to:

```text
node_modules/mage/js/mage-lib.js
```

This alias exists because the current packaged engine layout is not cleanly consumable from its root export.

Relevant files:

- `vite.config.ts`
- `tsconfig.app.json`
- `src/types/mage-engine.d.ts`

## Shader Park Runtime Compatibility

The current engine package pulls in `shader-park-core` through the bundled browser-facing engine code. The frontend keeps one explicit compatibility patch for that dependency:

- `patches/shader-park-core+0.2.8.patch`

That patch exists because Shader Park executes generated code through `eval(...)` and expects a DSL helper surface to be reachable by name at runtime. Production bundling can otherwise break scene compilation with errors such as `input is not defined`, `time is not defined`, or `rotateY is not defined`.

The frontend does not work around this by disabling Vite production optimizations. Instead:

- `vite.config.ts` aliases `shader-park-core` to the installed ESM bundle
- `patch-package` reapplies the checked-in Shader Park patch on `npm install` and `npm ci`
- the patch temporarily exposes the required Shader Park helper bindings on `globalThis` during the `eval(...)` compile step and restores the previous global values afterward

If the Shader Park version changes, revalidate that patch before assuming production builds will continue to render presets correctly.

## Frontend Boundary

Pages should not import the engine directly. The intended boundary is:

- page code -> `MagePlayer`
- `MagePlayer` -> `magePlayerAdapter`
- `magePlayerAdapter` -> `@mage/engine`

Relevant files:

- `src/components/MagePlayer.tsx`
- `src/lib/magePlayerAdapter.ts`

## Scene Data Expectations

The player adapter treats a value as renderable scene data if it contains at least one recognized engine branch such as:

- `visualizer`
- `controls`
- `intent`
- `fx`
- `state`
- `settings`
- `audioPath`

That keeps route components simple and allows backend `sceneData` payloads to be passed through directly.

## Current Caveats

These are current package-level caveats worth knowing before making engine-related changes:

- the npm registry package named `mage` is not this engine, so the frontend must keep using the local tarball dependency
- when the engine package changes, the vendored tarball in `vendor/mage-engine/` must be refreshed intentionally
- when `shader-park-core` changes, `patches/shader-park-core+0.2.8.patch` must be reviewed and regenerated if needed
- the packaged engine currently emits a build warning for a missing `controltips.png` runtime asset
- `shader-park-core` emits `eval` warnings during build
- the engine bundle is large enough to trigger Vite chunk-size warnings

These warnings do not currently block the frontend build, but they are useful context when debugging engine-related issues.

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
- the packaged engine currently emits a build warning for a missing `controltips.png` runtime asset
- `shader-park-core` emits `eval` warnings during build
- the engine bundle is large enough to trigger Vite chunk-size warnings

These warnings do not currently block the frontend build, but they are useful context when debugging engine-related issues.

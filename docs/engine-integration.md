# Engine Integration

## Overview

The frontend consumes the MAGE engine through a vendored packaged dependency, not a public npm package from the registry. This is an important repository assumption.

## Package Source

The current dependency in `package.json` is:

```json
"mage": "file:vendor/mage-engine/mage-1.0.0.tgz"
```

The tarball is kept inside this repository.

## Why The Frontend Uses An Alias

The frontend does not import the package root directly. Instead, `@mage/engine` is aliased to:

```text
node_modules/mage/dist/mage-engine.js
```

This alias exists because the current packaged engine metadata is still not cleanly consumable from its root export. The shipped tarball includes `dist/mage-engine.js`, but its `package.json` still points `exports.import` at an unshipped `dist/mage-engine.mjs`.

Relevant files:

- `vite.config.ts`
- `tsconfig.app.json`
- `src/types/mage-engine.d.ts`

## Types

The packaged `dist/mage-engine.d.ts` is present, but it still imports `./MAGEEngine.js`, which is not shipped in the tarball. The frontend therefore keeps a small local declaration shim for `@mage/engine` instead of relying on the package types directly.

## Bundled Engine Patch

The frontend reapplies a local patch to:

```text
node_modules/mage/dist/mage-engine.js
```

This happens through `patch-package` during `npm install` and again before `npm run build`.

The patch preserves the Shader Park runtime compatibility shim that used to live in a separate `shader-park-core` patch before the engine moved to a bundled dist file.

It also fixes the current packaged engine teardown bug where `dispose()` clears engine state without stopping the active `requestAnimationFrame` loop, which can otherwise surface as `Cannot set properties of null (setting 'time')` after unmount.

Relevant files:

- `package.json`
- `patches/mage+1.0.0.patch`

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
- when the vendored engine tarball changes, `patches/mage+1.0.0.patch` must be reviewed and usually regenerated against the new bundled file
- the packaged engine root export is still broken, so the frontend must keep aliasing `@mage/engine` to the shipped dist entry file
- the packaged type file still references an unshipped `MAGEEngine.js`, so `src/types/mage-engine.d.ts` remains the frontend source of truth
- the bundled engine still emits `eval` warnings during build
- the engine bundle is large enough to trigger Vite chunk-size warnings

These warnings do not currently block the frontend build, but they are useful context when debugging engine-related issues.

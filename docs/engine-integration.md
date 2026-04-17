# Engine Integration

## Overview

The frontend consumes the MAGE engine from the published `@notrac/mage` package and keeps a small local integration boundary around it.

## Package Source

The current dependency in `package.json` is:

```json
"@notrac/mage": "^1.0.1"
```

The frontend installs this package from the npm registry.

## Why The Frontend Uses An Alias

The frontend does not import the package root directly. Instead, `@mage/engine` is aliased to:

```text
node_modules/@notrac/mage/dist/mage-engine.js
```

This alias preserves a stable frontend import boundary so app code does not depend directly on the external package name.

Relevant files:

- `vite.config.ts`
- `tsconfig.app.json`
- `src/types/mage-engine.d.ts`

## Types

The published package now ships usable declarations, but the frontend still keeps a small local declaration shim for `@mage/engine` so the app can depend on a narrow, explicit surface area instead of the full engine API.

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

- the frontend still keeps the `@mage/engine` alias boundary even though the package is installed from the npm registry
- `src/types/mage-engine.d.ts` remains the frontend source of truth for the app-facing engine API surface
- the bundled engine still emits `eval` warnings during build
- the engine bundle is large enough to trigger Vite chunk-size warnings

These warnings do not currently block the frontend build, but they are useful context when debugging engine-related issues.

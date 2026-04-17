# Engine Integration

## Overview

The frontend defaults to the published `@notrac/mage` package and keeps a small local integration boundary around it. It can also switch to the vendored `mage-1.0.0.tgz` package for A/B comparisons.

## Package Sources

The frontend keeps both engine sources available in `package.json`:

```json
"@notrac/mage": "^1.0.1",
"mage-local": "file:vendor/mage-engine/mage-1.0.0.tgz"
```

The published package is the default. The local tarball package is only there so the frontend can be launched against the old bundled engine for comparison.

## Why The Frontend Uses An Alias

The frontend does not import either package root directly from app code. Instead, `@mage/engine` is aliased by Vite to one of the installed packages:

- `@notrac/mage` by default
- `mage-local` when `VITE_MAGE_ENGINE_SOURCE=local`

This preserves a stable frontend import boundary so app code does not depend directly on either package name.

Relevant files:

- `vite.config.ts`
- `src/types/mage-engine.d.ts`

For comparison runs, use:

- `npm run dev:engine-published`
- `npm run dev:engine-local`

The matching build scripts are also available if you want to compare production bundles.

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

- the frontend still keeps the `@mage/engine` alias boundary even though the runtime package can change by mode
- `src/types/mage-engine.d.ts` remains the frontend source of truth for the app-facing engine API surface
- the bundled engine still emits `eval` warnings during build
- the engine bundle is large enough to trigger Vite chunk-size warnings

These warnings do not currently block the frontend build, but they are useful context when debugging engine-related issues.

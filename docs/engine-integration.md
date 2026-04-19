# Engine Integration

## Overview

The frontend uses the published `@notrac/mage` package for scene playback and preview.

App code should not talk to the engine directly. The intended boundary is:

- page code -> `MagePlayer`
- `MagePlayer` -> `src/lib/magePlayerAdapter.ts`
- `magePlayerAdapter` -> `@notrac/mage`

That keeps engine-specific startup, loading, and disposal logic in one place.

## Current Integration

The adapter loads the engine dynamically, creates it for a canvas, loads a scene blob, leaves the package's native control system enabled, exposes shared play/pause controls, and disposes it on unmount.

Relevant files:

- `src/components/MagePlayer.tsx`
- `src/lib/magePlayerAdapter.ts`

## Scene Data

The adapter accepts backend `sceneData` objects directly. It treats a value as renderable scene data when it contains at least one engine-recognized root branch such as:

- `visualizer`
- `controls`
- `intent`
- `fx`
- `state`
- `settings`
- `audioPath`

## Why The Adapter Exists

The adapter is doing more than forwarding calls:

- it keeps engine imports out of route components
- it validates scene blobs before loading
- it applies the current startup workaround for the published engine so scenes do not stall at time `0`
- it centralizes pause/resume behavior so every embedded `MagePlayer` uses the same playback model
- it starts the engine without the package's built-in controls bootstrap, so embedded player UI stays frontend-owned

## Current Caveats

- The published package types are still incomplete for the runtime behavior the frontend uses. The adapter keeps a small local bridge type for that gap.
- The engine bundle still emits `eval` warnings during `vite build`. The build succeeds, but those warnings are coming from the published package.
- The engine bundle is very large and still triggers Vite chunk-size warnings. That does not block builds, but it is a real startup-cost concern.
- Enabling mouse-driven controls also means the published package may render its own control chrome alongside the app's custom playback bar.

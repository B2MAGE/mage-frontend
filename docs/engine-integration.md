# Engine Integration

## Overview

The frontend uses the published `@notrac/mage@1.0.3` package for scene playback and preview.
The version is pinned exactly because the checked-in patch targets that release.
Unreleased GitHub engine changes are not included.

App code should not talk to the engine directly. The intended boundary is:

- feature/page code -> `@modules/player`
- `@modules/player` -> `src/modules/player/infrastructure/engineAdapter.ts`
- `engineAdapter` -> `@notrac/mage`

That keeps engine-specific startup, loading, audio bridging, and disposal logic in one place.

The adapter and the checked-in package patch are both infrastructure. Feature modules should not depend on raw engine package behavior, patched internals, or browser-workaround code directly.

## Current Integration

The adapter loads the engine dynamically, creates it for a canvas, loads a scene blob, keeps the
package's native control system disabled, exposes shared playback and audio controls, and disposes
the engine on unmount.

Relevant files:

- `src/modules/player/index.ts`
- `src/modules/player/MagePlayer.tsx`
- `src/modules/player/playlist.ts`
- `src/modules/player/infrastructure/engineAdapter.ts`

## Scene Data

The adapter accepts backend `sceneData` objects directly. It treats a value as renderable scene
data when it contains at least one engine-recognized root branch such as:

- `visualizer`
- `controls`
- `intent`
- `fx`
- `state`
- `settings`
- `audioPath`
- `audio`

## Why The Adapter Exists

The adapter is doing more than forwarding calls:

- it keeps engine imports out of route components
- it isolates engine patch assumptions behind a frontend-owned infrastructure layer
- it validates scene blobs before loading
- it applies the current startup workaround for the published engine so scenes do not stall at time `0`
- it centralizes scene pause/resume behavior so every embedded `MagePlayer` uses the same playback model
- it bridges local audio loading, clearing, seeking, and volume into a single frontend-safe controller
- it explicitly loads saved `audioPath` or compatible root-level audio metadata on demand
- it starts the engine without the package's built-in controls bootstrap, so embedded player UI stays frontend-owned

## Audio Model

The adapter exposes a small player-friendly API rather than leaking the raw engine bridge:

- `loadSceneBlob()`
- `setPlaybackState()`
- `getPlaybackState()`
- `loadAudio()`
- `clearAudio()`
- `seekAudio()`
- `setAudioVolume()`
- `getAudioState()`
- `dispose()`

The frontend player uses that bridge to support:

- route-owned playlists
- local device audio files
- synchronized scene/audio play-pause
- scrubber + volume controls

## Package Patch Notes

The frontend currently patches `@notrac/mage@1.0.3` with `patch-package`.

Relevant repo-owned pieces are:

- `patches/@notrac+mage+1.0.3.patch`
- `postinstall` in `package.json`
- `prebuild` in `package.json`

The patch is applied during install and before builds. Both hooks use `--error-on-fail`
so an incompatible or missing hunk cannot silently ship an unpatched runtime.
`patch-package` is a direct production dependency because 1.0.3 no longer supplies
it transitively and the install hook must also work when dev dependencies are omitted.

The 1.0.3 upgrade retains every functional correction from our 1.0.1 patch:

- ShaderPark exposes `setStepSize`, `torus`, and `cylinder` to compiled scene code.
- ShaderPark's render callback skips undeclared uniforms, allowing custom shaders
  to omit unused `size` or `pointerDown` inputs without crashing.
- The render clock accumulates elapsed time, updates Three's timer, clamps suspension
  jumps, and resets the timer when resuming.
- `pause()` stops rendering, `play()` resumes even without audio, and `dispose()`
  releases resources even when the engine was paused.
- Audio playback position is resolved from the audio clock; volume getters/setters
  and `unloadAudio()` retain the shared player/playlist contract.
- `setSyntheticPreview(enabled, seed, tempoScale)` retains deterministic silent
  thumbnail/About beats. Actual playing audio takes priority.
- Optional `pixelRatio` preserves the About/home artwork's smoother rendering. When
  omitted, 1.0.3's low-quality/device-density behavior is unchanged.
- Package declarations include the preserved methods and render-density option.

The upstream `previewMAGE` mode and its low-quality rendering option remain intact;
they do not replace our shared, cancellable hover-preview coordinator. Its existing
synthetic rhythm and About page half-tempo behavior are intentionally unchanged.

Browser verification also exposed two regressions in 1.0.3's visualizer refactor:
loading a preset created its mesh without attaching it to the rendered scene, and
exporting a preset read a shader property the visualizer no longer maintained.
The patch attaches the loaded mesh, releases replaced rendering resources, and
exports the active shader. This preserves existing scene geometry and editor
round-tripping without rewriting saved scene data.

The audio compatibility patch also clears accumulated playback progress when
seeking while paused. Otherwise Three's previous progress was added to the new
offset, making the actual resume position differ from the selected time.

The patch does not replace the adapter. The patch fixes published-package behavior the frontend depends on, while the adapter keeps the app-facing API stable and localizes engine-specific startup and runtime logic.

If the engine package version changes:

1. review and regenerate the checked-in patch as needed
2. verify `src/modules/player/infrastructure/engineAdapter.ts` still matches the package behavior
3. rerun player/editor verification because those surfaces depend on the patched runtime boundary

Regression coverage includes `engineClock.test.ts`, `engineCompatibility.test.ts`,
and the adapter/player tests. Also verify real WebGL rendering, all bundled shaders,
saved scene loading, local audio play/pause/seek/volume/clear, hover previews, and
the About/home artwork in a browser. Unit tests alone cannot validate WebGL output.

No feature module should import from `patches/` or from `@notrac/mage` directly.

## Current Caveats

- The published package types are still incomplete for the runtime behavior the frontend uses. The adapter keeps a small local bridge type for that gap.
- The engine bundle still emits `eval` warnings during `vite build`. The build succeeds, but those warnings are coming from the published package.
- The engine bundle is very large and still triggers Vite chunk-size warnings. That does not block builds, but it is a real startup-cost concern.
- 1.0.3 separates mouse controls from its editor UI with `active: true, integrated: false`.
  However, its default input bridge still includes shader reset/switch shortcuts and
  control tooltips. The app retains `active: false, integrated: false` until a separate
  viewer-only interaction change filters those behaviors. This upgrade does not
  enable mouse interaction or modify saved scenes.
- Published 1.0.3 still uses the legacy single-frequency-bin audio mapping. The
  unpublished bass/mid/treble analysis is not part of this upgrade.

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
package's editor/control bootstrap disabled, exposes shared playback and audio controls, and disposes
the engine on unmount. Full `MagePlayer` surfaces opt into canvas-local mouse reactions through
`viewerMouseInteractions.ts` and bounded mouse-wheel zoom via `mouseWheelZoom: true`.
The shared About/home artwork opts into mouse reactions but leaves wheel scrolling alone,
while thumbnail hover previews remain noninteractive.

Relevant files:

- `src/modules/player/index.ts`
- `src/modules/player/MagePlayer.tsx`
- `src/modules/player/playlist.ts`
- `src/modules/player/infrastructure/engineAdapter.ts`
- `src/modules/player/infrastructure/viewerMouseInteractions.ts`
- `src/modules/player/infrastructure/viewerPointerDeformation.ts`

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

Toon uses a scene-texture post-processing shader with stepped luminance and
pixel-sized outlines. The package's original implementation incorrectly rebuilt
the pass from a numeric shader choice, and its initial mesh-material Toon shader
could not process a rendered image. The corrected pass is reused across effect
refreshes and its resolution follows canvas resizing and thumbnail rendering.

Compact presets load/export `fx.passes.bleachBypass` and `fx.passes.toon`.
Missing flags turn these effects off when loading legacy scenes, so a reused
player never carries either effect into another scene. The editor exposes both
with normal effect toggles. Copy stays hidden in the editor but existing raw
pass-order entries are preserved for compatibility.

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

## Editor shaders and beat preview

The shader catalog includes all fourteen built-in 1.0.3 shaders (including preset
13, named Rose Circuit in the app). Selecting a shader does not replace camera,
skybox, or effect settings.

Ripple Rings and Tidal Lantern are additional shader choices with their own
authored audio behavior. Audio Gain controls signal sensitivity, and Easing Speed
controls smoothing; scene geometry responds as defined by its shader. The editor
does not rewrite shader source or apply additional scene-wide audio transforms.

## Current Caveats

- The published package types are still incomplete for the runtime behavior the frontend uses. The adapter keeps a small local bridge type for that gap.
- The engine bundle still emits `eval` warnings during `vite build`. The build succeeds, but those warnings are coming from the published package.
- The engine bundle is very large and still triggers Vite chunk-size warnings. That does not block builds, but it is a real startup-cost concern.
- 1.0.3's native controls bootstrap also installs global listeners, editor shortcuts,
  and control tooltips. We initialize with `active: false, integrated: false`, then
  opt full players into a filtered, canvas-local input bridge without calling that
  bootstrap. Native left-button orbit dragging is enabled. Full players also opt into
  wheel zoom over their canvas, bounded to 0.4–2.5 times the authored camera-target
  distance (with a near-clip safeguard). Limits are cleared before preset loading and
  recalibrated afterward so one scene's limits never alter another scene's framing.
  Artwork leaves wheel scrolling alone. Pan and touch camera gestures stay disabled;
  Ctrl/Meta+wheel, scrolling outside the canvas, and right-click remain browser-owned.
  Mouse-aware shaders retain their own interaction behavior. Shaders that declare but
  ignore pointer input receive a bounded, smoothed live-material deformation while
  hovering/pressing. Neutral input preserves the original geometry, and disposal
  restores the original material. No source shader or saved scene is rewritten.
  Leaving the canvas, scrolling, losing
  focus, hiding the page, or disposing the player clears interaction state. The
  narrow runtime-only `getEngineFields()` type stays inside player infrastructure.
  This does not change saved scene data. The About/home artwork reuses this interaction
  path; thumbnail hover previews remain noninteractive.
- Published 1.0.3 still uses the legacy single-frequency-bin audio mapping. The
  unpublished bass/mid/treble analysis is not part of this upgrade.

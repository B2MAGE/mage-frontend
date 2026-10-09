# Engine Integration

## Overview

The frontend uses a built release from [B2MAGE/mage-engine](https://github.com/B2MAGE/mage-engine),
installed under the existing `@notrac/mage` import alias. The dependency URL and
lockfile pin the tested artifact. See [engine package maintenance](engine-package.md)
for upstream synchronization, source ownership, release and rollback instructions.

App code should not talk to the engine directly. The intended boundary is:

- feature/page code -> `@modules/player`
- `@modules/player` -> `src/modules/player/infrastructure/engineAdapter.ts`
- `engineAdapter` -> `@notrac/mage`

That keeps engine-specific startup, loading, audio bridging, and disposal logic in one place.

PP-I01 adds a separately bundled child entry at `src/isolated-renderer/main.ts`.
Its engine import runs only in the restricted renderer document; the parent host
under `src/modules/player/isolation` never imports the engine. This fixed-sample
bootstrap does not yet route user scenes or audio. See [isolated renderer](isolated-renderer.md)
for local checks, hosting policy, AWS handoff, and the PP-I02/PP-I03 release boundary.

The adapter and maintained engine package are infrastructure. Feature modules use the player module API rather than engine internals or browser-workaround code.

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
- it isolates engine integration details behind a frontend-owned infrastructure layer
- it validates scene blobs before loading
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
- `getAudioResponseState()` / `setAudioResponseSettings()` / `setAudioResponseOverride()`
- `getAudioResponseCapabilities()` / `getAudioResponseDiagnostics()` / `getAudioResponseEvents()`
- `dispose()`

Authored response settings are saved in scene JSON; viewer overrides remain temporary adapter state.
Configuration changes use the existing player and audio source. See [Audio response configuration](audio-response.md)
for persistence, scene identity, compatibility, and diagnostics behavior.

The frontend player uses that bridge to support:

- route-owned playlists
- local device audio files
- synchronized scene/audio play-pause
- scrubber + volume controls

### Audio selection by surface (#237)

`MagePlayer.audioMode` is explicit at the main call sites: Create/Edit previews
and Home featured use `single`; the scene detail player uses `playlist` (also the
default for compatibility). Single-song players show the current filename and
Add song / Replace song, accept one file, and never auto-advance or repeat a
hidden queue. Scene detail retains multi-file selection and playlist navigation.

A replacement remains a candidate until Web Audio decoding, playback readiness,
and the final availability check succeed. The old song, position and volume stay
usable on failure or cancellation. Success starts the new song at zero and keeps
the user's current play/pause choice. Cancelled or superseded loads cannot commit;
decoding remains bounded to one active job and the newest queued job. Committing
a replacement retires the old local object URL; stopping or leaving cancels and
releases a pending candidate. Compatible live edits and temporary permission
checks retain the player and its pending selection.

This is parent-side player behavior and requires no engine patch or renderer
protocol change.

### Clear music (#238)

Every player exposes Clear music in its existing Playback options cogwheel,
including stopped, blocked and loading players. It unloads the current audio,
empties the session queue, resets the title and seek bar, and cancels pending file
selection, metadata reads and decoding. Stale results cannot restore music after
clearing. The same file can be selected again immediately.

Scene detail also resets its original/shuffled order, selection and repeat state,
closes the playlist, and releases removed device URLs once. Clearing does not edit
saved scene or account data, recreate the renderer, change visual play/pause intent,
or bypass recovery/moderation. Simulated beat settings and volume are retained.
The existing audio unload bridge resets the music response. This change requires
only the frontend deployment; it adds no engine patch or renderer protocol message.

## Maintained package behavior

The fork owns the source implementations previously carried by the frontend's
1.0.3 compiled-output patch. These include:

- the compiler-only entry and independent compiled-artifact validation
- dynamic ShaderPark helpers and safe updates of declared uniforms
- scene attachment, replacement, capture, export and resource disposal
- external audio/visual clocks, pause/resume/seek and synthetic preview
- current audio analysis/mapping and existing response modes
- bounded live settings, post-processing effects and render-density options

Package installation no longer applies a patch or generates a compiler from an
installed bundle. The maintained source build produces all required entrypoints.
The adapter continues to own the app-facing API.

Consumer regression coverage includes `engineClock.test.ts`,
`engineCompatibility.test.ts`, compiled-output/live-setting checks and the
adapter/player tests. Also verify real WebGL rendering, supported shaders,
local audio controls, hover previews and fixed artwork in a browser when adopting
an engine release. Unit tests alone cannot establish rendered appearance.

## Opt-in transient audio response

Scenes may persist `audioResponse: "transient-v1"` at the scene-data root. Missing,
unknown, or `"legacy"` values retain the original calculation. Both the preset
loader and adapter select the mode explicitly on every load/reset; a reused
player cannot carry the new mode into an old scene. Editor JSON import, structured
edits, and save preserve the versioned field. No new reaction sliders are added.
For opted-in scenes the editor explains automatic beat response and hides the
legacy Audio Gain, Audio Curve, Base Speed, Easing Speed, and Volume Multiplier
controls, which are not used by this mode. Their stored values are preserved
while editing a beat-detection scene. Playback volume remains available.

The engine owns the analysis, not a second React animation loop. For opted-in
scenes only, a separate FFT-2048 analyser with no frequency-frame smoothing measures
positive spectral changes in 40–180 Hz, 180–2000 Hz, and 2–8 kHz bands. Local energy
normalization and an adaptive threshold reduce dependence on recording loudness
and sustained notes. A silence floor, short startup warmup, and 160 ms retrigger
guard suppress noise/duplicate hits. This detects musical attacks, not a predicted
tempo grid; it does not guarantee recognition of every perceived beat.

Each attack produces a bounded envelope with fast onset and a time-based 160 ms
exponential release. `size` receives `0.006 + envelope` (0–1 envelope). This path
uses the audio clock rather than the capped rendering delta, so a slow renderer
does not stretch the release. A long suspension re-primes the detector.
The response
intentionally bypasses legacy power, additive offsets, and easing so they cannot
flatten the envelope again. The shader still determines what moves; shaders that
ignore `size` do not gain automatic deformation. The ten retuned Ari scenes use
the envelope directly instead of their previous saturating response curve.

The old analyser and numerical mapping are unchanged. The new side branch is
disconnected/reset on mode/track changes, seeking, unload, and disposal; it never
disconnects the audible playback graph. Forward/reversed playback selects the
active source. Real playing audio takes precedence over silent preview; opted-in
synthetic previews use the same bounded attack/release-style range without the
old sustained baseline. The upstream frame-capture preview behavior is unchanged.

Validation must measure repeated attacks and recovery after startup, including
drums over sustained chords, low levels, silence, multiple sample/frame rates,
and actual music. Comparing two still poses is not a sufficient audio test.

## Editor shaders and beat preview

The shader catalog includes all fourteen built-in 1.0.3 shaders (including preset
13, named Rose Circuit in the app). Selecting a shader does not replace camera,
skybox, or effect settings.

Create/Edit Scene can opt MagePlayer into `simulatedBeat: { enabled, bpm }`.
This uses the existing synthetic-preview adapter with seed 24 (120 BPM) and
`tempoScale = bpm / 120`, bounded to 60–180 BPM. Updates reuse the player and
loaded scene. Playback pause freezes the preview; actual playing audio takes
priority. This is silent and editor-local: neither the toggle nor tempo is
serialized in the saved scene. Engine animation speed does not change the tempo.

Ripple Rings and Tidal Lantern are additional shader choices with their own
authored audio behavior. Audio Gain controls signal sensitivity, and Easing Speed
controls smoothing; scene geometry responds as defined by its shader. The editor
does not rewrite shader source or apply additional scene-wide audio transforms.

## Current Caveats

- The published package declarations still omit the runtime `getEngineFields()` shape and do not model the value returned by `loadPreset()`. The adapter keeps those two narrow type corrections local.
- The engine bundle still emits `eval` warnings during `vite build`. The build succeeds, but those warnings are coming from the published package.
- The engine bundle is very large and still triggers Vite chunk-size warnings. That does not block builds, but it is a real startup-cost concern.
- The native controls bootstrap also installs global listeners, editor shortcuts,
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
- The legacy single-frequency-bin audio mapping remains the default in this
  migration. The fork also retains the existing `transient-v1` and `mapped-v1`
  modes. Removing compatibility behavior belongs to the later MAINT-02 cleanup.

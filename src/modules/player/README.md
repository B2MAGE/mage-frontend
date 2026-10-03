# Player Module

This directory is the frontend-owned boundary for scene playback.

## Public API

Import player behavior through `@modules/player`.

Exports:

- `MagePlayer`
- `MagePlayerProps`
- `createMagePlayer()`
- `listSceneTemplates()` (immutable picker metadata, without executable source)
- `parseSceneDocument()` / `SceneContractError`
- `SceneDocument`, `TemplateSceneDocument`, `CustomSceneDocument`, `SceneTemplate`
- `MagePlayerController`
- `MageSceneBlob`
- `MagePlayerPlaybackState`
- `MagePlayerAudioState`
- `MagePlayerPlaylistTrack`
- `buildScenePlaylistTrack()`
- `formatPlaylistTrackName()`
- `mergePlaylistTrackCollections()`
- `readPlaylistTrackDisplayName()`
- `readPlaylistTrackMetaLine()`
- `readPlaylistTrackSummaryName()`
- `revokePlaylistTrackSource()`
- `revokePlaylistTrackSources()`
- `shufflePlaylistTracks()`

## Internal Responsibilities

- `MagePlayer.tsx`
  Shared React boundary for embedding the player in homepage, scene detail, and editor preview surfaces.
- `playlist.ts`
  Frontend-owned playlist types and helper functions used by the player module and consuming feature modules.
- `useMagePlayerPlaylist.ts`
  Internal playlist state orchestration for the shared player UI.
- `infrastructure/engineAdapter.ts`
  Engine bootstrap, scene loading, audio bridging, and patch-aware runtime behavior for `@notrac/mage`.

## Component Surface

`MagePlayer` accepts:

- `sceneBlob`
- `sceneKey?` (stable scene identity; pass a route scene ID when available)
- `ariaLabel?`
- `className?`
- `initialPlayback?`
- `log?`

Optional route-level playlist props:

- `playlistTracks?`
- `selectedTrackId?`
- `repeatEnabled?`
- `shuffleEnabled?`
- `onPlaylistChange?`
- `onRequestPlaylistOpen?`
- `onSelectedTrackChange?`
- `onTrackDurationChange?`

The adapter accepts versioned template/custom documents described in
[`contracts/scenes`](../../../contracts/scenes/README.md). Template documents are validated
before any engine load and resolved from the immutable platform library. The source never
comes from the submitted document. All 16 existing shader presets have a version 1 entry.

For compatibility, the adapter also accepts legacy scene blobs with an engine-recognized root
branch such as `visualizer`, `controls`, `intent`, `fx`, `state`, `settings`, `audioPath`, or `audio`.
Legacy blobs and explicit custom documents remain **untrusted**, even when their source matches
a template. PP-B01 does not isolate their existing execution path; PP-I01–I03 own that work.
Documents with any version/kind/template markers cannot fall back to legacy loading when invalid.

## Runtime Behavior

- `sceneBlob={null}` or `undefined` shows the empty state
- the engine is created once the canvas mounts
- the current scene is applied when both the player and a valid `sceneBlob` are available
- changes only to saved audio-response settings apply live, preserving the song, position, volume, and playlist; changing `sceneKey` always loads the new scene, even for identical documents
- native editor controls/shortcuts stay disabled; full players support left-button drag rotation, canvas-local mouse/press reactions, and wheel-to-zoom over the canvas
- wheel zoom uses limits relative to the scene's authored camera distance (0.4–2.5 times the distance, respecting the near clip plane); these limits reset on scene load, not on hover changes
- shaders without their own pointer response receive a bounded live-material deformation, leaving saved scene data untouched
- `simulatedBeat={{ enabled, bpm }}` provides a silent editor-only rhythm at 60–180 BPM; actual playing music takes priority, and preview tempo is not saved
- About/home artwork keeps rotation and mouse reactions but leaves wheel scrolling alone; thumbnail hover previews stay noninteractive (`createMagePlayer` defaults to `mouseInteractions: false` and `mouseWheelZoom: false`)
- Ctrl/Meta+wheel and touch gestures remain browser-owned, and scrolling outside the player canvas is unchanged
- `initialPlayback="paused"` freezes the scene until the user presses `Play`
- `initialPlayback="playing"` keeps the scene running and shows a `Pause` control instead
- invalid scene data produces a recoverable error overlay instead of crashing the page
- versioned documents always take the validated scene-load path; the audio-only update shortcut is limited to legacy scenes
- the engine instance is disposed on unmount

Audio and playlist notes:

- `Add` opens a device file picker and appends selected files as playlist tracks
- local device tracks become playlist entries with generated ids and blob-backed source paths
- the shared play/pause button drives both scene playback state and the currently loaded audio track
- scrubbing and volume controls activate after an audio track is loaded
- route-owned playlist panels, such as the scene-detail sidebar, stay outside the shared player

Current route defaults:

- `HomePage` starts its hero preview in `playing`
- `SceneDetailPage` starts the main watch player in `playing`
- `CreateScenePage` starts the editor preview in `playing`

## Integration Rules

1. Feature modules should import from `@modules/player`, not from `@notrac/mage` or `infrastructure/engineAdapter.ts`.
2. Treat the engine adapter as infrastructure. Engine patch assumptions, startup workarounds, and browser/runtime quirks stay behind that layer.
3. Full playback surfaces should embed `MagePlayer` and pass raw backend `sceneData` objects as `sceneBlob`. Controls-free previews may use `createMagePlayer()` through this public module boundary, must share renderer instances where practical, and must dispose their controller when no preview consumers remain.
4. Route-owned playlist editing UI may keep its own state, but shared playlist types and helpers come from this module.

The controller also exposes authored audio settings, temporary viewer overrides, scene capabilities,
diagnostics, and timestamped events. Use `setAudioResponseSettings()` for authored preview settings and
`setAudioResponseOverride()` for temporary viewer changes. An override never modifies saved scene data.
See `docs/audio-response.md` for the full contract and `scenePlaybackIdentity()` for the shared rule
that distinguishes a configuration update from a scene reload.

## Template authoring handoff

PP-B01 provides the contract, code-free catalog metadata, and playback resolution. The existing
editor's Shader dropdown still writes legacy custom source. PP-B03 will replace that picker with
template selection and preserve template ID/version and bounded data during editing and saving.
Do not run template documents through the legacy editor's `sanitizeSceneData` helpers: those
helpers add engine fields and would make a template document invalid. Source edits must create
a custom document, never alter the trusted registry or retain a template classification.

Template shader snapshots and version 1 engine defaults are private under `templates/`.
Changing source or defaults requires a new template version; old saved scenes must retain
their old ID/version resolution. The shared JSON catalog pins source fingerprints for regression
checks but is not a mechanism for approving submitted source.

## Tests

Coverage lives in the colocated player specs under `src/modules/player/`.

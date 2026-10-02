# Player Module

This directory is the frontend-owned boundary for scene playback.

## Public API

Import player behavior through `@modules/player`.

Exports:

- `MagePlayer`
- `MagePlayerProps`
- `createMagePlayer()`
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

The adapter accepts scene blobs that contain at least one engine-recognized root branch such as
`visualizer`, `controls`, `intent`, `fx`, `state`, `settings`, `audioPath`, or `audio`.

## Runtime Behavior

- `sceneBlob={null}` or `undefined` shows the empty state
- the engine is created once the canvas mounts
- the current scene is applied when both the player and a valid `sceneBlob` are available
- native editor controls/shortcuts stay disabled; full players support left-button drag rotation, canvas-local mouse/press reactions, and wheel-to-zoom over the canvas
- wheel zoom uses limits relative to the scene's authored camera distance (0.4–2.5 times the distance, respecting the near clip plane); these limits reset on scene load, not on hover changes
- shaders without their own pointer response receive a bounded live-material deformation, leaving saved scene data untouched
- About/home artwork keeps rotation and mouse reactions but leaves wheel scrolling alone; thumbnail hover previews stay noninteractive (`createMagePlayer` defaults to `mouseInteractions: false` and `mouseWheelZoom: false`)
- Ctrl/Meta+wheel and touch gestures remain browser-owned, and scrolling outside the player canvas is unchanged
- `initialPlayback="paused"` freezes the scene until the user presses `Play`
- `initialPlayback="playing"` keeps the scene running and shows a `Pause` control instead
- invalid scene data produces a recoverable error overlay instead of crashing the page
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

## Tests

Coverage lives in the colocated player specs under `src/modules/player/`.

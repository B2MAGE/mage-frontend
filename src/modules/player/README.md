# Player Module

This directory is the frontend-owned boundary for scene playback.

## Public API

Import player behavior through `@modules/player`.

Exports:

- `MagePlayer`
- `MagePlayerProps`
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
- the package's native engine controls are disabled so embedded player UI stays frontend-owned
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
3. Pages should embed playback through `MagePlayer` and pass raw backend `sceneData` objects as `sceneBlob`.
4. Route-owned playlist editing UI may keep its own state, but shared playlist types and helpers come from this module.

## Tests

Coverage lives in the colocated player specs under `src/modules/player/`.

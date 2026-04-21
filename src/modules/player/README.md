# Player Module

This directory is the dedicated frontend-owned boundary for scene playback.

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
  Route-facing React boundary for embedding the player in homepage, scene detail, and editor preview surfaces.
- `playlist.ts`
  Frontend-owned playlist types and helper functions used by the player module and consuming feature modules.
- `useMagePlayerPlaylist.ts`
  Internal playlist state orchestration for the shared player UI.
- `infrastructure/engineAdapter.ts`
  Engine bootstrap, scene loading, audio bridging, and patch-aware runtime behavior for `@notrac/mage`.

## Integration Rules

1. Feature modules should import from `@modules/player`, not from `@notrac/mage` or `infrastructure/engineAdapter.ts`.
2. Treat the engine adapter as infrastructure. Engine patch assumptions, startup workarounds, and browser/runtime quirks stay behind that layer.
3. Pages should embed playback through `MagePlayer` and pass raw backend `sceneData` objects as `sceneBlob`.
4. Route-owned playlist editing UI may keep its own state, but shared playlist types and helpers come from this module.

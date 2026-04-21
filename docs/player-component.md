# Player Component

## Overview

`MagePlayer` is the shared React boundary for rendering MAGE scenes in the browser. Pages should
pass a scene blob into the component and let the shared adapter handle engine startup, scene
loading, audio state, and disposal.

## Related Files

- `src/components/MagePlayer.tsx`
- `src/components/mage-player/MagePlayerControls.tsx`
- `src/components/mage-player/useMagePlayerPlaylist.ts`
- `src/lib/magePlayerAdapter.ts`
- `src/lib/magePlayerPlaylist.ts`
- `src/components/MagePlayer.test.tsx`

## Public Interface

`MagePlayer` accepts:

- `sceneBlob`: `MageSceneBlob | null | undefined`
- `ariaLabel?`: optional canvas label
- `className?`: optional wrapper class
- `initialPlayback?`: `'playing' | 'paused'` starting playback mode for the loaded scene
- `log?`: optional engine logging flag

Optional playlist-management props used by route-level pages:

- `playlistTracks?`
- `selectedTrackId?`
- `repeatEnabled?`
- `shuffleEnabled?`
- `onPlaylistChange?`
- `onRequestPlaylistOpen?`
- `onSelectedTrackChange?`
- `onTrackDurationChange?`

Example:

```tsx
import { MagePlayer } from "../components/MagePlayer";

export function SceneDetail({
  scene,
}: {
  scene: { name: string; sceneData: Record<string, unknown> };
}) {
  return (
    <section>
      <h1>{scene.name}</h1>
      <MagePlayer
        ariaLabel={`${scene.name} preview`}
        initialPlayback="playing"
        sceneBlob={scene.sceneData}
      />
    </section>
  );
}
```

## Expected Scene Data

The adapter accepts scene blobs that contain at least one engine-recognized root branch such as:

- `visualizer`
- `controls`
- `intent`
- `fx`
- `state`
- `settings`
- `audioPath`
- `audio`

Pages should pass the raw `sceneData` object returned by the backend instead of manually reshaping
it in route code.

## Runtime Behavior

- `sceneBlob={null}` or `undefined` shows the empty state
- the engine is created once the canvas mounts
- the current scene is applied when both the player and a valid `sceneBlob` are available
- the package's native engine controls are disabled, so the engine's built-in controls UI does not appear
- `initialPlayback="paused"` freezes the scene until the user presses `Play`
- `initialPlayback="playing"` keeps the scene running and shows a `Pause` control instead
- when the player is ready, hover or keyboard focus reveals a playback bar at the bottom of the viewport
- on touch devices the playback bar stays visible so the control surface is not hover-only
- the playback bar includes:
  - a track summary
  - an audio scrubber with current time and duration
  - an `Add` action for loading local audio files
  - a volume popover
  - a shared play/pause button for scene + loaded audio playback
- when tracks exist and the parent provides `onRequestPlaylistOpen`, clicking the track summary opens the route-owned playlist UI
- invalid scene data produces a recoverable error overlay instead of crashing the page
- the engine instance is disposed on unmount

## Audio And Playlist Notes

The player supports ad hoc audio loading from the user's device.

Current behavior:

- `Add` opens a device file picker and appends selected files as playlist tracks
- local device tracks are represented as playlist entries with generated ids and blob-backed source paths
- the player loads the selected track into the engine on demand
- the shared play/pause button drives both scene playback state and the currently loaded audio track
- scrubbing and volume controls only activate after an audio track is loaded
- the component exposes playlist hooks, but the playlist panel itself is owned by route UI such as `SceneDetailPage`

Saved backend scene data can still seed an initial track via `audioPath` or compatible root-level
audio metadata, but the current shared player experience is built around the route-managed playlist
model.

## Integration Rules

- do not call `initMAGE()` directly from route components
- keep engine-specific logic inside `src/lib/magePlayerAdapter.ts`
- keep route-level playlist state outside the player when a page needs track editing, shuffle, repeat, or side-panel UI
- if a page swaps scenes, pass the next `sceneBlob` to the same `MagePlayer` instance and let the component reload it
- use `initialPlayback` from route code instead of building page-specific play/pause overlays

## Current Route Defaults

- `HomePage` starts its hero preview in `playing`
- `SceneDetailPage` starts the main watch player in `playing`
- `CreateScenePage` starts the editor preview in `playing`

## Tests

Main coverage lives in:

- `src/components/MagePlayer.test.tsx`

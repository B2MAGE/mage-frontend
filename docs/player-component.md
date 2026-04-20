# Player Component

## Overview

`MagePlayer` is the React boundary for rendering MAGE scenes in the browser. Pages should pass a scene blob into the component and let the shared adapter handle engine startup, scene loading, and disposal.

## Related Files

- `src/components/MagePlayer.tsx`
- `src/lib/magePlayerAdapter.ts`
- `src/components/MagePlayer.test.tsx`

## Public Interface

`MagePlayer` accepts:

- `sceneBlob`: `MageSceneBlob | null | undefined`
- `ariaLabel?`: optional canvas label
- `className?`: optional wrapper class
- `initialPlayback?`: `'playing' | 'paused'` starting playback mode for the loaded scene
- `log?`: optional engine logging flag

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

Pages should pass the raw `sceneData` object returned by the backend instead of manually reshaping it in page code.

## Runtime Behavior

- `sceneBlob={null}` or `undefined` shows the empty state
- the engine is created once the canvas mounts
- the current scene is applied when both the player and a valid `sceneBlob` are available
- the package's native engine controls are disabled, so the engine's built-in controls UI does not appear
- `initialPlayback="paused"` freezes the scene on its current frame until the user presses `Play`
- `initialPlayback="playing"` keeps the scene running and shows a `Pause` control instead
- when the player is ready, hover or keyboard focus reveals a playback bar at the bottom of the viewport
- on touch devices the playback bar stays visible so the control is not hover-only
- when `audioPath` or compatible root-level audio metadata is present, the playback bar shows the saved audio file name
- `Load` pulls the saved audio source into the engine on demand instead of auto-loading it on scene mount
- when a scene has no saved audio source, `Load` opens a device file picker so the user can choose local audio manually
- the shared play/pause button drives both scene playback state and loaded audio playback
- `Reset` returns the scene and any loaded audio to the beginning in a paused state
- the app's custom playback bar is the only player UI shown by default
- invalid scene data produces a recoverable error overlay instead of crashing the page
- the engine instance is disposed on unmount

## Integration Rules

- do not call `initMAGE()` directly from route components
- keep engine-specific logic inside `src/lib/magePlayerAdapter.ts`
- if a page swaps scenes, pass the next `sceneBlob` to the same `MagePlayer` instance and let the component reload it
- use `initialPlayback` from route code instead of building page-specific play/pause overlays

## Current Route Defaults

- `HomePage` starts its hero preview in `playing`
- `SceneDetailPage` starts the main watch player in `playing`
- `CreateScenePage` starts the editor preview in `playing`

## Tests

Main coverage lives in:

- `src/components/MagePlayer.test.tsx`

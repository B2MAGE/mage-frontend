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
- invalid scene data produces a recoverable error overlay instead of crashing the page
- the engine instance is disposed on unmount

## Integration Rules

- do not call `initMAGE()` directly from route components
- keep engine-specific logic inside `src/lib/magePlayerAdapter.ts`
- if a page swaps scenes, pass the next `sceneBlob` to the same `MagePlayer` instance and let the component reload it

## Tests

Main coverage lives in:

- `src/components/MagePlayer.test.tsx`

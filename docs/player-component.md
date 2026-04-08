# Player Component

## Purpose

`MagePlayer` is the frontend boundary for embedding the engine in React pages. It keeps
engine-specific setup out of page components and accepts a preset scene blob through a single
`sceneBlob` prop.

## Example

```tsx
import { MagePlayer } from '../components/MagePlayer'

export function PresetDetailsPage({ preset }: { preset: { name: string; sceneData: Record<string, unknown> } }) {
  return (
    <section>
      <h1>{preset.name}</h1>
      <MagePlayer ariaLabel={`${preset.name} preview`} sceneBlob={preset.sceneData} />
    </section>
  )
}
```

## Runtime behavior

- `sceneBlob={null}` or `undefined` shows the empty state and does not start the engine
- a valid scene blob initializes the engine, starts rendering, and disposes cleanly on unmount
- invalid scene data shows a recoverable error state instead of crashing the page

## Integration notes

- Pass the raw preset scene object returned by the backend. Do not call `initMAGE()` from page code.
- Keep the engine boundary inside `src/lib/magePlayerAdapter.ts`.
- If a page replaces the current preset, pass the next `sceneBlob` object to the same `MagePlayer` instance and let the component recreate the engine safely.

# Create Preset Page

## Overview

The create preset page is the frontend editor for building MAGE scene data and previewing it live in the browser. It is organized into editor sections that map to the engine's current preset shape while keeping the UI approachable for normal users.

Route:

- `/create-preset`

## Related Files

- `src/pages/CreatePresetPage.tsx`
- `src/lib/presetEditor.ts`
- `src/lib/embeddedShaderPresets.ts`
- `src/components/PresetEditorControls.tsx`
- `src/pages/CreatePresetPage.test.tsx`

## Editor Sections

The page is split into:

- `Scene`
- `Camera`
- `Motion`
- `Effects`
- `Pass Order`
- `Advanced`

Those sections write into a structured scene object built around:

- `visualizer`
- `controls`
- `intent`
- `fx`
- `state`

## Submission Flow

The page submits preset creation through:

- `POST /api/presets`

Current request body:

```json
{
  "name": "Preset Name",
  "sceneData": {
    "visualizer": {},
    "controls": {},
    "intent": {},
    "fx": {},
    "state": {}
  }
}
```

Submission uses `authenticatedFetch()`, so the save action requires a valid signed-in session even though the route itself is not currently wrapped in a protected route.

## Live Preview

The page uses the shared `MagePlayer` component for inline preview. Edits update the structured scene data, and the preview reflects the current in-memory scene blob rather than waiting for a saved backend record.

## Current Data Model Notes

- shader choices currently come from the embedded engine presets hardcoded in `src/lib/embeddedShaderPresets.ts`
- skybox choices are exposed as bundled skybox ids
- pass ordering is supported, with `outputPass` pinned last
- several advanced engine values are surfaced as raw numeric fields for debugging and schema completeness

## Current Limitations

The page includes metadata controls beyond the persisted payload, but not all of them are saved yet.

At the moment:

- `name` and `sceneData` are submitted
- description, playlist, and thumbnail picker state are UI-only
- some engine passes exist in the stack but do not have fully persisted boolean support in the compact preset schema

If preset persistence expands on the backend, this page is a likely place for follow-up wiring.

## Tests

Main coverage lives in:

- `src/pages/CreatePresetPage.test.tsx`

# Create Scene Page

## Overview

The create scene flow is now owned by the `scene-editor` module. It is the frontend editor for building MAGE scene data and previewing it live in the browser.

Route:

- `/create-scene`

## Module Boundary

Route-facing imports should go through `@modules/scene-editor`.

Primary files:

- `src/modules/scene-editor/CreateScenePage.tsx`
- `src/modules/scene-editor/SceneEditorShell.tsx`
- `src/modules/scene-editor/useSceneEditorState.ts`
- `src/modules/scene-editor/useSceneEditorPreview.ts`
- `src/modules/scene-editor/useSceneEditorSubmission.ts`
- `src/modules/scene-editor/fixtures.ts`
- `src/modules/scene-editor/utils.ts`
- `src/modules/scene-editor/ui/SceneEditorControls.tsx`
- `src/modules/scene-editor/CreateScenePage.test.tsx`

Shared dependencies the module still consumes:

- `src/lib/sceneEditor.ts`
- `src/lib/embeddedShaderScenes.ts`

## Editor Sections

The page is split into:

- `Details`
- `Scene`
- `Camera`
- `Motion`
- `Effects`
- `Pass Order`
- `Confirm`

Additional advanced controls are exposed inside the `Camera` and `Motion` sections through local
expand/collapse toggles instead of as a top-level section.

Those sections write into a structured scene object built around:

- `visualizer`
- `controls`
- `intent`
- `fx`
- `state`

## Editor Layers

- `CreateScenePage.tsx` keeps route/auth wiring thin.
- `SceneEditorShell.tsx` owns the rendering shell and section layout.
- `useSceneEditorState.ts` owns workflow state, tag interaction, and section navigation.
- `useSceneEditorPreview.ts` owns derived preview scene data and selection metadata.
- `useSceneEditorSubmission.ts` owns thumbnail upload, create submission, and tag-attachment retry behavior.

## Submission Flow

The page submits scene creation through:

- `POST /api/scenes/thumbnail/presign`
- direct browser `PUT` to the returned object-storage URL when a thumbnail is selected
- `POST /api/scenes`

Current request body:

```json
{
  "name": "Scene Name",
  "sceneData": {
    "visualizer": {},
    "controls": {},
    "intent": {},
    "fx": {},
    "state": {}
  },
  "thumbnailObjectKey": "scenes/pending/42/thumbnails/abc123.png"
}
```

Submission uses `authenticatedFetch()` for backend calls, so the save action requires a valid signed-in session even though the route itself is not currently wrapped in a protected route.

If a thumbnail is selected, the page uploads it before sending the create request. That means a failed thumbnail upload blocks scene creation instead of leaving behind a saved scene without a thumbnail.

If tags are selected, the page currently attaches them in a follow-up request after the scene is
created and the backend returns the new `sceneId`.

## Live Preview

The page uses the shared `MagePlayer` component for inline preview. Edits update the structured scene data, and the preview reflects the current in-memory scene blob.

## Current Data Model Notes

- shader choices currently come from the embedded engine scenes hardcoded in `src/lib/embeddedShaderScenes.ts`
- skybox choices are exposed as bundled skybox ids
- pass ordering is supported, with `outputPass` pinned last
- several advanced engine values are surfaced as raw numeric fields for debugging and schema completeness

## Current Limitations

The page includes metadata controls beyond the persisted payload, but not all of them are saved yet.

At the moment:

- `name` and `sceneData` are submitted
- thumbnail uploads are staged first and only committed when the final scene create request succeeds
- selected tags are persisted in a follow-up attach step after the scene is created
- description and playlist are still UI-only
- some engine passes exist in the stack but do not have fully persisted boolean support in the compact scene schema

If scene persistence expands on the backend, this page is a likely place for follow-up wiring.

## Tests

Main coverage lives in:

- `src/modules/scene-editor/CreateScenePage.test.tsx`

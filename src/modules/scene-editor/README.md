# Scene Editor Module

This directory owns the scene editor foundation for create and future edit flows.

## Public API

Import route-facing editor behavior through `@modules/scene-editor`.

Exports:

- `CreateScenePage`

## Internal Responsibilities

- `CreateScenePage.tsx`
  Thin route-facing orchestration for the create flow.
- `SceneEditorShell.tsx`
  Module-owned rendering shell for the editor UI.
- `useSceneEditorState.ts`
  Workflow state, step navigation, tag behavior, and editor field updates.
- `useSceneEditorPreview.ts`
  Preview scene-data coordination and derived preview selections.
- `useSceneEditorSubmission.ts`
  Save/create submission, thumbnail upload, and tag attachment retry behavior.
- `fixtures.ts`
  Editor defaults, section config, and create-flow fixtures.
- `types.ts`
  Module-local editor state and submission contracts.
- `utils.ts`
  Validation, serialization, and create-flow helper logic.
- `ui/`
  Editor-owned controls and rendering helpers.

## Integration Rules

1. Route wiring should import `CreateScenePage` from `@modules/scene-editor`.
2. Editor business logic should stay in module hooks and helpers rather than app route wiring.
3. Future edit-scene flows should reuse this shell and hook structure instead of creating a second monolithic page.

## Route Surface

### `/create-scene`

Access:

- public route
- saving requires an authenticated session because backend requests use `authenticatedFetch()`

Editor structure:

- sections: `Details`, `Scene`, `Camera`, `Motion`, `Effects`, `Pass Order`, and `Confirm`
- advanced controls stay inside the `Camera` and `Motion` sections instead of becoming top-level routes or pages
- the editor writes into a scene object built around `visualizer`, `controls`, `intent`, `fx`, and `state`

Request flow:

- `POST /api/scenes/thumbnail/presign`
- direct browser `PUT` to the returned object-storage URL when a thumbnail is selected
- `POST /api/scenes`
- `POST /api/scenes/:sceneId/tags` for follow-up tag attachment

User-facing behavior:

- uses the shared `MagePlayer` component for inline preview
- updates the preview from the current in-memory scene blob instead of waiting for persistence
- validates required fields before upload or create requests
- uploads thumbnails before scene creation so failed uploads block partial saves
- retries failed tag attachments through a dedicated pending retry state after scene creation

Current limitations:

- `name` and `sceneData` are submitted, but description and playlist are still UI-only
- selected tags are persisted in a follow-up attach step after the scene is created
- some engine passes still lack full persisted boolean support in the compact scene schema

## Tests

Coverage lives in the colocated scene-editor specs under `src/modules/scene-editor/`.

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
2. Editor business logic should stay in module hooks/helpers rather than app route wiring.
3. Future edit-scene flows should reuse this shell and hook structure instead of creating a second monolithic page.

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
  Save/create submission, thumbnail capture persistence, and tag attachment retry behavior.
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

- Basic sections: `Details`, `Scene`, `Camera`, `Motion`, `Effects`, and `Confirm`; custom repair also includes `Pass Order`
- advanced controls stay inside the `Camera` and `Motion` sections instead of becoming top-level routes or pages
- new scenes use versioned template documents; the custom repair editor retains its existing engine fields

Request flow:

- live preview capture from the shared `MagePlayer`
- `POST /api/scenes/thumbnail/presign`
- direct browser `PUT` to the returned object-storage URL when a thumbnail is captured
- `POST /api/scenes`
- `POST /api/scenes/:sceneId/tags` for follow-up tag attachment

User-facing behavior:

- uses the shared `MagePlayer` component for inline preview
- updates the preview from the current in-memory scene blob instead of waiting for persistence
- captures thumbnails from the current live preview instead of asking for a local file upload
- validates required fields before scene creation
- automatically captures a thumbnail during scene creation if the user has not already captured one manually
- uploads captured thumbnails before scene creation so failed uploads block partial saves
- retries failed tag attachments through a dedicated pending retry state after scene creation

Current limitations:

- `name`, `description`, and `sceneData` are submitted, but playlist is still UI-only
- selected tags are persisted in a follow-up attach step after the scene is created
- some engine passes still lack full persisted boolean support in the compact scene schema

## Tests

Coverage lives in the colocated scene-editor specs under `src/modules/scene-editor/`.

## Versioned transport compatibility (PP-B02)

The custom repair editor exposes its existing controls and raw engine JSON.
Custom POST/PUT requests wrap those values in `{ schemaVersion: 1, kind: "custom", scene }`.
Choosing a familiar preset shader does not convert it into a trusted template.
Saved custom documents are validated before unwrapping into controls and wrapped
exactly once on save. Their original envelope shape remains part of local failure
identity, so switching from Watch to Edit cannot clear a remembered failure.

Malformed document markers and unsupported versions never fall back to raw custom
source. Template documents retain their envelope through editing, preview, submission,
and JSON export. Unsupported stored formats are exportable by their owner without opening a preview.

Legacy scenes remain editable through the owner repair endpoint under the saved
scene ID. The server's `SCENE_UPGRADE_REQUIRED` status blocks automatic playback;
an explicit successful save upgrades transport, without clearing an operator
disable or enabling the global rendering switch. `sceneMode` is returned metadata,
never a client-selected permission. PP-B03 provides the template-first authoring UI;
PP-V02 supplies client resource policy and detailed field validation.

Deploy this frontend together with the PP-B02 API. The earlier API rejects the
new envelope, while the strict API rejects writes from older cached frontend
tabs. Coordinate the cutover during a short authoring pause and ask users with
old tabs to refresh before saving. Keep the custom-rendering release gate off.
Rolling back only the frontend is not a compatible write path; retain a client
that understands saved versioned documents, and never rewrite stored scenes to
make an old client work.

## Editor preflight and repair (PP-V02)

Raw JSON imports, structured edits, and saves use the player module's shared
versioned policy. Original values are checked before preview defaults or audio
normalization can hide invalid fields. The submitted custom document retains its
authored values; omitted settings are not silently written back as defaults.
Unknown fields, invalid numbers/types, source and document byte budgets,
duplicate import keys, and excess effects produce actionable errors.

An invalid draft stays editable and downloadable from Confirm → Raw JSON. A new
invalid draft keeps the last valid preview visible with an explanation. Invalid
saved repair data starts without a player; it is never substituted with a default
scene. Structured edits change only the chosen fields, preserving unrelated repair
values. Fix invalid imported JSON before switching back to structured controls.
Preview captures are disabled for invalid drafts and cancelled if settings change.

Controls use the server's permitted ranges. Bloom and optional passes share a
four-effect budget; Output and hidden Copy are excluded. At the limit, enabled
effects remain available to turn off, while additional effects cannot be enabled.
Both create and update check complete request size before thumbnail work and
again before the final write. Server errors retain nested field details, and
HTTP 413 remains actionable even if the response body is not JSON.

Editor players request the bounded `preview` render profile. These checks do not
make custom source trusted or enable the global custom-rendering release gate.
Custom repair does not mount a player. Valid template drafts preview with platform-owned
source, while saved templates also retain per-scene availability and recovery checks.

## Basic templates and custom repair (PP-B03)

The default scene is the version-1 Prism Core template. `templateEditor.ts` owns supported
field updates and the display model; it never resolves source. `TemplateSceneControls`
reuses the existing sections and controls for the contract's scale, speed, skybox, camera,
bloom, and tint fields. Basic hides unsupported settings and Pass Order.

Template selection preserves supported settings. Replacing custom content with a template
requires explicit confirmation, including JSON imports. Cancel preserves the source. Valid
custom imports remain custom repair documents, never trusted templates. Advanced authoring
stays disabled until isolation is released; no custom editor renderer is created in this story.

Server errors retain a field map so the editor can open and focus the affected template control.
Drafts survive validation/API failures. See [template scenes](../../../docs/template-scenes.md)
for the contract, lifecycle, rollout, and verification boundaries.

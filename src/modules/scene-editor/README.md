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

## Personal Builder templates (SB-14)

In **Scene**, signed-in users can choose **Save as template** for any Builder setup.
The required name is separate from the scene title, trimmed, limited to 100 characters,
and unique within that account without regard to case. The Template selector separates
**Built-in templates** from **Your templates**. Built-ins are never overwritten.
Selecting a personal template copies its Builder design: objects, groups, composition,
materials, animation and per-object/group input bindings. Camera, skybox, scene scale,
scene-wide Motion/music responses, Effects and Pass Order remain as they were in the editor.
Edited or new designs require confirmation before replacement; Cancel retains the design
and Undo restores the previous design and selection.

A selected personal template offers **Update template**, **Rename template**,
**Save as new template**, and **Delete template**. Updating is explicit; ordinary scene
edits and scene saves do not change the library. Existing scenes and browser drafts own
their document copies and continue working after the source template is updated or deleted.
Personal templates contain only the Builder contract markers, objects, composition and
rendering fields. Settings and parameters from other sections, scene title/description,
tags, account/social fields, local audio files and playback state are excluded. Template
provenance lives only in editor history/browser recovery, never in the saved scene document
or compiler input. `builderDesign.ts` selects this shared subset for saving and comparison;
transport applies the same selection even if a caller supplies a complete scene.

Every create/content update captures a fresh preview frame and uploads it through
`/api/builder-templates/thumbnail/presign`. If capture is unavailable, a visible placeholder
is saved; an old scene thumbnail is never substituted. The image shows the current live
preview context, but its camera, skybox and effects are not included in the template.
Storage or write failures keep the dialog and draft intact. Rename retains the existing
image. The backend atomically saves
document/image reference and owns cleanup in a namespace separate from scene images.

`personalTemplates.ts` owns the owner-only `/api/builder-templates` transport;
`usePersonalTemplates.ts` owns account-scoped requests/list state;
`usePersonalTemplateWorkspace.ts` coordinates capture and editor revision checks.
`PersonalTemplateActions` uses the editor's existing theme and modal styling. Revision
conflicts require deliberate reloading of the saved template or saving a new copy; they
never silently overwrite the other edit. No public sharing, custom code, version browser,
or reusable object/component graph is introduced.

Requires backend #167 (additive Flyway V23 and V24). V24 narrows pre-review personal
templates to their Builder designs; saved scenes and thumbnails remain intact.
For review, check save/reload with a changed object or material, confirm
camera/effects/skybox/scale remain unchanged when applying a template, and check duplicate
names, rename, replacement Cancel/Undo, and deletion while a copied scene remains open.
The colocated personal-template tests cover these paths, fresh capture, request failures,
account changes, and publishing/reopening a scene after its source template is deleted.

## Builder combined inputs

Under an object's or group's **Animation** section, **Add combined inputs** creates
an influence whose calculation can be edited through nested controls. Existing recipe
influences expose the same controls. Open **First value**, **Second value**, or
**Incoming value** to inspect each input and coefficient. **Calculation** supports
fixed values, inputs, addition, multiplication, sine/cosine, range limits, and selecting
one component of an XYZ value. Selecting a wrapper keeps the current calculation as
its child; **Use … value only** removes a wrapper or unwanted branch.

For example, to make a wave whose frequency follows the shared scene size response:

1. Add combined inputs and choose a property, such as Position Y.
2. Set Calculation to Input, then choose Time.
3. Set Calculation to Multiply two values. The first value remains Time.
4. Open Second value, set Calculation to Input, and choose Scene size response.
5. Set the outer Calculation to Sine wave. The result is `sin(time × scene-size)`.

Simple single-input formulas also expose **Follow input** controls. **Edit combined
inputs** opens their exact expression without rewriting it; **Use simple controls**
is available when the expression matches a supported preset. Input formulas that
originally had no range clamp remain unclamped unless custom limits are selected.

`builderExpressions.ts` owns structural authoring helpers and
`ui/BuilderExpressionControls.tsx` renders the shared editor for all recipes. The
existing player contract/compiler still validates types, ranges and whole-scene
budgets; the editor additionally prevents exceeding expression depth/node limits.
Invalid numeric drafts remain repairable, with the last valid preview retained and
saving blocked. Edits use the existing undo, draft recovery, capture and save flows.
No new expression schema, renderer behavior or backend format is introduced.

## Current versioned transport

The custom editor exposes its existing controls and current custom-envelope JSON.
Custom POST/PUT requests wrap those values in `{ schemaVersion: 1, kind: "custom", scene }`.
Choosing a familiar preset shader does not convert it into a trusted template.
Saved custom documents are validated before unwrapping into controls and wrapped
exactly once on save. Their original envelope shape remains part of local failure
identity, so switching from Watch to Edit cannot clear a remembered failure.

Malformed document markers and unsupported versions never fall back to raw custom
source. Templates with editable representations open as concrete Builder documents;
other templates retain their template envelope. Unsupported stored formats are
exportable by their owner without opening a preview.

Historical raw scenes and retired template/audio formats cannot be repaired or upgraded by
this editor. The owner-only source endpoint remains available for current documents whose
playback is disabled; ownership retrieval never grants playback permission or converts formats.
Existing authored Builder and custom documents preserve their content on import,
export, preview, create, and update. Both Original and Selective music responses remain supported.

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
field updates and the display model; it never resolves source. Basic reuses the full camera,
motion, music-response, effects, and Pass Order controls. The Scene section offers the template
library in place of shader source selection/editing. Safe field updates map back to the template
document, so changing effects or motion never converts it into custom source. The additive
settings contract keeps the original template defaults and requires the matching backend update.

Template selection preserves supported settings but uses the selected template's default scale. Replacing custom content with a template
requires explicit confirmation, including JSON imports. Cancel preserves the source. Valid
custom imports remain custom repair documents, never trusted templates. Advanced authoring
stays disabled until isolation is released; no custom editor renderer is created in this story.

Server errors retain a field map so the editor can open and focus the affected template control.
Drafts survive validation/API failures. See [template scenes](../../../docs/template-scenes.md)
for the contract, lifecycle, rollout, and verification boundaries.

## Template-first Builder workflow

The Scene section has one template picker and an adjacent Add button. Supported
catalog templates open their Builder workspace automatically; other templates
keep it hidden. Add starts a one-sphere New Template with default settings.
Editing a catalog recipe's objects, composition, or rendering profile labels it
`Template Name Adaptation`. Camera, effects, and scene-wide music settings do not
change that label. New Template and Adaptation replacements require confirmation;
unchanged premade templates switch immediately. Undo restores the document and label.

Catalog selection uses the template's default scene scale, avoiding New Template's
unit scale carrying into the next recipe. Opening saved scenes, imports, and
recovered drafts retains authored settings. Template source labels are editor-only
draft/history metadata, never extra fields in the saved scene contract.

There is no creation-mode toggle or new custom-code entry point. Existing custom
documents and moderator controls still follow their existing policy. Builder edits save
with the scene; signed-in users can also explicitly save a reusable Builder design using
personal templates (frontend #314 and backend #167). The custom-code direction remains a
future decision.

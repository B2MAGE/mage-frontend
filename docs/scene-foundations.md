# Current scene definitions

The shared JSON contract owns accepted scene fields, numeric limits and defaults.
Frontend presentation metadata describes the existing Builder controls; it does
not introduce another scene format or an operation registration framework.

## Ownership

| Concern | Definition and consumers |
| --- | --- |
| Template, Builder and custom transport | `contracts/scenes/scene-v1.schema.json`; frontend `sceneContract.ts` / `builderSchema.ts` and the independent Java validator |
| Rendering workload | `contracts/scenes/builder-rendering.v1.json`; arithmetic preflight before Builder save or source generation, and the independent Java write boundary |
| Builder labels and inspector fields | `src/modules/player/templates/builderDefinitions.ts`; Builder controls and review summaries |
| Numeric defaults and property bounds | Shared schema, referenced by `builderDefinitions.ts` and `sceneDefinitions.ts`; editor construction, template parsing and compiler uniform limits |
| Trusted operation implementation | Explicit cases in `builderCompiler.ts`; only bounded values enter generated source |
| Template identity and source | `template-catalog.v1.json` and the bundled immutable registry |

The presentation modules only import checked-in contract data at runtime. Their
explicit inclusion in the isolated renderer is checked by the import-boundary
test; they do not import application state, persistence or rendering code.

## Worked example: a Box width

The Box branch of `scene-v1.schema.json` defines `width` with default `1` and
the accepted interval `0.01` to `10`. The Box entry in `BUILDER_OPERATIONS`
supplies the label **Width**, its help text and its position among the three
dimension fields. It does not repeat those numeric values.

`createBuilderOperation('box')` reads the defaults when adding the object.
`builderOperationFields(operation)` gives the inspector its value and bounds,
and gives the review summary its ordered field labels. The frontend parser and
Java API each validate the submitted width against their checked-in schema copy.
The compiler's explicit Box case emits the three validated dimensions.

`builderDefinitions.test.ts` checks every current operation's defaults, boundary
values and actual shader compilation, and checks that every schema dimension
has inspector metadata. `current-round-trips.json` includes a Box with ordered
modifiers and nested arrangements: both repositories validate and normalize it,
and the backend saves, reopens and updates its normalized form.

For a future operation, change the schema and typed operation union, add its
direct presentation entry and explicit compiler case, then add a full-write
fixture. Update the backend contract copy and its independent validation when
the new data requires it. The catalog coverage test must pass, and the generated
source must compile. This deliberately keeps the supported operations finite.

Input labels and scalar/vector presentation facts live in the editor's
`builderInputDefinitions.ts`; bindings, simple influences and combined inputs
use those same facts. Runtime validation remains independent. The expression
operation labels are exhaustive over the typed union, and
`BuilderExpressionControls.test.tsx` compares the actual operation/input choices
to the contract. Compact shape summaries reuse `builderOperationFields` while
retaining their existing formatting. Expand/Shell influences use the same
schema-backed modifier limits as the inspector.

## Verify both repositories together

From the frontend checkout, provide the backend checkout being released:

```sh
npm run contracts:check -- ../mage-backend-step1
```

This read-only check compares seven files: the schema, rendering policy, scene
resource policy, template catalog and three fixture files. It allows checkout
line-ending differences but reports content drift or missing files. It is an
explicit verification command, not an automatic CI or deployment gate.

`fixtures.json` covers structural transport validity. The additional
`current-round-trips.json` covers the full write boundary for all three current
document kinds, exact normalization and reopening. A structurally valid custom
envelope can still fail write validation, for example when its shader is blank.
The rendering workload assertions are frontend compiler expectations; they do
not add a test-only field to the API.

`builder-catalog.v1.fixtures.json` contains the editable catalog recipes. The
frontend checks them against the current recipes and compiles them; the backend
saves, edits and reopens them against disposable PostgreSQL. Together the three
fixture files distinguish structural validity, full write validity and complete
catalog persistence.

## Contract change and release checklist

1. Update the canonical schema/policy/catalog and their backend copies, then the
   affected editor, API validator, compiler and renderer consumers. Extend the
   relevant shared fixtures and focused tests. Keep Original (`legacy`) and
   Selective (`mapped-v1`) audio as supported current choices.
2. Run `npm run contracts:check -- <backend-checkout>` against the exact backend
   revision being released. Run the affected frontend contract/compiler tests
   and backend validator/persistence tests. Keep API validation, renderer input
   validation and compiled-artifact validation independent.
3. Deploy API support before the editor exposes new fields. When the change
   affects the isolated renderer, build and deploy its matching artifact before
   the frontend uses the new behavior, following the existing
   [renderer rollout and rollback procedure](isolated-renderer-release.md).
   Engine changes also follow the [package adoption workflow](engine-package.md).
   Frontend-only presentation or documentation changes do not require a
   renderer deployment.
4. Verify representative create/update/reopen and playback behavior for the
   changed contract, and record the actual deployed revisions. Roll back to
   matching supported API/frontend/renderer artifacts when needed; do not add
   automatic historical conversion to work around a mismatched deployment.

The backend documents [current-format rejection and coordinated deployment](https://github.com/B2MAGE/mage-backend/blob/main/docs/scene-documents.md#owner-editing-and-coordinated-deployment).
Unsupported historical documents remain unsupported; this workflow adds no
version-negotiation or migration framework.

## Builder editing and recovery (SB-08)

`useSceneDraftHistory` owns the editor draft: details, tags, the current document,
raw JSON, and selected object. Commands share this owner; selection alone does
not create an undo step. A continuous field edit is one step. Undo/redo works
through the buttons and Ctrl/Cmd+Z, Ctrl+Y, or Ctrl/Cmd+Shift+Z. History is bounded
to 50 steps and approximately 4 MiB. Reset returns to the document opened in this
editor, and can itself be undone. New and duplicated objects are selected;
removing an object selects its neighbour. Reordering preserves IDs and bindings.

Browser backup stores one current-format draft per account and create/edit route.
It backs up after a short pause and flushes on page hide/unmount. Reopening offers
Restore or Discard; it never silently replaces a saved scene. Another tab changing
the same browser draft pauses backup until the user chooses which draft to keep.
Storage failure leaves the editor usable and offers JSON export as a fallback.
Recovery preserves invalid raw text and repairable numeric values, not uploaded
audio or an in-memory thumbnail; capture a fresh thumbnail after restoring.

Draft backup is independent of [playback recovery](scene-recovery.md). Playback
stops, failures and Pause all scenes are current-page memory only and reset on
reload. Retrying a renderer preserves the open editor document; it does not restore
or discard a browser draft, grant server permission, or migrate historical data.

Scene API responses supply `revision`. Full updates send `expectedRevision`,
and `409 SCENE_EDIT_CONFLICT` preserves the open draft instead of overwriting a
newer saved version. An earlier save finishing during editing retains its new
revision while leaving newer edits untouched. A create with an uncertain outcome
requires checking My Scenes before submitting again; its pending status is backed
up before POST. A successful save clears only the matching browser draft.

The preview compiler can use up to the existing 64 live uniform slots for bounded
position, rotation, scale, metalness and shininess changes, with authored bindings
taking priority. Unsupported values, dimensions, colour, modifiers, arrangements,
and motion remain structural changes. Structural updates use the existing coalesced
preview path; invalid drafts leave the last valid preview visible. The persisted
document and normal export compiler remain unchanged. The isolated renderer checks
the loaded uniform manifest before applying updates.

Builder copy counts are checked before allocating expanded copies. Nested
arrangements multiply, so two copies repeated eight times use the sixteen-copy
budget; adding another object is rejected consistently by the frontend and API.

## Scope of this step

Existing defaults, control labels, appearance and audio behavior are retained.
This step establishes shared definitions and current-format checks. MAINT-02 removes historical transport formats while retaining Version 1 Original
and Version 2 Selective audio. Editor state and remaining Builder features are
handled by their respective stories.

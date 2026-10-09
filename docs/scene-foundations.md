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

## Verify both repositories together

From the frontend checkout, provide the backend checkout being released:

```sh
npm run contracts:check -- ../mage-backend-step1
```

This read-only check compares the schema, rendering policy, scene resource
policy, template catalog and both fixture files. It allows checkout line-ending
differences but reports content drift or missing files.

`fixtures.json` covers structural transport validity. The additional
`current-round-trips.json` covers the full write boundary for all three current
document kinds, exact normalization and reopening. A structurally valid custom
envelope can still fail write validation, for example when its shader is blank.
The rendering workload assertions are frontend compiler expectations; they do
not add a test-only field to the API.

Builder copy counts are checked before allocating expanded copies. Nested
arrangements multiply, so two copies repeated eight times use the sixteen-copy
budget; adding another object is rejected consistently by the frontend and API.

## Scope of this step

Existing defaults, control labels, appearance and audio behavior are retained.
This step establishes shared definitions and current-format checks. MAINT-02 removes historical transport formats while retaining Version 1 Original
and Version 2 Selective audio. Editor state and remaining Builder features are
handled by their respective stories.

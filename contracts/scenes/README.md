# Scene document contract

## Scene Builder

SB-01 adds `kind: "builder"` with explicit `builderVersion: 1`. See
[the Builder format](builder-v1.md) for stable object IDs, the closed operation
catalog, transforms, materials, property bindings, limits, version policy and
the storage-versus-rendering delivery boundary. SB-02 adds the versioned
`builder-rendering.v1.json` workload policy and trusted compilation inside the
isolated player. SB-04 adds bounded Expand/Shell/Twist modifiers, nested Line/Ring
arrangements and per-object spin while applying every rendering budget after
copy expansion. The same shared schema and
fixtures cover Builder, template and custom documents; a Builder document is
never treated as custom source.

`scene-v1.schema.json` is the shared JSON Schema 2020-12 contract for the frontend and Java API. `fixtures.json` supplies named valid and invalid examples; its optional `normalized` values specify the result after defaults are filled in. `template-catalog.v1.json` identifies the platform-owned template versions and their source checksums.

This contract is independent of the engine's internal scene format. The player validates a template document, looks up its exact ID and version in the bundled registry, and constructs a new engine payload. Template documents never contain shader source, expressions, imports, or user-selected asset URLs.

## Template documents

The minimum document is:

```json
{
  "schemaVersion": 1,
  "kind": "template",
  "templateId": "embedded-scene-0",
  "templateVersion": 1
}
```

All four identity fields are required. Unknown schema versions, template IDs, template versions, and fields at every nesting level are rejected. There is no fallback to another template or to custom-source execution. Omitted option objects and fields use the following version-one defaults. Explicit `null`, numeric strings, and other incorrect types are invalid; values are never coerced or clamped.

| Field | Accepted values | Default |
| --- | --- | --- |
| `parameters.scale` | Finite number, 1–200 inclusive | 10 |
| `parameters.speed` | Finite number, 0–10 inclusive | 1 |
| `settings.skybox` | Integer catalog ID, 1–10 | 6 |
| `settings.camera.fov` | Finite number, 1–179 inclusive | 75 |
| `settings.camera.autoRotate` | Boolean | `true` |
| `settings.camera.orbitSpeed` | Finite number, −50–50 inclusive | 0.2 |
| `settings.bloom.enabled` | Boolean | `false` |
| `settings.bloom.strength` | Finite number, 0–10 inclusive | 1 |
| `settings.bloom.radius` | Finite number, −10–10 inclusive | 0.2 |
| `settings.bloom.threshold` | Finite number, 0–10 inclusive | 0.1 |
| `settings.tint.enabled` | Boolean | `false` |
| `settings.tint.color` | Exactly seven characters: `#RRGGBB`, case-insensitive hex | `#ffffff` |

Skybox IDs reference existing platform-owned assets. A field that is disabled still must have a valid value. The Basic editor expansion widens these ranges to the existing scene policy and adds optional bounded settings; it does not change any earlier default, shader, or field meaning. A change to an existing appearance/default/source requires a new template version. Existing version-one documents resolve to exactly the same payload when the additions below are absent.

### Optional editor settings

These branches contain data only. Their absent fields remain absent during contract normalization; the resolver applies the existing engine defaults when building a fresh payload. Unknown fields, duplicate aliases, expressions, source, asset URLs, and renderer configuration are rejected. Numbers must be finite and are never coerced or clamped.

| Optional field | Accepted values | Omitted engine value |
| --- | --- | --- |
| `settings.camera.tilt` | −2π–2π | 0 |
| `settings.camera.orientationMode` | Integer 0–2 | 0 |
| `settings.camera.orientationSpeed` | 0–10 | 1 |
| `settings.controls` | Complete `position0`, `target0`, and `zoom0` object | Positions below |
| `settings.controls.position0` / `target0` | Complete numeric `x`, `y`, `z`, each −1000–1000 | `(0,0,5.5)` / `(0,0,0)` |
| `settings.controls.zoom0` | 0.01–100 | 1 |
| `settings.motion.minimizing_factor` | 0.01–2 | 0.8 |
| `settings.motion.power_factor` | 1–10 | 8 |
| `settings.motion.pointerDownMultiplier` | 0–10 | 0 |
| `settings.motion.base_speed` / `easing_speed` | 0–1 | 0.2 / 0.6 |
| `settings.state.size` / `currAudio` | 0–100 | 0 |
| `settings.state.pointerDown` / `currPointerDown` | 0–1 | 0 |
| `settings.state.time` | 0–86400 | 0 |
| `settings.state.volume_multiplier` | 0–10 | 0 |
| `settings.effects.toneMapping.method` | One of 0, 1, 2, 3, 4, 6, 7 | 0 |
| `settings.effects.toneMapping.exposure` | 0–10 | 1.5 |
| `settings.effects.passes` | Boolean flags listed below | Optional passes off; output on |
| `settings.effects.passOrder` | Up to 16 unique known pass IDs | Existing version-one order |
| `settings.effects.params.rgbShift.amount` / `angle` | 0–0.1 / −2π–2π | 0.005 / 0 |
| `settings.effects.params.afterImage.damp` | 0–1 | 0.96 |
| `settings.effects.params.kaleid.sides` / `angle` | Integer 1–24 / −2π–2π | 6 / 0 |
| `settings.audioResponse` | `legacy` (Version 1 Original), `mapped-v1` (Version 2 Selective) | `legacy` |
| `settings.audioResponseConfig.version` | Required `1` when the config is present | Config absent |
| `settings.audioResponseConfig.sensitivity` | 0.1–4 | Existing engine mapping default |
| `settings.audioResponseConfig.mappings` | Up to 6 mappings, one per unique target | Existing engine mapping default |

Allowed effect flags are `rgbShift`, `dot`, `technicolor`, `luminosity`, `afterImage`, `sobel`, `glitch`, `halftone`, `gammaCorrection`, `kaleid`, `bleachBypass`, `toon`, and `outputPass`. Bloom remains under `settings.bloom`; colorify remains under `settings.tint`. These original fields are the only authority for those effects. At most four optional effects may be enabled, including bloom and tint; `outputPass` is not counted. Known pass-order IDs are the exact 16 values in the schema and scene policy.

Each audio mapping requires `target` and `source`. Targets are `size`, `bass`, `mid`, `treble`, `audioLevel`, or `audioHit`. Sources are `bass-level`, `mid-level`, `treble-level`, `overall-level`, `bass-hit`, `mid-hit`, `treble-hit`, or `overall-hit`. Optional mapping fields are `amount` (0–4), `attack` (0–2 seconds), and `release` (0–5 seconds). No source expression or shader field is accepted. Omitted mapping values use the existing engine normalizer, and a supplied zero is preserved.

The resolver maps `parameters.speed` to `intent.time_multiplier`, camera settings to their corresponding `intent` values, `settings.motion` to the remaining intent controls, `settings.effects` to `fx`, and controls/state/audio settings to their namesake engine branches. It always takes shader source exclusively from the immutable template registry. These data settings grant no additional execution permissions and do not alter PP-V02 rendering limits.

## Current custom documents

Arbitrary engine scene data uses an explicit custom envelope:

```json
{
  "schemaVersion": 1,
  "kind": "custom",
  "scene": {
    "visualizer": { "shader": "user-authored source" }
  }
}
```

Custom source stays untrusted, even when it is byte-for-byte identical to a template shader. Structural validity is not authorization to execute it. Custom authoring permission checks, scene resource budgets, and isolated execution are separate PP stories. Historical raw engine-format documents are unsupported. Imports, playback, and writes require a current explicit envelope; they never convert raw data or promote it to a template.

The custom `scene` must be a JSON object. The storage policy further limits its fields; `__proto__`, `prototype`, and `constructor` keys are forbidden recursively. The frontend also rejects values that cannot originate from ordinary JSON: non-finite numbers, `undefined`, functions, symbols, accessors, class instances, cycles, and sparse or extended arrays. It copies enumerable data properties without invoking getters.

## Consumer verification

1. Load the schema with a JSON Schema 2020-12 validator. Disable type coercion, unknown-field removal, and other transformations that would turn an invalid submission into a valid one. Register the two MAGE assertions below; treating them as ignorable annotations does not fully validate this contract.
2. Run every entry in `fixtures.json.cases`; validation must equal its `valid` flag.
3. Materialize the published defaults after successful validation. JSON Schema `default` is an annotation, so validators are not required to fill it in. Compare any fixture with a `normalized` value against that value.
4. Resolve only catalog ID/version pairs. Never accept source from a template payload or merge unvalidated objects into an engine payload.
5. Apply authorization and operational limits separately. A `valid: true` custom fixture only means its transport envelope is well formed.

The frontend test suite checks the shared fixtures with both its parser and an independent JSON Schema 2020-12 validator. It also compares normalized results to schema defaults, checks every catalog ID, and exercises malicious in-memory values that JSON fixture files cannot represent.

The schema uses standard `maxItems` and `uniqueItems` for pass-order arrays plus two explicit MAGE assertion keywords:

- `x-uniqueBy: "target"` requires every audio mapping to have a different target, even if mappings otherwise differ.
- `x-maxOptionalEffects: 4` on template settings counts `bloom.enabled`, `tint.enabled`, and true flags under `effects.passes` other than `outputPass`. The total cannot exceed four. This is enforced during contract validation, not silently trimmed during normalization.

The frontend parser, independent AJV conformance tests, and Java schema interpreter implement both assertions. The shared fixtures include accepted sparse/full settings, widened bounds, source injection attempts, conflicting aliases, duplicate pass IDs and audio targets, and the combined effect limit.

### Current write and reopen checks

`current-round-trips.json` exercises the full write boundary for template, Builder
and custom documents, including exact normalized output, defaults, mapped audio,
ordered modifiers and nested arrangements. Both repositories consume these
fixtures independently. Structural validity in `fixtures.json` does not imply
write validity: an empty custom shader is one example of the difference.

From the frontend checkout, run `npm run contracts:check -- <backend-checkout>`
to compare the six shared schema, policy, catalog and fixture files without
modifying either repository. See [current scene definitions](../../docs/scene-foundations.md)
for ownership, a Box-field walkthrough and the supported-operation workflow.

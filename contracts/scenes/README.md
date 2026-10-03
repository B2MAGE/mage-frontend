# Scene document contract

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
| `parameters.scale` | Finite number, 1–30 inclusive | 10 |
| `parameters.speed` | Finite number, 0–3 inclusive | 1 |
| `settings.skybox` | Integer catalog ID, 1–10 | 6 |
| `settings.camera.fov` | Finite number, 20–100 inclusive | 75 |
| `settings.camera.autoRotate` | Boolean | `true` |
| `settings.camera.orbitSpeed` | Finite number, 0–2 inclusive | 0.2 |
| `settings.bloom.enabled` | Boolean | `false` |
| `settings.bloom.strength` | Finite number, 0–3 inclusive | 1 |
| `settings.bloom.radius` | Finite number, 0–1 inclusive | 0.2 |
| `settings.bloom.threshold` | Finite number, 0–1 inclusive | 0.1 |
| `settings.tint.enabled` | Boolean | `false` |
| `settings.tint.color` | Exactly seven characters: `#RRGGBB`, case-insensitive hex | `#ffffff` |

Skybox IDs reference existing platform-owned assets. A field that is disabled still must have a valid value. Changing a version's shader, supported fields, defaults, or their meanings requires a new template version or schema version as appropriate; keep earlier template versions available so saved scenes do not silently change.

## Custom documents and legacy scenes

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

Custom source stays untrusted, even when it is byte-for-byte identical to a template shader. Structural validity is not authorization to execute it. Custom authoring permission checks, scene resource budgets, and isolated execution are separate PP stories. Legacy engine-format documents also remain custom/untrusted; this contract does not automatically migrate or promote them to template documents.

The custom `scene` must be a JSON object. Nested objects and arrays may carry legacy fields, but `__proto__`, `prototype`, and `constructor` keys are forbidden recursively. The frontend also rejects values that cannot originate from ordinary JSON: non-finite numbers, `undefined`, functions, symbols, accessors, class instances, cycles, and sparse or extended arrays. It copies enumerable data properties without invoking getters.

## Consumer verification

1. Load the schema with a JSON Schema 2020-12 validator. Disable type coercion, unknown-field removal, and other transformations that would turn an invalid submission into a valid one.
2. Run every entry in `fixtures.json.cases`; validation must equal its `valid` flag.
3. Materialize the published defaults after successful validation. JSON Schema `default` is an annotation, so validators are not required to fill it in. Compare any fixture with a `normalized` value against that value.
4. Resolve only catalog ID/version pairs. Never accept source from a template payload or spread incoming objects into an engine payload.
5. Apply authorization and operational limits separately. A `valid: true` custom fixture only means its transport envelope is well formed.

The frontend test suite checks the shared fixtures with both its parser and an independent JSON Schema 2020-12 validator. It also compares normalized results to schema defaults, checks every catalog ID, and exercises malicious in-memory values that JSON fixture files cannot represent.

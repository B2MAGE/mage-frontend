# Scene Builder document version 1

SB-01 adds an independent `builder` document to the scene envelope. The shared
`scene-v1.schema.json` and `fixtures.json` are authoritative in both repositories.
The backend copies live in `src/main/resources/contracts/scenes` and
`src/test/resources/contracts/scenes`. Keep those copies byte-identical.

```json
{
  "schemaVersion": 1,
  "kind": "builder",
  "builderVersion": 1,
  "objects": [
    {
      "id": "orb-1",
      "name": "Music sphere",
      "operation": { "type": "sphere", "radius": 1 },
      "transform": { "position": { "x": 2 } },
      "material": { "color": "#8066ff" },
      "bindings": [
        { "target": "scale.x", "source": "bass-hit", "amount": 0.5 }
      ]
    }
  ],
  "parameters": { "scale": 10, "speed": 1 },
  "settings": { "camera": { "autoRotate": false } }
}
```

## Identity, versions and preservation

All four envelope fields shown above are required; an empty `objects` array is
valid. IDs are supplied by the authoring client, unique within the scene, and
1–64 ASCII letters, digits, underscores or hyphens, starting with a letter or
digit. UUIDs satisfy this format. Renaming or reordering an object retains its
ID; duplication must create a fresh ID. The server never generates, renumbers or
deduplicates object IDs during validation. Names are inert display labels, up to
80 Unicode code points, defaulting to `Object`; names are never executable text.

`schemaVersion` versions the envelope; `builderVersion` pins the object and
binding semantics. Only version 1 is accepted for writes/import. Unknown
versions, operations and fields are rejected with the offending field path.
There is no best-effort conversion, version downgrade, or custom-source fallback.
Changing a default or operation meaning requires a new builder version and an
explicit tested migration. No migration is performed by SB-01. Existing
template IDs/versions, custom envelopes and stored legacy scenes are unchanged.
Unrecognized stored data remains available through the existing owner repair
export rather than being rewritten merely by reading it.

Accepted documents are copied and normalized once, filling only published
defaults. Revalidating a normalized document produces identical data. Storage,
owner read/export and update retain object order, IDs, explicit zeroes, labels,
settings and bindings. The normalized document is the source of truth in the
existing JSONB scene column. No caller-provided compiled artifact is accepted.

## Initial operation catalog

Each object contains exactly one `operation`. All dimensions are finite local
scene units; names below specify the version-one compiler contract for SB-02.

| Type | Parameters and inclusive bounds | Defaults |
| --- | --- | --- |
| `sphere` | `radius`: 0.01–10 | 1 |
| `box` | `width`, `height`, `depth`: 0.01–10; full dimensions | 1 each |
| `torus` | `radius`: 0.01–10, `tube`: 0.01–5; major and tube radii, ring around local Y axis | 1, 0.25 |
| `cylinder` | `radius`, `height`: 0.01–10; full height along local Y axis | 1, 2 |

Transforms use `{x,y,z}` objects. Position is −100–100 (default 0), rotation is
−2π–2π radians (default 0), and positive scale is 0.01–20 (default 1). Geometry is
centered at the local origin. The specified order is local scale, X/Y/Z rotation,
then translation. Each object has its own transform/material scope; it cannot
alter later objects. Objects combine by union in saved array order. There are no
Boolean-operation scripts or component references; SB-07 must add its own
bounded validated component structure and expanded-work accounting.

SB-04 adds ordered `modifiers` and `arrangements` to each object. The initial
modifier catalog allows one `twist` (X/Y/Z axis, −6–6 radians per local unit),
one `expand` (`amount` −2–2) and one `shell` (`thickness` 0.01–1). The compiler
applies the object transform and scale, then any twist to local coordinates,
then evaluates the primitive, and finally applies expand/shell in saved order to
the signed distance. A coordinate twist leaves a perfect sphere visually unchanged
because all of its cross-sections are circular. Arrangements are limited to two stages and one of each type:
`linear` repeats 2–8 copies along a selected X/Y/Z axis with 0.1–10 unit spacing;
`radial` repeats 3–8 copies around a selected axis with radius 0.1–10. An empty
arrangement renders one primitive. Ordered stages nest by repeating the complete
result of the previous stage, so their copy counts multiply. The entire scene
must still expand to at most 16 primitives.

Each object also has bounded `motion`: `none`, or `spin` around one X/Y/Z axis at
−4–4 radians per second. Spin adds to the authored local rotation and applies to
all arranged copies. Arranged copies form an isolated compiler-owned group; no
arbitrary child references, formulas, recursive groups or cross-object mutation
are accepted. This fixes grouping depth at two arrangement stages and prevents
cycles while still supporting lines, rings and nested layouts.

Material fields are `color` (`#RRGGBB`, default `#8066ff`), `metalness` (0–1,
default 0), and `shininess` (0–1, default 0.5). No textures, asset URLs, source,
callbacks, expressions or arbitrary properties are allowed. `parameters` and
`settings` use exactly the template document's existing bounded scene-wide
scale, speed, camera, skybox catalog, motion, effects and music controls/defaults.
The scene-wide scale applies after object composition. Those controls never
convert a Builder document into custom code.

## Property bindings

An object has at most four bindings, with at most one binding per target.
Targets are `position.x/y/z`, `rotation.x/y/z`, `scale.x/y/z`,
`material.metalness`, and `material.shininess`. They refer only to that object;
there are no string paths into other documents or shader source.

Sources are `bass-level`, `mid-level`, `treble-level`, `overall-level`, their
corresponding `-hit` signals, and `pointer-x`, `pointer-y`, `pointer-down`.
The player supplies bounded signals: audio level/hit and pointer-down in 0–1,
pointer position in −1–1. Missing signals are zero. Source names are an enum,
not a formula language or a reference to arbitrary uniforms.

Every binding has `mode` (`add`, the default, or `replace`), `amount` (−4–4,
default 1), `offset` (−4–4, default 0), `attack` (0–2 seconds, default 0.04), and
`release` (0–5 seconds, default 0.35). SB-05 will implement the bounded signal
envelope followed by `offset + amount * signal`; add mode adds it to the authored
property, replace mode replaces the authored property. The result must be
clamped to that property's declared range before uniform delivery. Shape
dimensions, colors, other object IDs and source text are not binding targets.
These are persisted definitions in SB-01, not a claim that the current player
already animates Builder objects.

## Limits and errors

There are at most 16 objects, one shape operation each, and four bindings per
object. Disabled/unused data still counts. The existing whole-document policy
also applies before recursive validation and again after defaults: 256 KiB
serialized UTF-8, depth 16, 64 items per array, 64 keys per object, 512 total
keys, 2,048 total values, and 64 UTF-8 bytes per key. API request limit remains
512 KiB. No Builder-specific budget bypass is introduced; rich object settings
can exhaust the shared total budget before the object-count ceiling. At most
four optional scene effects can be enabled, including bloom and tint.

All numbers must be finite and in range. Wrong types are rejected, not coerced
or clamped during storage. Duplicate IDs/targets, prototype-related fields,
unknown nested fields and executable substitutes are invalid. Errors point to
fields such as `sceneData.objects[0].operation.radius`. No submitted source is
parsed or executed to validate a Builder document. Both API create/update and
offline import inspection validate before persistence or associated side
effects. Frontend import/submission uses the same contract and budgets.

The version-one compiler applies `builder-rendering.v1.json` after object
expansion: at most 16 primitives, 15 union operations, 80 transform operations,
48 material operations, 80 modifier operations, 15 arrangement operations,
16 animation operations, 64 live property uniforms, four optional effects and
32 KiB of generated trusted source. Copies and nested arrangement stages add
their expanded costs before compilation. The existing
runtime quality, resolution, frame-rate, capture and raymarch ceilings still
apply independently.

## Delivery boundary

Validated writes use the server-owned `builder-v1` classification. The normal
player now compiles only the closed operation catalog inside its existing
isolated renderer and compiler worker; there is no custom-source fallback.
Object IDs, names and binding source labels are never interpolated into source.
Each declared bound property receives a stable object-index/property uniform,
so later time, music and pointer updates can change values without regenerating
or evaluating source on every frame. Individual scene blocks and owner
authorization remain effective. The normal editor retains its repair/export
path for Builder data until SB-03 provides object editing. Raw JSON import must
not silently replace Builder data with legacy control defaults. The data-level
import/export and create/update APIs are available for contract integration,
while the visible Builder authoring interface follows in later stories.

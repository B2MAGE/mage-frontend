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
Future format or meaning changes require an explicit contract decision and
coordinated consumer updates; they do not require a historical migration or
version-negotiation framework. Historical raw documents, retired templates and
documents rejected by the current schema return `409 SCENE_DOCUMENT_UNSUPPORTED`
without source from the owner repair endpoint. Reads never convert or rewrite
stored data. Owner repair/export remains available for supported current
documents, including scenes blocked from playback by operator controls.
Original (`legacy`) and Selective (`mapped-v1`) music response are both supported
current choices; the Original wire identifier does not make it a retired format.

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
alter later objects. Without `composition`, objects combine by union in saved
array order. The optional composition-version-one forest below supplies grouped
composition. There are no Boolean-operation scripts or reusable component
references; SB-07 must add its own bounded validated component structure and
expanded-work accounting.

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
all arranged copies. Arranged copies form an isolated compiler-owned group.
Arrangement depth remains bounded to two stages; composition groups never
multiply an arrangement or authorize formulas or cross-object mutation.

Material fields are `color` (`#RRGGBB`, default `#8066ff`), `metalness` (0–1,
default 0), and `shininess` (0–1, default 0.5). No textures, asset URLs, source,
callbacks, free-text expressions or arbitrary properties are allowed. `parameters` and
`settings` use exactly the template document's existing bounded scene-wide
scale, speed, camera, skybox catalog, motion, effects and music controls/defaults.
The scene-wide scale applies after object composition. Those controls never
convert a Builder document into custom code.

## Groups and composition (SB-09)

`builderVersion: 1` has an optional, independently versioned `composition`
extension. Omitting it retains the existing flat union exactly. Only
`composition.version: 1` is accepted. It contains an ordered `roots` array of
IDs and a `groups` array. IDs reference existing objects or groups in one shared
namespace. Each object and group must occur exactly once in the rooted forest:
unknown references, duplicate ownership, cycles and unreachable nodes are
rejected. A group cannot be empty. There are at most eight groups, three nested
group levels, and 24 entries per root/child array. Group storage order has no
rendering meaning; root order and each group's child order do.

```json
"composition": {
  "version": 1,
  "roots": ["pair"],
  "groups": [{
    "id": "pair",
    "name": "Soft pair",
    "children": ["orb-1", "orb-2"],
    "transform": { "position": { "x": 1 }, "scale": 1.5 },
    "operation": { "type": "smooth-union", "blend": 0.3 },
    "material": { "color": "#8066ff" }
  }]
}
```

Group names follow object-name bounds and default to `Group`. Group transforms
apply uniform scale (0.01–20, default 1), then X/Y/Z rotation, then translation;
rotation and position bounds/defaults match object transforms. A group
transform applies to the complete child result, including child arrangements,
modifiers, motion and nested groups. Group transforms introduce no independent
motion stages, modifiers, arrangements or bindings. Their optional bounded
property drivers are described below.

`operation` defaults to `{ "type": "union" }`. A hard union folds children in
saved order, retaining the earlier child's material on an exact distance tie.
`smooth-union` folds in the same order using a blend radius from 0–2 local group
units (default 0.25); zero is exactly a hard union. At each join, the distance is
smoothed but material is taken from the nearer input, with the same earlier-input
tie rule; colors and surface properties are not interpolated. Child order can
therefore change a smooth composition and is preserved across saves.

An omitted group `material` keeps child materials. A supplied material uses the
same fields/defaults as an object material and overrides the entire composed
result. An outer group's override wins over inner group and object materials.
Evaluation is child geometry/material, ordered group joins, optional group
material override, group transform, then the next enclosing group. Scene-wide
scale is applied after root hard-union composition.

Objects may also carry an optional `frame`, with the same position, rotation
and uniform-scale fields/bounds as a group transform. Its default is absent.
When present it transforms the entire object result after its existing object
transform, modifiers, arrangements and spin. This preserves group motion and
placement when ungrouping without flattening animated or arranged copies into
static world positions. Ungroup composes an outer group frame with the existing
object frame. An edit whose resulting frame exceeds the bounds must be rejected
with feedback rather than clamped or saved with a changed appearance.

The composition extension and frames remain ordinary validated JSON. They are
saved, exported and imported without compiled artifacts; old flat documents are
not automatically rewritten simply by loading them.

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
`release` (0–5 seconds, default 0.35). The player applies the bounded signal
envelope followed by `offset + amount * signal`; add mode adds it to the authored
property, replace mode replaces the authored property. The result must be
clamped to that property's declared range before uniform delivery. Shape
dimensions, colors, other object IDs and source text are not binding targets.
The editor's **Music & pointer** section shows the resulting clamped range and
at-rest value. Negative amounts reverse the response. Attack and release are
labelled Rise and Fall; they control how quickly the signal changes, not how
often the shader compiles.

SB-05 uses the existing parent-owned audio analyzer and the engine package's
mapped signal envelopes. All object bindings consume the same analysis frames;
they never open another audio source or analyzer. Duplicate hit frames are not
retriggered. Seek, track replacement, clear, pause and clock discontinuities
reset the response state. Missing/stale audio becomes zero, and the authored
property is never overwritten by animated output. At zero input, add mode yields
the authored value plus offset; replace mode yields offset, within property bounds.
The Simulate beat control in Motion supplies the existing deterministic test
signals when real music is not playing. Real music takes priority.

Pointer axes use canvas-local coordinates (left/bottom −1, right/top +1), and
press is 1 while the primary pointer is held. Leaving the canvas supplies zero;
pause and pointer cancellation release held input. Mouse, pen and touch share
this path. Explicit pointer bindings suppress the viewer's generic whole-scene
pointer deformation so only the authored properties deform; camera orbit still
follows the existing scene controls.

Bindings affect local object properties before parent group transforms. Object
spin adds to bound rotation, and scene speed still controls spin and scene time.
Scene-wide scale and Original/Selective music behavior remain available and
apply after local composition. These are complementary controls over the same
audio input. An outer group material override wins over an object's material
binding; the editor identifies that override. Groups do not have bindings.

Trusted compilation returns bounded binding metadata and property uniforms,
separate from generated source. Full live snapshots carry authored values and
bindings together; only object-index/property addresses matching the loaded
compiler manifest can update slots. Source, strength, offset and smoothing edits
do not reload the scene or restart music. Adding a target also stays live when
its preview uniform exists; structural changes still use the normal compiler.
No source is generated or evaluated per frame. Bindings belong to their object,
so duplication gives the object a new ID and copies its responses; deletion
removes those responses without leaving cross-object references. History,
browser drafts, normal save/reopen and JSON import/export preserve the same data.

## Bounded property drivers (SB-10)

Objects and groups may contain an optional ordered `drivers` array. Each entry
contains `target`, `mode` (`add`, `replace`, or `multiply`) and a typed
`expression`. Repeated targets intentionally apply in array order: each driver
uses the result of the previous one. Object drivers begin with the authored
property after its music/pointer binding; existing spin adds to driven rotation.
Group drivers modify the group's local transform, blend or material before its
composition is evaluated. Authored values and expressions remain the saved data;
animated output never overwrites them.

Object targets include the existing binding targets and dimensions available on
the selected primitive: `operation.radius`, `operation.width`,
`operation.height`, `operation.depth`, or `operation.tube`. Group targets are
`position.x/y/z`, `rotation.x/y/z`, uniform `scale`, `blend` for smooth-union,
and `material.metalness`/`material.shininess` when the group has a material
override. A target unavailable on that object or group is rejected.

Expressions are closed data, not executable strings:

- `constant` supplies a scalar `value` or a complete `{x,y,z}` vector; each
  component is finite and within −1,000–1,000.
- `input` selects `time`, an existing approved audio/pointer source, the native
  scene responses `scene-size`, `scene-pointer-down`, and `scene-pointer`, or
  one of `local-position`, `group-position`, `world-position`, and `view-ray`.
- `add` has matching scalar/scalar or vector/vector `left` and `right` inputs.
  `multiply` also supports scalar/vector broadcasting and componentwise vectors.
- `sin` and `cos` have one scalar or vector `input` and bounded outputs.
- `clamp` applies scalar `min` and `max` bounds to a scalar or each vector
  component. Bounds lie within −1,000–1,000 and `min` must not exceed `max`.
- `component` extracts the selected `axis` (`x`, `y`, or `z`) from a vector
  `input`. The final value of every property driver must be scalar.

Time is a scene clock, wrapped at 86,400 seconds. Audio and pointer input ranges
match bindings and reuse the existing analysis/pointer path. Driver signals use
the existing mapped envelopes with a 0.05-second attack and 0.2-second release.
The native `scene-size` and `scene-pointer-down` scalar inputs retain the shared
size and smoothed pointer-press responses used by templates. `scene-pointer`
reads the engine's smoothed mouse vector (`x`/`y`, with `z` equal to zero).
These allow editable recipes to preserve their original scene-wide music and
pointer behavior; they do not replace the independent mapped inputs.
Spatial inputs
are actual renderer coordinates or the per-pixel view ray; a camera position
is not accepted as a substitute for a view ray. `local-position` is the current
object/group baseline local coordinate before its own drivers (including its
existing binding and spin values), avoiding a circular reference to its driven
transform. `group-position` is the coordinate after the immediate parent group's
driven transform, and `world-position` is the scene coordinate before any
object/group transforms. These spatial inputs are evaluated in the trusted shader, not
converted into a whole-object CPU signal. Vector inputs require a component
selection before use as a scalar target.

Each arithmetic intermediate is clamped to ±1,000,000; trigonometric arguments
use the same bounded interval. Each driven property is constrained after every
step: dimensions, position, scale, material and blend use their declared finite
ranges, while rotation wraps to an equivalent angle in −π–π to allow continuous
spinning. Independent API and compiler validation reject unknown operations,
inputs, targets and incompatible types before compilation or persistence.

There are at most 12 drivers per object/group, 64 authored drivers per scene,
12 expression levels and 32 nodes per expression. The scene's weighted
driver-operation budget is 1,024, counting object arrangement copies and eight
operations per noise evaluation; group expressions count once for their composed
result. These limits accommodate the complete editable catalog. Rose Circuit
uses 51 authored drivers and 735 weighted operations; Prism Core uses 30 drivers
and 227 operations. They remain bounded documents using the same ordinary
controls as a scene authored from scratch.

Preview compilation normally gives numeric coefficients independent live slots.
If that would exceed 64 uniforms, it pools equal coefficients (including vector
components and clamp bounds). Each distinct
audio/pointer signal and native scalar scene input requires one shared uniform.
Time, spatial inputs and the built-in `scene-pointer` vector do not add slots.
If pooling still exceeds the existing 64-uniform ceiling, numeric constants
are emitted as trusted numeric literals instead. Music/pointer signals remain
live. Saved compilation also uses literals for constants. This avoids allocating
one GPU uniform per repeated coefficient without changing the authored data.

Numeric edits update live slots when the slot layout remains the same. Splitting
or merging pooled constants can change that layout; inline-coefficient edits also
change the generated source. Those changes use the existing coalesced structural
preview reload and stale-work cancellation, as do expression, target and mode
changes. Source generation is never performed per frame. The UI's Pulse, Wobble, Spin, Speed, Amount, Phase,
Offset and range controls edit this same data without exposing a formula box.
Original and Selective scene-wide audio modes remain supported alongside these
per-object/group drivers.

The editable Alloy Capsule recipe is a concrete cylinder and two spheres in
ordered composition groups, with shared rotation, pointer/music response and
view-ray shaping. `drivers-editable-alloy-capsule-current-recipe` in the shared
round-trip fixtures pins the current recipe as ordinary editable data. API
create/update/read tests use this exact document; the saved scene has no template
alias or hidden source dependency.

## Frames and procedural lattices

`box-frame` is the engine's actual box-frame distance function, with independent
`width`, `height`, and `depth` from 0.01 to 10 and `thickness` from 0.001 to 3.
Dimensions default to 1 and thickness to 0.08. The edges grow inward; a thick
frame can fill its interior. It is not a hollow-box shell approximation.

`lattice` repeats an edge frame procedurally with `iterations` from 1 to 5
(default 2), `spacing` from 0.01 to 10 (default 0.3), and `thickness` from
0.0001 to 3 (default 0.02). Spacing is a cell half-size; thickness is the actual
rod radius, independently editable from spacing. Each fold mirrors all three
coordinates and subtracts `spacing * 2^i`, for `i = iterations - 1` down to zero.
This retains the engine's fractional behavior: 1.99 performs one fold at
exponent 0.99. It does not round the document to two folds. The final frame has
zero edge thickness and is expanded by the authored rod radius.

Frames and lattices remain one editable object per arrangement copy. They use
the same transforms, materials, modifiers, grouping, saving and driver system
as the other shapes. Frame dimensions/thickness and lattice spacing/thickness
are driver targets. Repetition levels are structural and cannot be animated.
Drivers retain each property's finite range. Generated source contains only
trusted arithmetic for these operations, so production compilation does not
depend on dynamically resolving a `boxFrame` or `grid` function.

Object parent frames and group transforms may specify `rotationOrder` as one
of `xyz`, `xzy`, `yxz`, `yzx`, `zxy`, or `zyx`. Omission keeps `xyz`. This is the
forward surface rotation order; the compiler reverses it for the coordinate
transform. It allows editable template recipes to retain their authored
rotation sequence without adding hidden template behavior.

An optional top-level `rendering` object preserves authored march settings:
`maxIterations` is an integer from 1 to 200, and `stepSize` is a number from
0.005 to 1. These are the existing isolated engine bounds. Omitted rendering
data stays absent and compiles with the established 96 iterations and 0.7
step size; a present partial object fills only its missing rendering defaults.
Editable template conversions can therefore retain their original march
settings as ordinary saved controls. Imported values outside the finite bounds
are rejected, and the renderer independently enforces the same 200-iteration
ceiling. No global rendering or document limit changes for this setting.

The existing 80-operation modifier budget also accounts for procedural shape
work: a box frame costs 3, and a lattice costs `3 + floor(iterations)`, each
multiplied by arrangement copies. No workload, raymarch, resolution or runtime
limits increase. Conservative outer bounds include every lattice fold, rod
radius, and later shell/expand modifier so thin or scaled geometry retains its
surface without slow empty-space marching. Spatially varying drivers use the
existing unbounded-coordinate path instead of an invalid fixed box bound.

## Limits and errors

There are at most 16 objects, one shape operation each, and four bindings per
object. Disabled/unused data still counts. The existing whole-document policy
also applies before recursive validation and again after defaults: 256 KiB
serialized UTF-8, depth 24, 64 items per array, 64 keys per object, 4,096 total
keys, 8,192 total values, and 64 UTF-8 bytes per key. API request limit remains
512 KiB. No Builder-specific budget bypass is introduced; rich object settings
can exhaust the shared total budget before the object-count ceiling. At most
four optional scene effects can be enabled, including bloom and tint.

SB-13 expands the data/expression allowances for Prism Core and Rose Circuit:
document depth 16→24, total keys 1,024→4,096, total values 2,048→8,192;
driver count 32→64, drivers per node 8→12, expression depth 8→12 and weighted
driver operations 192→1,024. Expression nodes remain capped at 32. Nested
phased waves, local coordinate snapshots, separate RGB channels and sequential
joins now fit as inspectable data instead of an opaque template implementation.
The shared frontend/backend contract enforces these same limits before storage
and again before rendering; there is no recipe-only exemption.

The GPU uniform ceiling remains 64 and generated trusted source remains capped
at 32 KiB. The saved Rose reference generates 26,161 bytes with only two native
input uniforms; preview uses pooled coefficients when possible and literals
when they will not fit. Object, group, geometry/modifier, transform, material,
arrangement, optional-effect, pixel, frame-rate and raymarch ceilings are
unchanged. No engine change is required. These static bounds and a successful
compile do not establish equal physical-device frame rates.

All numbers must be finite and in range. Wrong types are rejected, not coerced
or clamped during storage. Duplicate IDs/targets, prototype-related fields,
unknown nested fields and executable substitutes are invalid. Errors point to
fields such as `sceneData.objects[0].operation.radius`. No submitted source is
parsed or executed to validate a Builder document. Both API create/update and
offline import inspection validate before persistence or associated side
effects. Frontend import/submission uses the same contract and budgets.

The version-one compiler applies `builder-rendering.v1.json` after object
expansion: at most 16 primitives, 15 composition operations, 200 transform operations,
72 material operations, 80 modifier operations, 15 arrangement operations,
16 animation operations, 64 live property uniforms, four optional effects and
32 KiB of generated trusted source. Copies and nested arrangement stages add
their expanded costs before compilation. Transform work includes five operations
per expanded primitive, object frame and group. Material work includes three
operations per expanded primitive and group material override. The forest's
single ownership ensures grouping does not duplicate primitive work; every
primitive join still counts whether hard or smooth. Existing whole-document
budgets also count group metadata and materialized defaults. The existing
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
authorization remain effective. The normal editor provides object, group and
response editing alongside repair/export. Raw JSON import preserves Builder
data through the same current-format validation used by create/update APIs.

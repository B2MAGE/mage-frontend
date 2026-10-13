# Editable catalog and authoring coverage (SB-13)

SB-13 completes the editable catalog with **Prism Core** and **Rose Circuit**.
All 14 entries in the Template picker have a concrete Builder document. Opening
one reveals its constituent objects and groups; editing produces an adaptation.
The **+** button beside Template starts a blank **New Template** using the same
workspace and controls. Template switching still asks before discarding a new
template or adaptation.

These are scene starting points, not saved reusable user templates. Saving stores
the current objects, expressions, materials, composition, and scene settings.
It does not store a reference that can silently change when a recipe is edited.
Saving named reusable templates is separate work.

## Catalog checklist

Every row shares object selection, reorder, duplication/deletion, independent
responses, undo/redo, browser draft recovery, and current-format scene transport.
The table highlights the behaviors that must also be reachable from a blank
workspace. The original version-one shader catalog remains the comparison source,
not an executable node hidden inside an editable recipe.

| Template | Constituent geometry | Behaviors to inspect and recreate |
| --- | --- | --- |
| Prism Core | Two box frames and a sphere | Ordered shared/local rotations; nested view/time waves; shifted view-ray RGB; separate material response and animated joins |
| Steel Lattice | Lattice and three box frames | Shared pointer/time motion, view-dependent shaping, scene-size dimensions, outer smooth join |
| Aqua Static | Two box frames and two lattices | Ordered group expansion, two noise scales sampling earlier ancestor coordinates, fractional lattice levels, exact RGB |
| Verdant Frames | Two box frames and a lattice | Shared/local rotations and an animated outer join |
| Crimson Reactor | Frame, two cylinders, sphere, lattice | Expansion of joined children, ancestor noise scope, unaffected sphere, precise material |
| Alloy Capsule | Cylinder and two spheres | Independent dimensions, shared motion, view-dependent shaping, animated sphere join |
| Redline Core | Sphere, cylinder and two lattices | Dense lattice, shared motion, pointer/scene-size dimensions, animated outer join |
| Violet Matrix | Two lattices and two spheres | Dense lattices with distinct levels and scene-responsive dimensions, animated inner join |
| Mint Halo | Torus, frame, sphere and three lattices | Mixed primitives and folded lattices, shared motion, animated outer join; its source has no noise |
| Ember Grid | Frame, lattice and sphere | Fine lattice rods, shared motion and an animated inner join |
| Emerald Ring | Torus, frame and lattice | Shared motion, view shaping and an animated outer join |
| Spectrum Relay | Cylinder, torus and lattice | Scoped cylinder expansion using world-position noise, view-ray RGB |
| Chroma Storm | Sphere, torus, cylinder, lattice and frame | Three ordered group expansions, ancestor noise scopes, view-driven motion and RGB |
| Rose Circuit | Two tori and a cylinder | Ordered shared/local transforms, distinct phased motion and colors, nested noise/time deformation, safe animated dimensions and sequential joins |

## Capability-to-control checklist

The paths start in **Create Scene → Scene → Builder workspace**. Select an object
or group to open its inspector. A group may supply a material that overrides its
children; inspect the named group when an object's color changes appear hidden.

| Capability | Ordinary control path | Coverage |
| --- | --- | --- |
| Primitive shapes and dimensions | **Shape → Add object**, then **Shape** in the selected object | Sphere, box, torus, cylinder, box frame, lattice; fractional lattice levels and precise dimension fields |
| Ordered composition | Check rows → **Group selected**; selected group **Composition**; row arrows/drag and parent control | Nested groups, union/smooth union, child order and regrouping |
| Shared and local transforms | Object/group **Transform**; group **Rotation → Rotation order** | Position, rotation, scale; separate groups establish ordered coordinate spaces |
| Time and phased waves | **Animation → Add pulse / Add wobble / Add spin** | Speed, phase, amount and offset; opening an existing expression does not simplify it |
| Nested combined calculations | **Animation → Add combined inputs**, or an influence's **Edit combined inputs** | Fixed scalar/XYZ values, inputs, addition, multiplication, sine/cosine, range limits, XYZ component and noise |
| Mixed vector/scalar expressions | Combined inputs → an XYZ multiplication → **Multiply values** | XYZ × number, number × XYZ, XYZ × XYZ; component selection gives a scalar property value |
| Coordinate snapshots | Combined inputs → **Input → Parent group position (XYZ) → Coordinate group** | Local, world, view ray, scene pointer and a bounded ancestor group selection |
| Object/group deformation | **Modifiers → Add modifier**, or **Animation → Add noise deformation** | Object Expand/Shell/Twist; group Expand/Shell after children are joined; listed order matters |
| Editable noise pattern | Noise influence **Frequency / Strength / Pattern offset / Drift / Coordinate space** | Fast controls for noise, with the same expression available in combined inputs |
| RGB and material behavior | **Appearance → Color**, **Metalness**, **Shininess**; **Add view-ray color / Add animated RGB** | Exact signed numeric RGB channels and three ordinary channel influences, not baked colors |
| Dynamic joins | Group **Composition → Smooth union**; **Animation → Property → Blend radius** | Join radius can follow any supported bounded expression |
| Independent musical/pointer responses | Object **Music & pointer responses** or **Animation → Input** | Each object's source/amount can differ; group influences can move children together |
| Scene-wide response | **Motion → Music response** | Mapped music settings remain scene data; temporary beat simulation is not saved |
| Sampling profile | Workspace **Rendering** | Bounded maximum iterations and step size; recipes retain source sampling intent |
| Persistence and recovery | Editor header Undo/Redo/draft menu; normal Save; Confirm JSON import/export | Concrete scene document, not source/alias; malformed input remains a visible error |

Nested combined inputs are the general authoring editor, not a preserve-only
display. A calculation can be opened down to its constants and inputs, changed,
removed, wrapped in another operation, or recreated through **Add combined
inputs**. Named controls are shortcuts for those same document expressions.

## Automated verification

`builderCatalog.test.ts` compares the selectable catalog with all recipes and the
shared `contracts/scenes/builder-catalog.v1.fixtures.json` persistence corpus.
It checks that every shape field, driver target and expression input is offered
by the shared editor; edits and independent bindings survive save/export/import
and draft records; a fresh recipe remains unchanged after another copy is edited;
and every recipe compiles through both preview and playback paths and the
packaged engine within the shared ceilings. Source aliases and unsupported
expressions are rejected. This structural audit is complemented by actual UI
authoring tests; it is not presented as proof that a dropdown is usable merely
because a schema accepts its value.

The frame/alloy and deformation suites execute the maintained original source
with recording primitives and compare geometry, dimension response, material,
group scope, joins and rotation order across many input states. The full-catalog
fixtures use `mapped-v1`; current direct object bindings remain independent of
that scene-wide mapping.

Useful frontend checks from the frontend repository:

```powershell
npx vitest run src/modules/scene-editor/builderCatalog.test.ts src/modules/scene-editor/builderRecipes.test.ts src/modules/scene-editor/builderDeformationRecipes.test.ts src/modules/scene-editor/builderComplexRecipes.test.ts
npx vitest run src/modules/scene-editor/ui/BuilderExpressionControls.test.tsx src/modules/scene-editor/ui/BuilderProceduralControls.test.tsx src/modules/scene-editor/SceneEditor.combinedInputs.ui.test.tsx src/modules/scene-editor/useSceneDraftCommands.test.tsx src/modules/scene-editor/sceneDraftRecovery.test.ts
npm run contracts:check -- ../mage-backend-demo-136
npm run build
npm run lint
```

The normal preview scheduler/capture/submission suites cover newer edits replacing
older compile requests, invalid drafts retaining their last valid preview,
thumbnail invalidation after edits, and stale captures/saves being discarded.
Backend integration checks must also submit the shared corpus through the actual
API and reopen the stored documents; frontend parsing alone is not database
persistence evidence.

## Visual and musical comparison procedure

The committed loopback-only review page is
`http://127.0.0.1:5178/scripts/builder-catalog-check.html`, available through
`npm run manual-checks:dev` after stopping the normal Vite server on that port.
The isolated renderer must also be running on its configured port 5181. Normal
development/preview servers return 410 for this page; it is not part of the
deployed application. Restore `npm run dev` after the checks.

Choose a template, response mode, clock, viewport and render profile, then
**Run / reload reference**. Start with **Original only**, capture its snapshot,
then switch to **Builder only** and capture again. Matching settings keep the
pair for comparison; changing settings and pressing Run clears old captures.
**Frozen size reference** holds a supplied native size in the supported Original
response mode. **Mapped response · silence / simulated beats** exercises the
current mapper; its output may replace that native size. Simulated beats use a
fixed seed but two captures are not phase-synchronized. Do not call a beat-mode
image difference a pixel-parity measurement.

Compare an immutable original and its editable recipe sequentially in the normal
isolated player with matching engine/package version, profile, viewport, camera,
skybox, effects, mesh scale, fixed clock, scene-size/pointer state and mapped
response configuration. Capture both images and record those settings. A clock
match alone is insufficient if size or smoothed pointer values differ.

Use at least silence and a fixed mapped input state, multiple clock phases, and
released/pressed pointer states. In the ordinary editor, also play a track or use
the temporary beat simulation and verify that two different objects can follow
different inputs. Change a nested wave/noise coefficient, undo and redo it, recover
the draft, then save/reopen/export/import it. Capture a fresh thumbnail after the
edit, not an image from the old scene revision.

Check the normal editor in both themes at desktop and narrow viewport widths.
A narrow desktop browser is a layout check; it does not establish Pixel/Chrome
GPU performance or physical touch behavior. Record actual devices separately and
coordinate the wider music/device assessment with #187.

### Local observations, 2026-10-12

The final frontend `npm test` run passed all 2,993 tests in 209 files, plus the
41 worker tests and compiled-output/security/manual-route prechecks. Lint, the
production build, all seven shared contract-copy comparisons and the dedicated
catalog harness TypeScript check also passed. The build retained its existing
packaged-compiler `eval` and large-chunk warnings.

All 14 original/Builder pairs were loaded and captured sequentially with the
packaged engine, preview profile, 640-pixel viewport, clock 0, native size 0.6,
camera `(0, 0, 5.5)`, FOV 75 and scene scale 1. In that run, 13 pairs had mean RGB
error below 0.058 out of 255. Prism Core measured 0.0162/255 (0.044% of pixels
differed by more than eight levels); Rose Circuit measured 0.0270/255 (0.001%).

Chroma Storm's initial capture measured 2.9432/255 (3.510% above eight levels).
Repeating it with the same reference settings measured 0.0245/255 (0.023%). The
first result is retained as a capture variance observation; the later comparison
does not prove why that first capture differed. Recipe math was also compared
directly with the original source.

At clock 3 and a 360-pixel viewport using the full profile, Prism Core measured
0.0116/255 (0.037%) and Rose Circuit 0.0000/255 (0.000%). All 14 Builder recipes
also loaded and produced captures with mapped simulated beats at a 360-pixel
preview width. Those beat captures are playback checks, not synchronized image
comparisons. A separate mapped-silence comparison used the full profile at width
640, clock 0, scene scale 10 and fixed camera/pointer state. Prism Core measured
0.0000/255 and Rose Circuit 0.0001/255, with no pixels differing by more than eight
levels in either pair.

The ordinary editor was checked in both themes at width 390; the document's
scroll width remained 390. Rapid Prism → Rose → Prism → Rose selection ended on
a playing Rose scene. Editing a nested Rose coefficient from 0.0054 to 0.1 marked
it as an adaptation and kept playback working; Undo restored the value. A fresh
thumbnail capture succeeded. An existing `127.0.0.1` tab initially needed Retry
after hot reload; Retry cleared that state and the active review tab played. A
clean `localhost` tab loaded on its first attempt. This records the observed
development-session behavior rather than asserting that cached sessions or
physical mobile devices can never fail.

All 312 focused backend tests passed. The integration suite persisted and reopened
all 14 shared fixture documents through its real PostgreSQL-backed API, including
renamed object/group IDs, edits, public reads and rejected updates leaving stored
data unchanged. The local backend was rebuilt and passed health/readiness checks;
its packaged contracts match source. All 14 existing local scenes and the running
PostgreSQL/MinIO data services were preserved.

The uncommitted local evidence is in the workspace's
`.local/sb13-complete-catalog-20261012/browser-catalog-evidence.json` plus the
`chroma-original.png`/`chroma-builder.png` repeat captures. Physical mobile
hardware and actual-track timing remain separate review checks.

## Limits and release status

The shared contract and renderer policies remain the authority for object, group,
expression, input, modifier and rendering limits. SB-13 increases the finite
data/expression allowances needed to represent the final two templates:

| Allowance | Current ceiling |
| --- | --- |
| Authored drivers | 64 per scene, 12 per object/group |
| Weighted driver operations | 1,024, including eight per noise evaluation |
| Expression structure | 12 levels, 32 nodes per expression |
| Whole-document structure | Depth 24, 4,096 keys, 8,192 values |

Prism Core uses 30 drivers and 227 weighted operations. Rose Circuit uses 51
drivers and 735 operations; its saved reference compiles to 26,161 source bytes
with two native input uniforms. The **64-uniform GPU ceiling and 32 KiB generated
source ceiling remain unchanged**, as do geometry, transform, effect, pixel,
frame-rate and raymarch limits. This work requires no engine change.

Preview compilation normally keeps independent live slots for numeric edits.
When that would exceed 64 uniforms, it first shares equal numeric coefficients;
if the pooled coefficients still will not fit, it emits them as trusted literals.
Signals such as music and pointer remain live; changing an inlined coefficient
uses the normal coalesced structural preview reload. Edits that split shared
coefficient slots likewise reload when the slot layout changes. This preserves
independent editable values without inventing extra GPU input capacity.

Deep expressions and heavily
nested compositions can leave less room for additional influences; a clear
validation message should retain the editable draft and last valid preview.
Final dimensions remain bounded even when an influence subtracts from a value.

Prism's procedural RGB highlights may reach 1.25 before tone mapping and are
preserved by a bounded [-1, 2] driver output range. Base color inputs retain their
existing [-1, 1] range. Metalness and shininess remain within [0, 1]: at unusually
large scene-size inputs, Prism's original shader exceeds that material range,
while its editable version stops at the supported maximum. The ordinary fixed
size 0.6 reference is unaffected by this intentional material bound.

The eight earlier frame/alloy conversions retain six-digit color quantization,
as documented in [their reference](builder-frame-lattice-references.md). The
deformation/RGB conversions use precise numeric color. Floating-point math,
raymarch convergence and the preview/full pixel budgets can cause small visual
differences across devices and profiles. No screenshot establishes frame-rate,
audio timing, persistence or absolute GPU safety.

This document accompanies the local `codex/sb13-complete-template-catalog` review.
It is not deployment evidence. The final local commands, observed browser
comparisons and any remaining physical-device checks belong in the verification
record for [SB-13 #301](https://github.com/B2MAGE/mage-frontend/issues/301). Merge,
production deployment and issue closure wait for the user's review.

# Editable deformation and material references

SB-12 adds ordinary Builder documents for Aqua Static, Crimson Reactor, Spectrum
Relay, and Chroma Storm. Their source of truth is the executable version-one
catalog in `src/modules/player/templates/versions/v1/definitions.ts`, corresponding
to the maintained engine presets 2, 4, 11, and 12. These documents contain objects,
groups, transforms, modifiers, materials, and bounded expressions. They do not
retain a template alias, shader string, or hidden template callback.

The visible dimension baseline is `size = .6`. Dimensions continue to respond to
the original engine size and smoothed pointer inputs through editable influences.
The conversion preserves the current scene's scale, speed, camera, skybox, audio
mode, and effects. See [frame/lattice geometry](builder-frame-lattice-references.md)
for the exact frame distance and folded-grid semantics used here as well.

## Scope and order

The source `expand(noise(s*f)*a)` subtracts `noise(s*f)*a` from the distance of
**all geometry already accumulated in that scope**. It does not deform the
primitive written after the call. Each editable recipe therefore groups the
preceding shapes and applies an Expand modifier after that group's children have
been combined. The visible Expand amount is `a`; an ordinary multiply influence
reads `noise(position*f)`. Both strength and frequency remain independently editable.

The following trees show actual composition order. `+` means hard union, and
`E(f,a,body)` means that post-composition expansion. The geometry shorthand is:

- `F(a) = boxFrame(vec3(size*a - pointerDown*.05), size*a - pointerDown*.005)`.
- `G(n,a) = grid(n, size*a - pointerDown*.05/3, .01*size*a - pointerDown*.05)`.
- `C(a) = cylinder(size*a - pointerDown*.0125, size*a - pointerDown*.05)`.
- `S(a) = sphere(size*a - pointerDown*.025)`.
- `T(a) = torus(size*a - pointerDown*.05, size*a - pointerDown*.0125)`.
- `B(n) = grid(n, 4*size, max(.001, .003*size))`.

### Aqua Static

```text
Shared motion and color
  View shaping and outer join: smooth-union
    Main shapes: union
      Expanded frame pair: E(.22270041645902117, .41792724482850996)
        Fine noise on outer frame: E(1.768209282106819, .030656382800295368)
          F(.8865473246350158)
        F(.6350550547291461)
      G(3, .6596742230897178)
    B(1.99)
```

Both noise expressions sample the space captured by **Shared motion and color**,
before the view-dependent rotations. They refer to ancestor 3 and ancestor 4,
respectively. Ancestor 1 always means the immediate parent, not the owner itself.
The supporting lattice retains `1.99`: one fold at exponent `.99`, without
rounding to one or two integer levels. This recipe has 4 objects, 5 groups, and
group depth 5.

### Crimson Reactor

```text
Shared motion and color
  View shaping and outer join: smooth-union
    Main shapes: union
      Expanded frame and cylinders: E(.1959164091445773, .09097642567410547)
        F(.8161210436163664)
        C(.8534422954798347)
        C(.7693094322944559)
      S(.886879464900987)
    B(1)
```

Noise reads ancestor 3, the shared-motion snapshot. The sphere is outside the
expanded group. This recipe has 5 objects, 4 groups, and group depth 4.

### Spectrum Relay

```text
View color and shapes: union
  Expanded cylinder: E(.7369379972723424, .2843224929727242)
    C(.6168195561594768)
  T(.8334445133920002)
  G(3, .9954834969507702)
```

Noise reads world position, as the source captures its space without any preceding
rotation. This recipe has 3 objects, 2 groups, and group depth 2.

### Chroma Storm

```text
View motion and color: union
  Noise before outer frame: E(1.6366720215270216, .40304648326346637)
    Noise before lattice: E(.5620060333649501, .4766355635901381)
      Noise on center sphere: E(1.9603753411504794, .38739515373281597)
        S(.6061774521306397)
      T(.5957939662981329)
      C(.7847176552581908)
    G(5, .6803317673052074)
  F(.8080101969375488)
```

The three noise influences use ancestor 1, 2, and 3 to sample the same **View
motion and color** snapshot, after its rotations. The outer frame stays outside
all three expansions. This recipe has 5 objects, 4 groups, and group depth 4.

Aqua and Chroma each have an initial source expansion before any primitive.
It changes only the engine's empty-distance sentinel, not a visible surface, so
the recipe omits it. Spectrum and Chroma end with a blend setting that has no
subsequent primitive; it cannot join anything and is also omitted. These are
visible-surface conversions, not claims that every far-field sentinel value or
unused source statement is byte-identical.

## Motion and materials

Aqua and Crimson preserve this coordinate rotation sequence, where `t = speed*time`:

```text
Shared motion: rotateY(-mouse.x*2.5*pi + t - pointerDown - .1)
               rotateX( mouse.y*2.5*pi + t)
View shaping:  rotateX(ray.y*rayX + t)
               rotateY(ray.x*rayY + t)
               rotateZ(ray.z*rayZ + t)
```

| Recipe | Speed | rayX | rayY | rayZ | Final smooth blend |
| --- | --- | --- | --- | --- | --- |
| Aqua | `.131579219319508` | `2.154824707715323` | `2.583074645636565` | `2.9303390219795165` | `.280208045235598*(.5+.5*sin(t*size))` |
| Crimson | `.15934458017140202` | `2.4340193013105202` | `1.7776157305492712` | `1.7322517724210127` | `.17222512677372692*(.5+.5*sin(t*size))` |

Builder stores the Y-driver sign needed by the engine's XZ coordinate rotation
convention. Shared motion uses forward XYZ order; View shaping uses forward ZYX
order, so their inverse coordinate transforms produce the sequence above.

Spectrum has no coordinate rotation. Chroma uses forward ZYX with Y zero to
produce `rotateX((ray.y+t)*2.4510099887638064)` followed by
`rotateZ((ray.z+t)*1.329787985176121)`, where `t=.9539348297232683*time`.

| Recipe | Exact numeric RGB | Metalness | Shininess |
| --- | --- | --- | --- |
| Aqua | `.08256470259178794, .782309705948631, .763003005740327` | `.5728721327171771*size` | `.36898649780731946` |
| Crimson | `.8939736534961771, .15343539973164377, .2647498251648912` | `.5135977939307566*size` | `.4793980848131761` |
| Spectrum / Chroma | `ray.x, ray.y, ray.z` | `.5` | `.3` |

Numeric color channels preserve full precision in the shader's color domain.
They are not rounded through a six-digit color picker, converted with an sRGB
transfer function, or remapped from `[-1,1]` to `[0,1]`. Spectrum and Chroma use
ordinary replace influences on Red, Green, and Blue, each reading a view-ray
component. Their plain base material is white; each object has an independent
copy of the material if moved outside its group.

## Rendering and verification

| Recipe | Maximum iterations | Step size |
| --- | --- | --- |
| Aqua | 133 | `.8632297724861512` |
| Crimson | 161 | `.7431197197400152` |
| Spectrum | 96 | `.8497186712056144` |
| Chroma | 78 | `.7369359368566446` |

These are the source sampling profiles. All four fit the existing 16-object,
8-group, 192-weighted-driver-operation, 64-live-uniform, and 80-modifier-operation
budgets. Nesting supports up to 6 group levels so ordered deformation can be
expressed; primitive, group, expression-node, and rendering ceilings remain
bounded. Noise consumes eight weighted expression operations per node.

`builderDeformationRecipes.test.ts` executes the maintained catalog through
recording primitives and compares the editable recipes at 96 combinations of
size, pressed-pointer strength, and clock time per template. It verifies primitive
dimensions, expansion order/frequency/strength, joins, rotation sequence, ancestor
snapshot ownership, exact materials, sampling profiles, independent document
creation, and storage/playback round trips. Both preview and playback documents
also compile through the packaged engine and its artifact validator under the
unchanged workload budgets.

`builderGroupDistanceRuntime.test.ts` separately probes the packaged GLSL's native
group-distance updates. Negative expansion must shrink the result, shell must
make the deep interior positive, and swapping modifier order must change the
answer. These checks prevent accidentally unioning the modified distance back
with the unmodified group, which would erase shrinking and shell interiors.

The recorder deliberately does not emulate GPU noise or claim pixel equality.
Renderer comparisons require the same camera, mesh scale, native inputs, clock,
effects, and skybox; physical-phone performance and visual review are separate
from these deterministic source and compilation checks.

### Local review, 2026-10-12

Sequential original/Builder captures through the normal isolated player used
640×360 output, camera `(0,0,5.5)`, mesh scale 1, native size `.6`, time 0,
no audio, and the same skybox/effects. Mean absolute RGB differences (byte scale)
were `.0948` for Aqua, `.0182` for Crimson, `.6420` for Spectrum, and `.6404`
for Chroma. Pixels differing by more than 8 in any channel were respectively
`.071%`, `.007%`, `.558%`, and `.819%`. These are a fixed reference check,
not a claim of exact pixel equality at every setting.

All four Builder previews also loaded at 360-pixel width and time 3. In the
normal editor, Aqua's numeric RGB values retained their source precision;
changing noise frequency and drift updated the preview, and Undo restored the
original values. The in-app browser throttled host animation frames, so this
check does not establish physical-phone frame rates.

For manual authoring review, open a new template, select an object, and use
**Animation → Add noise deformation**. Frequency, strength, pattern offset,
drift, and coordinate space are editable there; **Edit combined inputs** opens
the same expression in the general editor. **Appearance** provides exact RGB
channels plus editable view-ray and animated-color influences. Expand/Shell
on a group deform the joined children, in the listed modifier order.

This work is on `codex/sb12-deformation-materials` for local review. It has not
been merged or deployed to production.

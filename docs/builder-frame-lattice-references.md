# Editable frames and lattices

SB-11 adds concrete Builder recipes for Steel Lattice, Verdant Frames, Redline
Core, Violet Matrix, Mint Halo, Ember Grid, and Emerald Ring, and brings the
existing Alloy Capsule recipe onto the same exact conversion path. Each conversion is
an ordinary editable document: individual shapes, three named groups, property
drivers, and current scene settings. There is no embedded template code or
template lookup in the saved Builder document.

The reference is the executable shader in
`src/modules/player/templates/versions/v1/definitions.ts`. Visible dimensions
start at `size = 0.6`, clock zero and a centered/released pointer, then ordinary
property influences apply the original engine size and pointer formulas. The
conversion retains the template's mesh scale (normally `10`) or the user's
customized scale and speed. The visible reference is an editing baseline, not a
fixed replacement for the changing original size.

## Geometry semantics

`boxFrame(b, e)` uses the original exact frame distance function, with `b` a
half-extent vector and `e` the edge thickness parameter. It is not a hollow box
shell. In several original templates `e` equals every component of `b`; the
released-pointer reference is consequently solid rather than a fine wireframe.
Those values are preserved. Steel's final frame uses a genuinely thin edge.

The original `grid(n, a, r)` performs these coordinate operations:

1. Start with the current local point `p`.
2. For `i = n - 1; i >= 0; i -= 1`, set `p = abs(p) - a * 2^i`.
3. Evaluate `boxFrame(vec3(a), 0)` at that point.
4. Subtract `r * a` from its distance to give the rods their radius.

Builder calls these controls **Repetition levels**, **Cell size**, and **Rod thickness**.
The saved `spacing` corresponds to `a`; saved `thickness` is the actual radius
`r * a`, not the source's ratio `r`. The finite fold operation stays compact;
it does not materialize an object for every lattice cell. Each fold and the frame
distance work still count toward the existing workload budget. Integer `n` gives
`2^n` cells on each axis. A fractional value keeps the original loop semantics:
`1.99` executes once with exponent `.99`, not twice and not at exponent `1`.
The seven frame/lattice recipes use integer values, but the operation supports fractional
editing without rounding its meaning away.

The lattice thickness minimum is `0.0001`, because the original Redline, Mint,
and Ember rods at this reference are below `0.001`. That is a dimension bound,
not an increase in scene work or renderer limits. Very thin rods can occupy less
than one screen pixel and will not be equally visible at every viewing distance.

## Original formulas and recipe constituents

In this table `s` means the original size input, `p` means pointer-down strength,
and the functions are shorthand for the original source:

- `F(a) = boxFrame(vec3(s*a - p*.05), s*a - p*.005)`.
- `G(n,a) = grid(n, s*a - p*.05/3, .01*s*a - p*.05)`.
- `S(a) = sphere(s*a - p*.025)`.
- `C(a) = cylinder(s*a - p*.0125, s*a - p*.05)`.
- `T(a) = torus(s*a - p*.05, s*a - p*.0125)`.
- `B(n) = grid(n, 4*s, max(.001, .003*s))`.

The constituents before the semicolon are joined with hard union, in source
order. The final constituent after it joins using the animated smooth blend.

| Recipe | Original constituent calls |
| --- | --- |
| Steel Lattice | `G(3,.7174867540818692)`, `F(.6287507765216367)`, `F(.6816361304019778)`; `boxFrame(vec3(.7*s), .05*s)` |
| Verdant Frames | `F(.8239408771788657)`, `F(.9606847874663808)`; `B(2)` |
| Alloy Capsule | `C(.9446738625954518)`, `S(.7023682612074287)`; `sphere(s/3)` |
| Redline Core | `S(.9935175302558173)`, `C(.9289837692896183)`, `G(5,.5167759726831176)`; `B(2)` |
| Violet Matrix | `G(5,.7173114499365616)`, `G(4,.6514999435141519)`, `S(.7684034276974527)`; `sphere(s/3)` |
| Mint Halo | `T(.7885283144721178)`, `G(3,.5103440758834754)`, `F(.57344769639438)`, `G(3,.5749414312428847)`, `S(.6151950610078535)`; `B(1)` |
| Ember Grid | `F(.7439170606081622)`, `G(3,.508466039994321)`; `sphere(s/3)` |
| Emerald Ring | `T(.8810248079142805)`, `F(.8855044665503)`; `B(1)` |

At the released-pointer reference, a `G(n,a)` recipe therefore stores spacing
`.6*a` and rod radius `.01*(.6*a)^2`. `B(n)` stores spacing `2.4` and rod radius
`.00432`. The torus receives both original dimensions; no hole is invented by
reducing the tube radius. Mint Halo's marketing description mentions noise, but
its executable shader has no noise call, so its recipe does not add one.

## Motion, grouping, and materials

All eight original shaders use `t = .1*time`, followed by these coordinate
rotations, in this exact order:

```text
rotateY(-mouse.x*2.5*pi + t - pointerDown - .1)
rotateX( mouse.y*2.5*pi + t)
rotateX(ray.y*k + t)
rotateY(ray.x*k + t)
rotateZ(ray.z*k + t)
```

The **Shared motion** group owns the first two rotations. Its conventional
forward XYZ order emits inverse coordinate Z, Y, X operations; Z is zero here.
The Y drivers use the opposite sign to account for the engine's XZ coordinate
rotation convention. The **View shaping and join** group explicitly selects
forward ZYX order, which emits coordinate X, Y, Z. Its Y driver signs are also
reversed. This preserves the source's scoped rotation order without adding
hidden groups or exceeding the existing group-depth limit.

The **Main shapes** group contains every constituent except the last, using
union. The view group joins that whole body with the final constituent using
`blend = b * (.5 + .5*sin(.1*time*s))`, exactly the original `b*nsin(t*s)`.
The ordinary blend field remains editable: its baseline is `b/2`, multiplied by
`1 + sin(.1*time*s)`. The join is not applied between every constituent.

| Recipe | Original RGB | Metal coefficient (`metal = coefficient*s`) | Shine | Ray coefficient `k` | Blend coefficient `b` |
| --- | --- | --- | --- | --- | --- |
| Steel Lattice | `.43262751221303614, .4925493880484813, .4820048306239232` | `.5870582642599769` | `.6708057727257557` | `1.2506225601940093` | `.22812291319767167` |
| Verdant Frames | `.14998612477802592, .47642472828922455, .0644383761978728` | `.6434036988763767` | `.34486068234140727` | `2.9789122078821793` | `.25980941491680876` |
| Alloy Capsule | `.24020625518667676, .2651915227911193, .21629480224767128` | `.6304962928840792` | `.6210181878056416` | `1.9599006869721014` | `.11435451161014794` |
| Redline Core | `.9514769334666449, .1077350724621205, 0` | `.7125574975041655` | `.5774589834819871` | `2.1969051528600634` | `.22861033952631743` |
| Violet Matrix | `.11460860093209857, .007694076675091144, .4671766017485241` | `.5711799571404537` | `.5590513531439385` | `2.0857194147559914` | `.1017060511129565` |
| Mint Halo | `.4050203196259186, .7752881097617492, .451950921258232` | `.6607251320316083` | `.6646852498948923` | `1.4049960809220177` | `.19517422836065718` |
| Ember Grid | `.9995767105459568, .3013572617092242, 0` | `.4757753414424941` | `.4905478148343774` | `2.7452866417099218` | `.10155951925016898` |
| Emerald Ring | `.19651749597261697, .914203219207783, .24550611194053884` | `.31594207653292694` | `.3832572948846391` | `1.9938824658616179` | `.11214341939632295` |

These eight recipes retain six-digit hexadecimal color, so their RGB values
are rounded to the nearest 8-bit channel. SB-12 also supports numeric RGB for
[deformation/material recipes](builder-deformation-material-references.md).
A shared group material preserves the
common source color, shine and size-dependent metalness; each object also has
an ordinary material ready if it is moved outside that group. The recipes
preserve the user's scale, speed, camera, skybox, audio mode, and effects when
converting.

The influences read the same engine `size`, smoothed `pointerDown`, and `mouse`
values as the original templates. They do not run those values through a second
music or pointer smoother. Independent per-object music and pointer inputs remain
available alongside these general scene-response inputs. Shape dimensions use
multipliers relative to their visible reference values, so editing Width, Cell
size, Rod thickness, radius, or other ordinary fields still changes the result.

Every expression is saved as ordinary bounded Builder data. There is no hidden
shader or template callback. Existing per-object scale safety remains positive;
only signed dimension results from native scene-size/pointer expressions preserve
the source distance-field behavior, including sub-`0.0001` rods at quiet sizes and
rods that disappear under a press. These values remain finite and bounded.

## Rendering profile and verification

The original shaders use different authored sampling settings:

| Recipe | Original maximum iterations | Original step size |
| --- | --- | --- |
| Steel Lattice | 101 | `.7260629659452175` |
| Verdant Frames | 71 | `.4414923770441956` |
| Alloy Capsule | 56 | `.7` |
| Redline Core | 198 | `.8838993805155669` |
| Violet Matrix | 193 | `.7999169963821687` |
| Mint Halo | 186 | `.8615043142034936` |
| Ember Grid | 56 | `.7549446257595138` |
| Emerald Ring | 151 | `.26597607104610804` |

Each recipe now stores these original sampling settings in its editable rendering
fields. New empty Builder documents still default to 96 iterations and step size
`.7`. Both full and preview hosts retain the existing ceiling of 200 iterations.
The preview remains limited to 640 pixels on its longest edge,
230,400 pixels, and 30 fps. Full playback remains limited to a 1,920-pixel longest
edge, 2,073,600 pixels, device-pixel ratio 1.5, and 60 fps. No ceiling is raised
to hide a difficult lattice ray. Rays that do not converge within their budget
remain misses rather than generating the old false distorted surfaces.

All eight recipes use at most depth 3 and fit the 16-object, 8-group, 64-live-uniform,
192-driver-operation, and 80-modifier-operation limits. Recipe tests check
reference geometry, exact constituent order, group scopes and Y signs, current
document round trips, settings preservation, and compilation through the shipped
engine.

The bounded JSON transport field ceiling is 1,024. Exact native response
expressions make the bare normalized six-object Mint Halo document 725 fields;
materializing all supported camera/effects/motion settings and six music mappings
uses 813. Adding an ordinary Spin influence brings it to 829 fields, 891 JSON
values, 13,174 UTF-8 bytes and scalar depth 12 (container depth 11). This full
example uses 52 live input slots including the two native engine values, 21
drivers and 170 expression operations, within the existing 32-driver and
192-operation limits (20 drivers and 165 operations before that extra Spin). No object, shader-work, pixel,
frame-rate, or raymarch ceiling changed. Tests submit all eight recipes through
actual player and storage validation with these populated settings, an additional
influence, and serialized round trips. The boundary regression accepts the
transport walk at 1,024 fields and rejects 1,025.

Formula regression tests execute the immutable template definitions with recording
geometry functions, then compare each Builder dimension, rotation, material
response and blend at 144 combinations of size, pointer strength and time per
recipe. The cases include quiet `.006`/`.02` sizes and pressed-pointer dimensions.
Both saved and preview shaders compile through the packaged engine at the
existing host ceiling. This proves the formulas and contract bounds; it is not a
claim of pixel-identical GPU output. Six-digit color quantization, floating-point
rounding and ray-march convergence can still produce small visual differences.
Physical-phone performance must be checked separately from desktop/narrow-window
preview checks.

A local browser comparison after restoring the native inputs and authored
rendering profile found Steel Lattice visually matching its original at the
fixed reference. The earlier incomplete Redline/Violet comparison used the old
96-step conversion and does not describe the current source-matched profiles.
That observation does not replace mobile-device performance checks or a
pixel-by-pixel image comparison.

Local visual verification (2026-10-12) compared all seven originals and converted
recipes through the isolated renderer with matched camera, clock, size and scale.
Steel, Redline, Ember and Emerald were checked at size .6 / scale 1 / time 0;
Violet at size .02 / scale 10 / time 12; Mint and Verdant at size .08 / scale 10 /
time 12. Their rendered structures and joins matched visually. This checks desktop
rendering, not physical-phone GPU performance. The temporary comparison harness
can require Retry after background throttling; it is not a deployed app route.

Alloy Capsule now follows these same source formulas, native inputs, group
rotation rules and authored rendering settings; see
[the Alloy reference](builder-alloy-reference.md) for its separate local browser
comparison at three matched input states and the remaining device-test limits.

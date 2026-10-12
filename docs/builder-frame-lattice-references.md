# Editable frames and lattices

SB-11 adds concrete Builder recipes for Steel Lattice, Verdant Frames, Redline
Core, Violet Matrix, Mint Halo, Ember Grid, and Emerald Ring. Each conversion is
an ordinary editable document: individual shapes, three named groups, property
drivers, and current scene settings. There is no embedded template code or
template lookup in the saved Builder document.

The reference is the executable shader in
`src/modules/player/templates/versions/v1/definitions.ts`, at `size = 0.6`, clock
zero, and centered/released pointer. The recipe fixes the constituent dimensions
at that reference and uses scene scale `1`. Copying the template's default mesh
scale `10` would enlarge dimensions already materialized for Builder.

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
These seven recipes use integer values, but the operation supports fractional
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

All seven original shaders use `t = .1*time`, followed by these coordinate
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
`blend = b * (.5 + .5*sin(.1*time*.6))`. This is the original
`b*nsin(t*s)` at the fixed-size reference, represented by an editable Pulse
driver. The join is not mistakenly applied between every constituent.

| Recipe | Original RGB | Metal coefficient (`metal = coefficient*s`) | Shine | Ray coefficient `k` | Blend coefficient `b` |
| --- | --- | --- | --- | --- | --- |
| Steel Lattice | `.43262751221303614, .4925493880484813, .4820048306239232` | `.5870582642599769` | `.6708057727257557` | `1.2506225601940093` | `.22812291319767167` |
| Verdant Frames | `.14998612477802592, .47642472828922455, .0644383761978728` | `.6434036988763767` | `.34486068234140727` | `2.9789122078821793` | `.25980941491680876` |
| Redline Core | `.9514769334666449, .1077350724621205, 0` | `.7125574975041655` | `.5774589834819871` | `2.1969051528600634` | `.22861033952631743` |
| Violet Matrix | `.11460860093209857, .007694076675091144, .4671766017485241` | `.5711799571404537` | `.5590513531439385` | `2.0857194147559914` | `.1017060511129565` |
| Mint Halo | `.4050203196259186, .7752881097617492, .451950921258232` | `.6607251320316083` | `.6646852498948923` | `1.4049960809220177` | `.19517422836065718` |
| Ember Grid | `.9995767105459568, .3013572617092242, 0` | `.4757753414424941` | `.4905478148343774` | `2.7452866417099218` | `.10155951925016898` |
| Emerald Ring | `.19651749597261697, .914203219207783, .24550611194053884` | `.31594207653292694` | `.3832572948846391` | `1.9938824658616179` | `.11214341939632295` |

The current material editor stores six-digit hexadecimal color, so RGB values
are rounded to the nearest 8-bit channel. Each object retains its own material.
The recipes preserve the user's supported scene camera, skybox, audio mode, and
effects settings when converting.

The fixed-size recipe is not a replay of the old engine-controlled `size` input.
Music uses an editable bounded whole-mix scale influence on the shared group.
Pointer movement and pressed rotation remain live, but pointer-down geometry
shrinkage and size-dependent metalness are not pre-authored for every object.
Those per-property responses can be edited using the same supported controls.
This deliberate difference avoids treating one historical audio algorithm as
an invisible recipe dependency.

## Rendering profile and verification

The original shaders use different authored sampling settings:

| Recipe | Original maximum iterations | Original step size |
| --- | --- | --- |
| Steel Lattice | 101 | `.7260629659452175` |
| Verdant Frames | 71 | `.4414923770441956` |
| Redline Core | 198 | `.8838993805155669` |
| Violet Matrix | 193 | `.7999169963821687` |
| Mint Halo | 186 | `.8615043142034936` |
| Ember Grid | 56 | `.7549446257595138` |
| Emerald Ring | 151 | `.26597607104610804` |

Builder retains 96 iterations and step size `.7`. Both full and preview hosts
retain their existing policy ceiling of 200 iterations; Builder's own request
remains 96. The preview remains limited to 640 pixels on its longest edge,
230,400 pixels, and 30 fps. Full playback remains limited to a 1,920-pixel longest
edge, 2,073,600 pixels, device-pixel ratio 1.5, and 60 fps. No ceiling is raised
to hide a difficult lattice ray. Rays that do not converge within their budget
remain misses rather than generating the old false distorted surfaces.

All seven recipes fit the existing 16-object, 8-group, depth-3, 64-live-uniform,
192-driver-operation, and 80-modifier-operation limits. Recipe tests check
reference geometry, exact constituent order, group scopes and Y signs, current
document round trips, settings preservation, and compilation through the shipped
engine.

The bounded JSON transport field ceiling is 768. The previous 512-field ceiling
rejected Mint Halo after ordinary camera, effects, and audio settings were
materialized: its unedited normalized document contains 494 fields, and the
same six-object document with every supported settings section and all six
audio mappings contains 583. An additional default Spin uses 16 more fields,
bringing that example to 599. This measured document-size adjustment does not
change object, driver, shader, pixel, frame-rate, or raymarch budgets. Artist
influence limits and the existing audio formulas stay intact. Tests submit all
seven recipes through actual player and storage validation with these populated
settings, an additional influence, and a serialized round trip; testing only the
compiler would miss this transport rejection.

Local browser comparisons at the fixed reference found visibly less complete
centers in Redline Core and Violet Matrix under Builder's 96-step profile than
their original 198- and 193-step profiles. This difference is stronger than a
minor color or edge change; the recipes retain the source geometry, but the
current profile does not promise the same filled-in appearance for every ray.
No renderer ceiling was raised to conceal that difference. Desktop and narrow
preview checks do not establish physical-phone performance or pixel-identical
animation with the historical changing-size templates.

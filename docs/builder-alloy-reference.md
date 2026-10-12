# Editable Alloy Capsule reference

Alloy Capsule uses the same concrete Builder recipe generator as the seven
frame/lattice references. Its document contains a cylinder, outer sphere and
inner sphere, with no embedded shader, template alias or separate approximation
path. The shared groups own scene response, view-dependent shaping, and the
cylinder/outer-sphere hard union. The inner sphere joins that union using the
animated smooth blend. The shapes are centered constituents, not three
separated display objects.

## Geometry and scene response

The source of truth is Alloy Capsule in
`src/modules/player/templates/versions/v1/definitions.ts`. Let `s` be the engine
size, `p` its smoothed pointer-down strength, and `t = .1*time`:

| Property | Live source formula |
| --- | --- |
| Cylinder radius | `.9446738625954518*s - .0125*p` |
| Cylinder half height | `.9446738625954518*s - .05*p` |
| Outer sphere radius | `.7023682612074287*s - .025*p` |
| Inner sphere radius | `s/3` |
| Material color | `#3d4437`, rounded from the source RGB coefficients |
| Metalness | `.6304962928840792*s` |
| Shininess | `.6210181878056416` |
| Final smooth blend | `.11435451161014794*(.5 + .5*sin(t*s))` |

The visible dimensions use `s = .6` as an editing baseline. Saved ordinary
influences multiply those dimensions by the live source ratios; the baseline is
not a fixed replacement for the changing engine size. Editing a radius or half
height still scales that constituent. The recipe preserves the template's mesh
scale `10`, or the user's customized scale and speed, along with current camera,
skybox, audio mode and effect settings.

Inputs read the same native size, smoothed pointer-down strength and mouse
position as the template. They do not run through another music/pointer smoother.
The shared material responds to size through an ordinary metalness influence.
Each object also retains a material for use outside the shared group. Colors are
rounded to the editor's six-digit hexadecimal format; original RGB values are
`.24020625518667676, .2651915227911193, .21629480224767128`.

## Rotation and composition

The exact source coordinate order is:

```text
rotateY(-mouse.x*2.5*pi + t - p - .1)
rotateX( mouse.y*2.5*pi + t)
rotateX(ray.y*1.9599006869721014 + t)
rotateY(ray.x*1.9599006869721014 + t)
rotateZ(ray.z*1.9599006869721014 + t)
```

**Shared motion** uses the default forward XYZ order; its inverse emits
coordinate Y then X for the two nonzero axes. **View shaping and join** uses
forward ZYX so the coordinate operations run X, Y, Z. Y influence signs account
for the engine's XZ coordinate convention. **Main shapes** hard-unions the
cylinder and outer sphere; only the final inner sphere receives the smooth join.

These are ordinary supported groups, transforms and expressions, using the same
rules as scenes authored from scratch. Their IDs use the shared `recipe-5-*`
pattern. Previously saved current-format Builder documents keep their authored
expressions; generating a new recipe does not rewrite saved scenes.

## Rendering and verification

The current immutable template's rendering repair uses 56 maximum iterations and
step size `.7`; the Builder conversion stores those same settings. The earlier
approximately `.046` step exhausted its samples before reaching the surface and
is no longer the current baseline. Neither conversion nor that repair raises the
existing host ceiling of 200 iterations, preview pixel/frame limits, or Builder
object/driver budgets.

The shared recipe tests compare geometry, rotations, metalness and blending with
recorded execution of the immutable template, including quiet sizes, pressed
pointer states and changing time. They also check packaged-engine compilation,
current-format round trips, settings preservation and editing visible dimensions.
The animation control tests separately confirm that previously saved expressions
remain intact.

Local browser comparison on 2026-10-12 rendered the original and Builder through
the isolated player with identical camera, clock and native input values. The
neutral frame (size `.6`, scale `1`, time `0`), rotated frame (size `.6`, scale `3`,
time `12`) and quiet frame (size `.02`, scale `10`, time `12`) visually matched.
The ordinary Create Scene conversion also rendered successfully. Local visual
evidence is saved in `.local/sb11-alloy-parity.png`; this is a desktop visual
check, not a pixel-diff threshold or physical-phone performance measurement.

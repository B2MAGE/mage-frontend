# Editable Alloy Capsule reference

SB-10 supplies a concrete Builder document for Alloy Capsule. It contains three
editable objects: a cylinder, an outer sphere and an inner sphere. Its three
named groups separate shared motion, view-dependent shaping, and the cylinder /
outer-sphere union. The inner sphere joins that union using the view group's
animated smooth blend. The spheres are centered inside the cylinder in the
reference pose; they are editable constituents, not three separated display
objects.

The fixed geometry reference uses `size = 0.6`, zero pointer input and time zero.
Scene scale is `1`. The original template's mesh scale `10` accompanies its
changing engine-controlled size input, so copying that scale into this document
would enlarge these already materialized dimensions tenfold.

| Property | Current reference |
| --- | --- |
| Cylinder radius and half height | `0.9446738625954518 × 0.6` |
| Outer sphere radius | `0.7023682612074287 × 0.6` |
| Inner sphere radius | `0.6 / 3` |
| Material color | `#3d4437`, rounded from the original RGB coefficients |
| Metalness | `0.6304962928840792 × 0.6` |
| Shininess | `0.6210181878056416` |

The shared group spins and follows pointer input. The view group uses actual
per-pixel view-ray components and its own time influences. Music applies a
bounded shared scale response through the existing mapped analyzer. These inputs
are independently editable in the same controls available to scratch scenes.

Groups use the Builder's existing conventional forward transform convention:
scale, then X/Y/Z rotation, then translation. The compiler applies the inverse
coordinate transforms in the corresponding order. The old template directly
mutates shader coordinates in another rotation order. The Builder recipe keeps
the metallic capsule identity, constituent proportions, shared/local scopes and
view-dependent motion; it does not promise identical historical Euler poses or
frame-by-frame output from the old audio/size algorithm.

The Builder retains its standard 96-step, `0.7` raymarch setup and the existing
runtime profile ceilings. The old template's approximately `0.046` step size is
not copied: with only 56 iterations it can stop before converging to the surface,
so its live output is not a reliable pixel-perfect baseline. View-ray rotations
are fixed for a given pixel's ray; they do not by themselves require reducing
the standard step size. Coordinate-driven deformations still remain subject to
the same renderer ceilings and may require authors to reduce their amounts.

`builderDriverCompiler.test.ts` verifies these numeric references, group order,
trusted packaged-engine compilation, numeric live edits, real ray inputs, and
the existing 64-uniform / 192-driver-operation budgets. Browser review should
check a centered metallic capsule, animated orientation, pointer response, music
response, and editing individual constituents. These checks are intended
appearance checks, not a claim of physical-phone performance testing or pixel
parity with the original template.

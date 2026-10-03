# Render budgets and editor validation (PP-V02)

PP-V01 rejects invalid submissions at the backend. PP-V02 applies the same policy before
frontend rendering and bounds the normal engine rendering path. The backend remains authoritative.
The policy copy is `contracts/scenes/scene-limits.v1.json`; update it together with the backend's
same-named contract and conformance corpus when changing limits.

## Profiles

| Ceiling | Full player | Editor, hover, and platform artwork previews |
| --- | ---: | ---: |
| Physical render pixels | 2,073,600 | 230,400 |
| Longest physical edge | 1,920 | 640 |
| Requested device pixel ratio | 1.5 | 1.5 |
| Scheduled frames per second | 60 | 30 |
| Raymarch iterations | 200 | 200 |
| Optional effects, including bloom | 4 | 4 |

These are maxima, not target frame rates or a performance guarantee. Size fitting preserves aspect
ratio with integer rounding; a square capture is at most 480 × 480. Copy/output passes do not count
toward the optional-effect limit. The 200-step limit preserves the immutable version-1 template
catalog's authored values (up to 198); source without an explicit value now defaults to 200.

`getRenderBudget(profile)` is the public, policy-derived host contract. Scene JSON cannot supply
or raise it. The maintained `@notrac/mage` patch enforces it when creating and resizing the physical
canvas, compositor and effect targets, scheduling frames, and generating the raymarch program.
Host configuration can lower these ceilings. The shared hover coordinator still owns one preview
renderer rather than creating a renderer for every visible card.

Instance and static thumbnail capture use the preview dimensions. Temporary capture changes are
restored afterward; static captures perform at most four settling renders. A capture request cannot
allocate an arbitrary-size offscreen surface. CSS layout and the authored camera aspect remain
independent of physical buffer resolution.

## Validation boundaries

- `validateSceneDocument` accepts a strict template/custom envelope. `validateSceneForPlayback`
  additionally accepts policy-valid legacy raw custom data. Template markers never fall back to raw loading.
- `parseSceneImport` bounds text before parsing, detects duplicate keys, and shares the same validator.
- Validation checks the submitted values before defaults or normalization and never evaluates source.
  It checks UTF-8 byte sizes, bounded structure, required fields, types, ranges, enums, unknown keys,
  effect counts, pass order, and audio mappings. The exact request body is checked before submission.
- Public players validate before renderer creation; the adapter validates again on scene switches and
  validates resolved template data. Callers that use `createMagePlayer` directly supply `initialSceneBlob`.
- Invalid drafts remain editable/exportable. A previously valid editor preview stays on its previous
  settings; an initially invalid draft never creates a renderer. Errors identify the affected fields.
- Controls reflect the policy and prevent enabling a fifth optional effect. Server nested-field errors
  and HTTP 413 responses remain visible, including responses without JSON. Failed saves retain the draft.

Runtime fitting is separate from document validation: it does not rewrite saved settings or make an
invalid scene acceptable to the server. Templates retain their immutable source and version. The
Basic template picker writes only template documents; the custom repair editor keeps custom documents.

## Verification

Automated coverage includes backend conformance fixtures, all 16 resolved templates, malformed imports,
invalid saved data, scene switches, high-DPI and large buffers, small/portrait buffers, frame scheduling,
effect counts, capture size/restoration, and source iteration caps. Tests verify unchanged authored
template iteration settings and rejection before any custom compilation.

For a repeatable browser check, start Vite and open `/scripts/render-budget-check.html`, then select
**Run render checks**. It only runs a fixed platform template; it never loads submitted source or account
data. The page measures actual engine frame events, compiled iterations, canvas sizes, oversized
captures, and a resize to 7680 × 4320. Its displayed JSON is suitable for saving with review evidence.

Measured on 2026-10-03 using Chrome 154 on Windows, with the `reaction-rings-v1` template and
requested DPR 3. Each frame count covers about 1.1 seconds after a 350 ms warm-up. Concurrent
development work and browser scheduling affect rates; these measurements confirm the ceiling,
not a device-performance promise.

| Profile / CSS size | Physical buffer | Observed frames/sec |
| --- | --- | ---: |
| Full / 1920 × 1080 | 1920 × 1080 | 42.7 |
| Full / 3840 × 2160 | 1920 × 1080 | 43.4 |
| Full / 390 × 844 | 585 × 1266 | 43.5 |
| Preview / 1280 × 720 | 640 × 360 | 26.3 |
| Preview / 390 × 844 | 295 × 640 | 25.4 |

All five scenarios passed. The compiled template retained its authored 100 iterations; every
10000 × 10000 capture request returned 480 × 480. Resizing the same engine to 7680 × 4320
retained the 1920 × 1080 full or 640 × 360 preview limit. Portrait cases were desktop simulations,
not physical phone hardware. Browser editor checks also confirmed that FOV 200 produces a
repairable error, FOV 100 clears it, a fifth effect is disabled, and duplicate shader keys remain
in the draft with an actionable message while global playback stays disabled.

## Remaining release boundary

The isolated renderer enforces these ceilings, but they are resource controls rather than a hard
CPU/GPU execution limit. Submitted source can run JavaScript during compilation. The global
custom-rendering release gate stays disabled until the PP-I03 release checklist is satisfied.
No trust is inferred from a custom shader matching a template string. Real phone hardware
performance and unsupported browsers must be measured separately.

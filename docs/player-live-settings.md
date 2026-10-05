# Live scene settings (#236)

Compatible Create/Edit controls update the existing isolated player. They do not
reload its scene, rerun submitted source in the compiler worker, replace its canvas,
or show the loading preview. The editor's current document remains the source for
saving/exporting; playback identity now describes only structural content.

## Audited settings

| Editor setting / persisted field | Update path | Reason / scope |
| --- | --- | --- |
| Scene size (`visualizer.scale`, template scale) | Live | Existing mesh scale; no new geometry/material. |
| Camera position, target, zoom, field of view, tilt | Live | Only changed vector components/projection settings update. An unrelated effect edit preserves viewer dragging and zoom. Wheel zoom keeps its cumulative baseline after an authored camera change. |
| Automatic orbit and speed | Live | Existing controls and animation state. |
| Camera orientation mode/speed | Live storage | Existing intent fields accept updates, but the current engine has no render consumer for these fields; this story does not implement new orientation behavior. |
| Animation speed | Live | Clock reanchors at the current scene time; changing speed does not rescale elapsed history or resume a paused scene. |
| Classic response / motion intent (`minimizing_factor`, `power_factor`, `pointerDownMultiplier`, `base_speed`, `easing_speed`), volume multiplier | Live | Existing intent/state fields; audio source and analysis remain attached. |
| Music response mode and Selective mappings | Existing live response command | Preserve the dedicated bounded command and temporary viewer override. |
| Bloom toggle, strength, radius, threshold | Live | Reuse the allocated bloom pass and render targets. |
| RGB shift, dot screen, technicolor, luminosity, afterimage, Sobel, glitch, colorify/tint, halftone, gamma correction, kaleidoscope, bleach bypass, toon, output-pass toggles | Live | Reuse the existing effect instances; enforce the aggregate four-optional-effects limit before mutation. |
| RGB shift amount/angle, afterimage damp, tint color, kaleidoscope sides/angle | Live | Existing uniforms, with the same scene-policy bounds. |
| Tone mapping mode/exposure | Live | Existing renderer/output pass. Three.js may compile a built-in GPU material variant for a new tone-mapping mode; submitted scene source is not recompiled. |
| Effect pass order | Live | Reorder existing pass references; no new composer or passes. |
| Shader source, template ID/version, template/custom kind | Full scene load | The compiled scene or its source provenance changes. |
| Skybox preset | Full scene load | Replaces asynchronously loaded texture resources. |
| Authored starting time, size/pointer/audio runtime snapshots in `state` | Full scene load | These replace scene starting state rather than an editable live setting. |
| Metadata, thumbnail, local music queue/transport, Simulate beat | Their existing editor/parent APIs | Metadata is not a render setting; local media stays parent-owned. |

New scene-contract fields remain structural until explicitly audited and added to
the live contract. Invalid input is rejected before fields are removed for identity.

## Data flow and limits

1. `scenePlaybackIdentity` validates the whole document and removes only audited
   live leaves plus the separately handled response settings. Template identity
   and resolved source/resources stay in the structural identity.
2. `MagePlayer` calls `updateSceneSettings` only for matching structure. The guarded
   controller validates the full document, checks the existing availability target,
   obtains the current revision's recovery lease, and updates its saved snapshot.
3. The private bridge sends `scene-settings`, a complete normalized data-only
   snapshot (maximum 8 KiB), through its session/generation/request-ID checks.
   At most two queued continuous commands are sent every 34 ms. Fair rotation
   avoids starving camera/effect edits, response edits, resize, zoom, or audio/input.
   The existing 90-command/second ceiling is unchanged.
4. Full snapshots let rapid edits to different controls coalesce without dropping
   an earlier setting. The renderer validates again and diffs against its last
   applied snapshot. Only changed leaves reach `engine.updateSettings`.
5. The frontend-owned engine patch checks the entire delta and merged effect budget
   before mutation. It changes existing objects. A paused scene draws one frame
   without advancing animation or starting audio; a stopped/failed scene remains
   stopped until explicit Resume/Retry.

Load/dispose clears queued settings; old generations cannot change a replacement
scene. Settings arriving during startup apply only to that startup generation.
Capture flushes queued scene and music-response settings before requesting the
image. A capture begun for an older editor revision is discarded.

Live changes preserve the selected track, queue, seek position, volume, playback
intent, response overrides, and unrelated camera motion. Availability polling,
render budgets, custom-source worker compilation, and disable controls retain
their existing boundaries. Structural changes continue through the full guarded
load path. Deploy the matching app and separate renderer builds together.

## Verification

- Engine patch tests run in `npm run test:compiled-output`: strict/atomic deltas,
  aggregate effects, reused pass/object references, rapid changes, paused refresh,
  and the existing compiled-output regressions.
- Player tests cover structural identity, strict snapshots, live controller
  updates, recovery revisions, audio continuity, message coalescing/generations,
  capture ordering, pause, continuous animation time, and cumulative camera zoom.
- React tests cover Create/Edit controls and `MagePlayer` behavior, with transport
  or engine mocked at the test boundary. They do not prove actual WebGL behavior.
- Local browser review uses ordinary Create/Edit pages and the normal separate
  renderer. No public diagnostic route is added or restored.

Local review on October 5, 2026 used the in-app browser at port 5178 with the
rebuilt normal renderer on port 5181. Create: FOV changes, bloom on/off and rapid
strength edits kept the preview visible; a generated three-minute test beat
continued playing, then remained at 42.31 seconds while paused camera/effect edits
redrew the scene. Capture produced a thumbnail of the edited frame. Edit of local
scene 24: FOV and RGB shift updates rendered without a loading state or console
errors. Changes to that saved scene were not submitted. This is local evidence,
not a production deployment or a new cross-browser release certification.

Final local regression run: 146 frontend suites / 2,009 tests passed. The pretest
engine, isolation, retired-route and worker checks passed, as did lint, app and
renderer builds, renderer hosting checks, and the retained check-page builds.

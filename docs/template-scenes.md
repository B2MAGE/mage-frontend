# Template scene foundation (PP-B01)

The shared player accepts schema version 1 scene documents. Every existing preset has an
immutable template version 1: Prism Core, Steel Lattice, Aqua Static, Verdant Frames,
Crimson Reactor, Alloy Capsule, Redline Core, Violet Matrix, Mint Halo, Ember Grid,
Emerald Ring, Spectrum Relay, Chroma Storm, Rose Circuit, Ripple Rings, and Tidal Lantern.

```json
{
  "schemaVersion": 1,
  "kind": "template",
  "templateId": "reaction-lantern-v1",
  "templateVersion": 1,
  "parameters": { "scale": 10, "speed": 1 },
  "settings": { "bloom": { "enabled": true, "strength": 1.2 } }
}
```

The numeric template version is authoritative even where an older preset's stable ID happens
to contain `-v1`. Unsupported IDs or versions fail; they never select the latest available source.

## Contract and playback

[`contracts/scenes/README.md`](../contracts/scenes/README.md) documents allowed values, defaults,
the JSON Schema, fixtures, and Java backend handoff. Tests run those same fixtures against
both the frontend parser and an independent JSON Schema validator. PP-V01/PP-B02 enforce
the same contract on the backend; PP-V02 applies its resource limits before playback and save.

`parseSceneDocument` validates and copies data; `listSceneTemplates` returns code-free metadata.
The shared player resolves a template ID/version to bundled source only after validation.
It constructs every engine branch from fixed version 1 defaults and individual validated values.
Settings are data assignments, never source substitution. Built-in skybox IDs are the only
asset selection in this contract. Scene audio is attached through the player's existing audio
controls, rather than a URL in a template document.

Unknown fields at every template level, source/code, expression strings, arbitrary URLs,
prototype-related keys, non-finite numbers, and unknown versions fail before `loadPreset`.
An invalid submission cannot unload audio or replace the previously loaded scene.
The complete document is validated before comparing response-only edits. Valid template music
mode and mapping changes update the existing renderer without restarting its audio; forbidden
added fields cannot disappear from that comparison. Registry entries and metadata are frozen, source fingerprints are pinned,
and the resolver creates fresh nested engine data for each load.

## Compatibility and remaining stories

Old source-bearing documents and explicit `kind: "custom"` documents remain custom/untrusted.
A preset name or an exact source match does not establish trust. Custom playback stays disabled
until the isolated renderer and release checks are complete.

## Template editing (PP-B03)

Create Scene starts with the Prism Core template. The existing Scene section now selects from
all 16 immutable templates. Basic exposes the same scene, camera, motion, music-response,
effects, and Pass Order controls as the existing editor. Only shader source selection/editing
is replaced by the template library. Applying settings does not change a template into a custom
scene. Existing section, dropdown, and effect-toggle styling is reused.

The additive version-one settings extension stores camera position/target, camera orientation,
motion, initial state, audio-response mappings, effect parameters, and effect order as bounded
data. Existing field defaults and all catalog source snapshots remain unchanged; omitted new
settings retain the old appearance. The four-optional-effect budget still includes bloom and
tint, and imported settings cannot supply source or arbitrary renderer fields.

The template document is the editing, preview, save, and export authority. The editor derives a
display model without resolving shader source; only the player resolves validated catalog IDs.
Choosing a different template preserves supported settings. A successful create/update followed
by reopening retains kind, schema version, template version, ID, and parameters. Server field
errors identify the relevant control and preserve the draft.

Existing custom scenes open for repair, with their source and settings intact. They never mount
an in-page editor renderer. Advanced authoring remains explicitly unavailable until PP-I03; there
is no fallback when isolation is absent. Custom source matching a preset remains custom. A switch
from custom content to a template, including a template pasted into JSON, requires confirmation;
Cancel keeps the custom content. Unsupported versions remain owner-exportable without execution.

Imports are validated before preview. Invalid JSON stays intact and cannot silently replace the
last valid document. Template preview uses the smaller PP-V02 profile and works while the custom
switch is off. Saved templates still require fresh per-scene permission; an operator disable,
unverified status, or local recovery block takes precedence. A replacement template on an existing
custom scene may need saving before that saved ID becomes eligible for preview. Existing thumbnails
are retained on updates unless deliberately replaced.

Use the coordinated PP-B03 template-settings backend and the existing database. Deploy its
expanded validation contract before the editor that writes the new settings; old backend
versions reject those fields. There is no database migration, reseeding, new template database,
or change to the custom-rendering release switch. Older frontends must refresh to edit templates
using the expanded settings.

The local October 3, 2026 browser check created a Ripple Rings template, reopened it, changed its
field of view, saved it again, and verified the value on a second reopen. Desktop, a 390px mobile
viewport, and both supported themes were checked. Custom JSON imported without mounting a canvas;
Cancel restored its source after both selector and raw-template replacement prompts.

Saved-player audio selection remains attached to the viewing session. Returning from a file picker
suspends the existing renderer during its fresh permission check, then resumes the same scene and
track position on approval. A denied or failed check still disposes it. The real-engine continuity
fixture passed both in-place resumption and confirmed-denial context disposal; see
[`scene-availability.md`](scene-availability.md) for the diagnostic page and permission rules.
The extended Basic-controls browser check saved and reopened bass-hit mappings, RGB Shift,
Afterimage, camera position/orientation and a reordered pass stack as a source-free template.
Changing Amount and Hit sensitivity kept audio advancing (70.77s to 71.02s), and Reset restored
the saved music settings without rewinding. The build retains the existing upstream engine
`eval` and large-bundle warnings.

Changes to a released template's source or engine defaults require a new template version.
Keep the old snapshot and catalog entry so saved scenes resolve consistently. Updating the
existing shader catalog must never silently replace a published template snapshot.

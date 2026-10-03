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
both the frontend parser and an independent JSON Schema validator. The backend will adopt
them in PP-V01/PP-B02; this frontend story does not change the Java service.

`parseSceneDocument` validates and copies data; `listSceneTemplates` returns code-free metadata.
The shared player resolves a template ID/version to bundled source only after validation.
It constructs every engine branch from fixed version 1 defaults and individual validated values.
Settings are data assignments, never source substitution. Built-in skybox IDs are the only
asset selection in this contract. Scene audio is attached through the player's existing audio
controls, rather than a URL in a template document.

Unknown fields at every template level, source/code, expression strings, arbitrary URLs,
prototype-related keys, non-finite numbers, and unknown versions fail before `loadPreset`.
An invalid submission cannot unload audio or replace the previously loaded scene.
Versioned documents also bypass the legacy audio-only update optimization so it cannot hide
forbidden added fields. Registry entries and metadata are frozen, source fingerprints are pinned,
and the resolver creates fresh nested engine data for each load.

## Compatibility and remaining stories

Old source-bearing documents and explicit `kind: "custom"` documents remain custom/untrusted.
A preset name or an exact source match does not establish trust. Existing custom playback is
preserved here; renderer isolation, API enforcement, and resource budgets are separate PP stories.

The Create Scene page still uses the existing Shader picker and legacy editing model.
PP-B03 will connect template selection to the editor, replace that picker for basic creation,
and ensure supported edits remain data-only. Editing shader source will switch to custom
authoring; it will not modify or masquerade as a platform template.

Changes to a released template's source or engine defaults require a new template version.
Keep the old snapshot and catalog entry so saved scenes resolve consistently. Updating the
existing shader catalog must never silently replace a published template snapshot.

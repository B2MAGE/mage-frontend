# Audio response configuration

The audio-response work extends the existing `@notrac/mage` 1.0.3 package through `patch-package`. The renderer and dependency version stay in place. The lightweight `@notrac/mage/audio-response` entry point has no browser, audio-context, or renderer dependencies and provides the shared configuration contract.

Scenes explicitly opt into `mapped-v1`. Missing and unsupported modes normalize to `legacy`; `legacy` and `transient-v1` retain their existing behavior. Merely supplying a configuration does not opt an older scene into the new mode. Loading another scene must replace its mode and normalized configuration, including when the next scene has neither setting.

```json
{
  "version": 1,
  "sensitivity": 1,
  "mappings": [
    { "target": "size", "source": "bass-hit", "amount": 1, "attack": 0.04, "release": 0.35 }
  ]
}
```

Sources are `bass-level`, `mid-level`, `treble-level`, `overall-level`, `bass-hit`, `mid-hit`, `treble-hit`, and `overall-hit`. Targets are `size`, `bass`, `mid`, `treble`, `audioLevel`, and `audioHit`; actual scene support must be checked separately. Levels describe sustained energy and hits describe discrete attacks. Frequency bands do not identify or isolate musical instruments.

`createDefaultAudioResponseConfig()` returns a fresh version 1 object, with sensitivity 1 and six mappings: `size → overall-hit`, `bass → bass-level`, `mid → mid-level`, `treble → treble-level`, `audioLevel → overall-level`, and `audioHit → overall-hit`. Every default mapping uses amount 1, attack 0.04 seconds, and release 0.35 seconds.

`normalizeAudioResponseConfig(value)` returns `{ config, warnings }`. Absent or null configurations use defaults without warnings. Unsupported versions or malformed top-level configurations use full defaults with a warning. Omitted mappings use defaults; an explicit empty array disables every mapping. An invalid non-array mapping value restores defaults with a warning. Unsupported targets or sources are dropped. The last valid mapping for each target wins, so there are at most six output mappings. Only the first 128 input mappings are processed to bound work on untrusted saved data.

Sensitivity is clamped to 0.1–4. Mapping amount is clamped to 0–4, attack to 0–2 seconds, and release to 0–5 seconds. Non-finite values, strings, and other non-numbers use defaults; omitted numeric values also use defaults. Invalid or clamped supplied values produce warnings. Normalization returns fresh data and never mutates or retains mapping objects from the caller.

Sensitivity controls detection responsiveness; amount controls movement strength. Attack and release control how quickly the mapped movement rises and returns. These settings must not change audible playback volume.

Engine changes belong in `patches/@notrac+mage+1.0.3.patch`, including these lightweight entry points and package exports. A clean install must apply the patch before testing or building. The configuration contract is exercised by `src/modules/player/infrastructure/audioResponseConfig.test.ts` against the installed patched package.

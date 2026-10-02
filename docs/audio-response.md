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

## Analysis timing and lifecycle

Mapped response uses a dedicated `AudioWorklet` side branch. It reads PCM samples on the audio rendering thread, independent of animation frames and display refresh rate. The initial analysis kernel emits one measurement per 10 ms of audio (441 samples at 44.1 kHz or 480 samples at 48 kHz). A measurement arrives after its first complete hop, plus the browser's audio block/message delivery latency. This is not a guarantee of 10 ms total audible-to-visible latency: device output latency and the next animation frame also contribute.

The worklet's output is silence. It connects to the destination solely to keep the analysis graph active; the existing audible playback path, gain, and volume remain intact. Stereo energy is measured independently in each channel before averaging power, so opposite-polarity channels do not cancel analysis. The pure kernel is shared with tests and embedded into the actual worklet module.

`AudioAnalysisSession.connect(source)` accepts a Three.js audio source with `context` and `getOutput()`. It returns a promise indicating successful connection. `drain(context.currentTime)` returns newly available timestamped measurements exactly once; `snapshot(context.currentTime)` retains the most recent fresh measurement for diagnostics. Returned measurements are independent copies. The queue is capped at 512 frames, and measurements more than one second old are discarded to prevent a burst after a long frame stall.

Pause, seek, track changes, scene changes, and disposal must reset or disconnect the session. `reset()` keeps an established connection while starting a new analysis epoch and clearing measurements. Epoch and connection-generation checks reject late messages or asynchronous module loads from prior playback. `disconnect()` removes only the analysis side branch. `dispose()` also prevents future connections. Temporary worklet module URLs are revoked on both success and failure; a loaded module is shared by sessions in the same audio context.

Unsupported AudioWorklet environments report `unsupported`; module or processor failures report `error` with a message. Mapped analysis does not silently fall back to frame-dependent polling. The existing legacy and transient modes remain available. AR02 initially supplies overall RMS level and timestamped frames; independent frequency levels and hit detection are introduced in AR03.

## Independent frequency levels and hits

AR03 uses a 2048-sample Hann-window FFT, updated on the same 10 ms audio hop. Frequency boundaries use the actual context sample rate: bass is 40–180 Hz, mids 180–2000 Hz, and treble 2000–8000 Hz (limited naturally by Nyquist). Each channel is transformed independently and its power is averaged, preserving opposite-polarity stereo energy. Band levels are calibrated RMS values bounded to 0–1, rather than separately normalizing every band to maximum strength. Band RMS below 0.0003 is zeroed so very faint noise is not amplified. Overall level remains the full-band 10 ms RMS measurement.

Frequency measurements require a complete FFT window, about 46.4 ms at 44.1 kHz or 42.7 ms at 48 kHz. The first full window primes detection without generating hits for a sound already playing. Each band then compares its positive energy change against its previous level and an adaptive local baseline. Its 100 ms cooldown is independent: a treble tick cannot suppress a bass hit. A held tone can retain a nonzero level without repeatedly firing hits. An `overall` hit takes the strongest band hit in that measurement, with no additional shared cooldown. Hits contain `{ band, time, strength }`; their time uses the audio-context clock at the end of the measurement window.

`setSensitivity(value)` on the kernel or session changes detection thresholds only; it never changes measured levels, playback volume, or mapped movement amount. Values are clamped to 0.1–4 and invalid values restore 1. Live changes re-prime detection, and session changes advance the message epoch to discard pending detections made with older settings. The audio node and existing audible connections remain active. Frequency bands indicate parts of the spectrum, not separated instruments, and FFT windowing can spread an abrupt attack across neighboring bands.

## Mapping and preview timing

The independent `@notrac/mage/audio-mapping` module exports `AudioResponseMapper` and `SyntheticAudioFrames`. A mapper accepts the normalized configuration contract, consumes timestamped `AudioAnalysisFrame` objects with `process(frames, now)`, and returns all six target values. Unmapped targets return zero. Values are bounded to 0–4 after applying amount; any scene-specific size baseline is added by the engine, outside this mapper. Sensitivity belongs to detection and does not scale mapper output.

Level mappings use exponential attack/release envelopes, with the configured duration as the time constant. Every accepted analysis frame advances the stored envelope in chronological order. Rendering between measurements projects from that stored state without modifying it, so additional rendering calls do not change the next sampled envelope. Duplicate, future, or more-than-one-second-old measurements are ignored. A clock rewind, a gap of more than one second between processing calls, or stale analysis clears the state and pending events. A restarted analysis sequence at a newer timestamp also starts a fresh mapping epoch, covering analysis resets caused by a PCM discontinuity.

Each hit starts its own pulse: a linear rise to its measured strength over the configured attack, followed by exponential release. Zero attack starts at full strength; zero release holds the peak for one 10 ms analysis hop and then ends. Overlapping pulses use the strongest current value for the mapped target, while remaining distinct timestamped events. This bounds movement without merging the event history. A zero-duration pulse may fall between display refreshes; event consumers can still observe its timestamp and choose an appropriate visible lifetime.

`getSnapshot()` returns copies of `{ outputs, events, lastTime }`. `getEvents(afterId)` returns retained events after a consumer-owned ID cursor without consuming them. Each event has `{ id, time, band, strength }`, allowing separate scene effects to assign different lifetimes. IDs remain increasing across resets. History is capped at 512 events and kept for at least two seconds, or the longest configured attack plus eight release time constants when that is longer. Changing configuration resets the mapped response and returns normalized configuration plus warnings.

`SyntheticAudioFrames(seed, tempoScale)` emits the same 10 ms frame shape used by actual analysis. Call `configure(seed, tempoScale, now)` only when preview settings change, then `process(now)` on each rendering tick. Seed and tempo determine reproducible, distinct band patterns. `reset(now)` starts a new timeline; omitting `now` primes the timeline on the next call. Catch-up is limited to one second, and longer suspensions clear the timeline instead of releasing a queue of old beats. These frames pass through the same mapper as real measurements, so preview exercises the actual routing and envelopes.

The engine routes each declared shader input independently. `size` keeps a 0.006 baseline; `bass`, `mid`, `treble`, `audioLevel`, and `audioHit` receive their own mapped values. A bass-only shader works, as does a shader combining `size` with other inputs. `getAudioResponseCapabilities()` compares requested mappings with the compiled shader's actual uniforms and reports unsupported targets. Configuration, capabilities, outputs, events, and analysis status are available without starting a second analysis loop.

Shaders may also declare `audioTime`, `bassHitTime`, `midHitTime`, `trebleHitTime`, `audioHitTime`, and the corresponding `HitStrength` inputs. Times share the `audioTime` clock; a hit time of -1 means no retained hit. These describe the latest event per band. Scenes needing multiple simultaneous event lifetimes can consume the bounded `getAudioResponseEvents(afterId)` history. Actual playing audio takes priority over the silent preview; both use the same mapping and envelope path.

For a native browser check, open `/scripts/audio-response-browser-check.html` on the development server. Its generated tones remain silent, and its rendering check verifies real WebGL uniform delivery for bass-only and mixed-input shaders. The optional `?minified=1` check expects a separately bundled ESM copy of the analysis module at `.local/audio-analysis-built.js`.

## Platform settings and persistence

An authored scene stores the mode and configuration in its existing JSON document:

```json
{
  "audioResponse": "mapped-v1",
  "audioResponseConfig": {
    "version": 1,
    "sensitivity": 1,
    "mappings": [
      { "target": "size", "source": "bass-hit", "amount": 1, "attack": 0.04, "release": 0.35 }
    ]
  }
}
```

The editor normalizes explicitly supplied configuration and preserves it through shader selection, structured edits, JSON import/export, and create/update request payloads. Explicit configuration also survives while legacy or transient mode is selected. Older documents do not acquire mode or configuration fields merely by opening or editing them. Deleting the configuration in raw JSON removes its saved metadata; mapped mode then uses defaults. Backend scene data remains an ordinary JSON document.

Feature code uses the public `@modules/player` boundary. The controller exposes:

- `getAudioResponseState()` returns independent copies of `{ savedMode, savedConfig, override, effectiveMode, effectiveConfig }`. An absent saved configuration is `null`; effective configuration is `null` outside mapped mode.
- `setAudioResponseSettings(mode, config?)` replaces the authored settings in the adapter's scene snapshot. Omitted configuration removes explicit metadata; an undefined mode removes its metadata. Callers retaining inactive mappings must pass that configuration when changing modes. This updates the current preview; durable saving still uses the editor's scene data and existing API request.
- `setAudioResponseOverride(config)` applies a temporary viewer configuration in mapped mode. Passing `null` restores the authored mode and configuration. Overrides never enter the scene JSON. Updating authored settings while an override is active updates only the stored defaults until the override is cleared.
- `getAudioResponseCapabilities()`, `getAudioResponseDiagnostics()`, and `getAudioResponseEvents(afterId?)` forward defensive snapshots. Older engine bridges without these APIs return `null`, `null`, and `[]` respectively. Reading events does not consume another caller's cursor.

Live configuration changes keep the player, song, playback position, playback volume, and pause state. The adapter does not re-select an unchanged mode, since that would tear down the analysis session. Reapplying identical settings is a no-op. Resetting playback retains the current authored defaults and temporary override; loading a different scene clears the override. Pending audio-load completion is invalidated when a newer load, scene change, audio clear, or disposal supersedes it.

`MagePlayer` accepts an optional `sceneKey`. Route surfaces pass their scene ID, and the editor uses a stable edit/create identity. An identity change reloads even two identical scene documents. With the same identity, a new document whose only changes are `audioResponse` and `audioResponseConfig` updates live. Structural comparison ignores JSON object-key order. The component and both playlist owners preserve device tracks and their object URLs during these edits. Without an explicit key, identical content is treated as the same scene; callers switching between distinct identical scenes must provide a key.

Regression coverage includes adapter behavior and asynchronous audio races, live component changes with loaded and pending songs, scene-key transitions, route-owned playlists, and mocked HTTP create/update/reopen contract tests. The HTTP tests exercise frontend payload and response normalization; they do not claim a live backend roundtrip. `/scripts/audio-response-player-check.html` provides the real-browser adapter check against the installed engine.

AR05 verification also exercised the local backend with a temporary scene: create, read, update, and read preserved the exact mapped configuration and unrelated nested fields. Deleting that scene returned success, the next read returned not found, and the original scene inventory was restored. This complements the mocked editor workflow tests with a real API persistence check.

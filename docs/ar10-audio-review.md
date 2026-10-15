# AR-10 music response verification

Issue: [#187](https://github.com/B2MAGE/mage-frontend/issues/187).
Local review branch: `codex/ar10-audio-verification`, based on `d0b962d`.
Engine: maintained B2MAGE `1.0.4-mage.3`; no engine package change.
Original (`legacy`) and Selective (`mapped-v1`) remain supported. Independent
Builder bindings use the shared analyzer in either scene-wide mode.

## Fix found during verification

Seeking or replacing a playing track already reset parent audio analysis and
Builder bindings, but the scene-wide Selective mapper did not receive that
discontinuity. Its old hit envelope could continue into a silent new position.
A regression using the installed engine receiver/mapper reproduced a response
of 0.601 instead of zero. The renderer now honors the existing audio epoch before
accepting the new sample. New hits still apply immediately, with unchanged
settings, audio playback, and scene identity.

A quick pause/resume can replace the paused sample before the next bridge send.
Pause now increments that same epoch so the reset cannot be lost when updates
are combined. This does not change Original's gain, peak curve, smoothing,
baseline, Selective mappings, image quality, or existing rendering limits.

## Reproducible checks

`npm test` includes the transport regressions, native analysis/mapping checks,
PCM-to-Builder uniform checks, and the recording-tool tests. The new Builder
check round-trips current JSON and passes real PCM through the installed analyzer,
trusted Builder compiler, and renderer binding controller. Bass/mid/treble tones
move only the intended objects at both 44.1/48 kHz and with both audio modes.

For a local recording, install ffmpeg on PATH and run:

```sh
node scripts/check-audio-recording.mjs "<local-audio-file>" --start 30 --seconds 20
```

The optional tool decodes locally and prints signal/event metrics. It does not
save or upload music and is not part of the application bundle. Its generated
PCM regressions need no ffmpeg or external audio. It compares Selective outputs
at 15/30/60/120 FPS, irregular consumption, and a 400 ms visual stall; analysis
continues on the audio timeline. It does not require Original's intentionally
different amplitude response to equal Selective or measure subjective quality.

The existing [local diagnostics workflow](test-tools-cleanup.md) exposes
`/scripts/audio-response-browser-check.html`. Choose **Run audio check** to verify
the actual browser AudioWorklet at 44.1/48 kHz, four consumer rates, an idle visual
consumer, three band tones, silence, and disposal. It collects a bounded window
of actual audio samples rather than treating worklet startup delay as a missing
measurement. Wall-clock duration is printed separately; startup is not hidden.

## Local evidence — October 15, 2026

- A separate clean checkout installed the lockfile with `npm ci` and passed
  lint, all 3,111 application tests, 70 Node tooling tests and 89 diagnostic
  tooling tests. The app, local renderer and production-configured renderer
  builds passed. The production artifact was built only, not deployed.
- Installed engine analysis and modes: 69 focused checks passed. Five new
  recording-tool checks and four PCM-to-Builder checks passed.
- Transport/renderer/editor lifecycle: 182 focused checks passed, including the
  reproduced stale-envelope defect, quick pause/resume, numeric editing,
  structural replacement, cancellation, and preserved Original behavior.
- Backend: 78 focused tests passed against disposable PostgreSQL databases,
  including independent bindings in both modes through real create/update/read,
  all 14 recipes, private templates, revision conflicts and atomic scene/tag
  rollback. Four committed-demo checks also passed. No backend changes needed.
- Native browser AudioWorklet: both sample rates passed all four consumer
  cadences, idle-consumer retention, band routing, silence, and disconnect checks.
- The editor and full player played the same local recording. Changing between
  Original and Selective while paused retained 76.86 s; editing Selective's
  amount and resuming advanced from that position. At a 390 × 844 viewport,
  seeking to the beginning and pausing/resuming retained a working preview,
  without a retry overlay or captured console errors. The viewport override
  was removed afterward, and the existing browser draft was left untouched.
- Actual music: two local 20-second excerpts (0–20 and 30–50 seconds) of the
  previously used `34910776-for-her-chill-upbeat-summel-travel-vlog-and-ig-music-royalty-free-use-202298.mp3`
  passed at both sample rates. Each excerpt yielded 2,000 measurements per rate.
  Every tested consumption schedule retained identical Selective checkpoints
  and hit timestamps within that sample rate.
- The intro is mid-dominant (mean mid 0.068, bass 0.008–0.009, whole mix 0.070).
  In the stronger excerpt mean bass is 0.143–0.149, mid 0.092–0.094, treble
  0.043, whole mix 0.219. Whole mix and bass are distinct signals. Frequency
  bands describe energy, not isolated instruments; differing response strengths
  are expected and can be tuned independently.

## Representative examples

| Example | Expected result | Review |
| --- | --- | --- |
| Prism Core / Original | Existing peak/size behavior, including authored resting response. | Motion → Original; use Simulate beat and the same local song. |
| Prism Core / Selective | Size follows the selected band and level/hit mapping; changing settings keeps the track position. | Motion → Selective; compare Bass/Highs/Whole Mix, then pause, tune, and resume. |
| Signal Duet | Gold sphere stretches on bass hits; cyan torus rises on treble hits from the same track. | Existing local scene `/scenes/15`; committed fixture and authoring steps in backend `scripts/demo/README.md`. |

Signal Duet's sphere uses scale Y, amount 1.5, attack 0.01 s, release 0.18 s.
Its torus uses position Y, amount 1.1, attack 0.01 s, release 0.12 s. Scene-wide
Selective mappings are empty so the two authored object responses remain clear.
This reuses the existing demo rather than adding duplicate scenes or templates.

Preview is capped at 30 FPS / 640 longest edge / 230,400 pixels; full playback at
60 FPS / 1,920 longest edge / 2,073,600 pixels. Both retain the 1.5 DPR ceiling.
These are maxima, not guaranteed rates. A slower display can miss a brief visual
peak even when audio event timestamps and analysis are correct. This work does
not silently lower those limits or change the scene's requested appearance.

## Review and delivery boundaries

The normal local app is `http://127.0.0.1:5178`, matching isolated renderer on
5181 and backend on 8080. Existing local data is preserved. Docker's stale
runtime socket directory was quarantined before normal startup; no database or
object-storage reset was performed.

The normal local server is running rather than the opt-in diagnostics server;
manual-check routes return 410. The renderer's headers, integrity and route
restrictions passed verification, and backend `/ready` reports application and
database UP. Local renderer asset: `renderer-6gzCQKGC.js`. The separately built
production asset is `renderer-BCdl3gmj.js` and has not been published.

Physical Pixel Chrome, real device audio latency, app-switching and throttled
network evidence still require a device review. A narrow desktop viewport does
not establish those results. Keep #187 open for user verification and record
merge/deployment separately; this branch is not a production release.

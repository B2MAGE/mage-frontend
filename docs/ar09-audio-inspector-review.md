# AR-09 audio inspector — local review

Issue: [frontend #186](https://github.com/B2MAGE/mage-frontend/issues/186).
Frontend branch: `codex/ar09-audio-inspector`.
Engine branch: `codex/ar09-inspector-spectrum` in the B2MAGE fork.

## Try it

1. Open `http://127.0.0.1:5178/create-scene` and select **Audio** in the
   **Live Preview** header. The inspector starts closed and occupies no layout
   space. Desktop places it below the player, filling the remaining preview
   sidebar. At 960px and below it covers the editor below the player. Neither
   layout darkens the page or covers the playback controls.
2. Add a song in Live Preview. The spectrum shows 36 real frequency slices
   from approximately 40 Hz to 8 kHz. Bass, Mid, Treble and Whole mix meters
   retain the existing analysis values. Bars use a fixed −60 to 0 dB display
   scale relative to the analyser's normalized maximum, not per-frame boosting.
3. Choose **Whole scene** or a Builder object. The scene overview traces
   Selective's configured source to its measured target. Original's size
   response is identified separately from the modern Bass-level meter.
4. Object cards show **Music & pointer** input and the measured value passed
   into the shader before Animation. Animation cards list actual affected
   properties and inputs, including parent groups. They say **Configured
   Animation**, without inventing a final value for combined/surface expressions.
   Available input values appear in cards and **Signal details**. Native scene
   pointer and surface inputs are listed descriptively when not measured.
5. Try **Motion → Simulate beat**. Playing music takes priority. Without a
   playing track the inspector labels the source **Simulated beat**, displays
   its existing level/hit diagnostics, and explicitly has no frequency spectrum.
6. Pause/resume, switch Original/Selective, change objects, resize the window,
   and close/reopen. Escape or Close returns focus to Audio. The inspector is
   nonmodal in both layouts, so playback controls remain available. The covered
   mobile editor is temporarily inactive while the inspector is open.
   Hiding Live Preview closes the inspector and stops inspection.

The inspector contains no scene configuration controls. Its open/selection state
is not saved with scenes or personal templates. Audio stays in browser memory.

## Runtime boundaries

- Reuses the engine's existing 2,048-point FFT, with no second analyser.
  Frequency slices are approximately logarithmic, each containing at least one
  distinct FFT bin. There is no fabricated extra low-frequency resolution.
- Spectrum aggregation/worklet transmission is opt-in and capped at 10 Hz.
  It stops when the inspector is closed, page/preview hidden, real audio stopped,
  scene unavailable, or AudioContext suspended. Reset/reconnect clears readings.
- The UI requests diagnostics at most four times per second, one outstanding
  request at a time. Only inspector contents subscribe to the snapshot store;
  audio measurements are not editor draft state.
- Spectrum stays in the parent page and is appended after the existing bounded
  renderer reply. No spectrum arrays cross the isolated renderer bridge.
- Reads never consume response frames or advance response mapping. Late replies
  after replacement/close are ignored. Missing diagnostics do not pause playback.
- Original's existing 64-point analyser/bin-2 path, Selective mappings, and
  saved scene formats remain unchanged.
- Spectrum and horizontal fills use 150ms CSS transform transitions. This is
  display interpolation only: native meter values, numeric readings and audio
  processing are unchanged. Fixed-size spectrum elements scale down to zero
  instead of animating layout height. Reduced-motion preferences disable both
  transitions.

## Reproduce the release build

The frontend pins the immutable B2MAGE engine release `v1.0.4-mage.4`, including
the shared-analysis spectrum API. A clean install needs no local tarball override:

```powershell
# In the frontend checkout
npm ci
npm run renderer:build
npm run dev -- --host 127.0.0.1 --port 5178 --strictPort --force
```

Start the existing isolated renderer service on 5181 if it is not running.
Production uses renderer-first deployment and frontend-first rollback. Retain
the current and previous packages and exact hosting policies on the deployment
computer; CloudShell uses temporary staging. Deployment identifiers and final
live verification are recorded on [AR-09 #186](https://github.com/B2MAGE/mage-frontend/issues/186).

## Earlier verification baseline, 2026-10-16

These checks passed before the latest below-player placement change. They are a
baseline for the audio implementation, not confirmation of the current layout.

- Engine build and all 25 tests passed, including source/package sine-tone
  localization, silence/stereo, identical response outputs and FFT counts with
  inspection on/off, worklet transmission gating, and session lifecycle cases.
- Frontend build, TypeScript, lint, renderer build and renderer isolation/header
  verification passed. Tooling: 70 Node tests and 89 Vitest tests passed.
- Complete frontend unit suite: **224 files / 3,152 tests passed**.
- Focused tests cover response provenance, simulated/real presentation,
  unchanged authored scenes, unsubscription, and 142
  player/audio cases including externally suspended AudioContexts.
- Browser checks: real MP3, Original/Selective, music priority, simulated beats
  with no spectrum, pause/resume/end, object selection and inherited groups,
  desktop/mobile open/closed and the 960/961px transition. No page
  overflow at 320 or 390px. These are desktop viewport checks, not physical
  Android-device testing.
- Preview rectangles were identical before/after opening and closing at both
  desktop and mobile sizes. Playback continued and the scene kept rendering.
  Hiding preview removed the inspector completely. Escape handling worked.
  No new browser errors were observed.

## Below-player layout verification

- All 28 focused editor, drawer and inspector tests passed. They cover nonmodal
  operation in both hosts, mobile editor inactivity, available playback controls,
  close/Escape focus restoration, closed-content cleanup, and preserved
  readings/object selection when the responsive host changes.
- TypeScript, production build and lint on the changed components/tests passed.
- Browser checks at 390×844, 1280×720 and 1440×1000 confirmed that the inspector
  starts directly below the player. Desktop fills the remaining sidebar height
  and width; mobile exactly covers the editor workspace. Neither uses a modal
  backdrop. Mobile player bounds were identical when open and closed.
- Adding real audio and pausing/resuming worked while the mobile inspector was
  open. The spectrum continued updating and the scene kept rendering. Closing
  restored editor interaction. The 960/961px transition moved the single open
  inspector to the correct host without horizontal page overflow.
- Current screenshots: `desktop-below-player.png` and `mobile-below-player.png`
  in the evidence directory below. Earlier expanded-sheet screenshots are
  superseded. These are browser viewport checks, not physical-device testing.
- Bar-animation follow-up: all 12 inspector tests, scoped lint and TypeScript
  checks passed. Live audio confirmed intermediate visual fill positions while
  native meters retain the latest raw readings. No spectrum trails appeared in
  the observed rising/falling samples; intermittent artifacts are not guaranteed
  reproducible. `mobile-smooth-meters.png` records the updated rendering.
- Release review also checked Classic Blue with real audio at 390×844 and the
  desktop host. The inspector remained readable, nonmodal and within the page
  width. MAGE Pulse was restored after the check.

Evidence: `../.local/ar09-inspector-redesign/` (not committed). Frontend and
renderer serve the rebuilt local files. The backend/database and the user's
recoverable draft were left intact.

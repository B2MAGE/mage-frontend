# AR-09 audio inspector — local review

Issue: [frontend #186](https://github.com/B2MAGE/mage-frontend/issues/186).
Branch: `codex/ar09-audio-inspector`.

## Try it

1. Open `http://127.0.0.1:5178/create-scene` and expand **Audio inspector**
   below Live Preview. It starts collapsed on each editor visit.
2. Add a song to Live Preview, or enable **Motion → Simulate beat**. Playing
   music takes priority. Inspect the level meters and recent-hit strengths.
3. In Builder, select an object with **Music & pointer** responses. The inspector
   follows that object; choose a property to see its settings, smoothed input,
   and the value passed into the shader before Animation influences.
4. For an object with Animation, choose an **Inspect Animation input** source.
   This displays the actual input supplied to Animation, not a guessed final
   value for expressions that can vary across a surface.
5. Pause/resume, change objects, reorder/delete an object, and switch between
   **Original** and **Selective**. Closing the inspector or hiding Live Preview
   stops the diagnostic requests without changing the scene.

The inspector does not record or upload audio. Samples stay in memory, and its
selection/open state is not saved with the scene or personal templates.

## Runtime boundaries

- Uses the existing audio-analysis frames, response envelopes and shader
  uniforms; observing does not consume frames or advance the mapper.
- Four requests per second maximum in the UI, one outstanding request at a time.
  Hidden pages do not request readings. Scene changes/disposal discard late replies.
- Strictly bounded numeric snapshots cross the existing isolated renderer bridge.
  Diagnostic timeouts or unavailable readings do not pause the player.
- Music & pointer output is measured **before Animation**. Group materials and
  later animation can change the visible result; the panel labels those cases.
- Scene-wide Original/Selective behavior and saved formats are unchanged.
- For a later release, retain the existing **renderer-first deployment,
  frontend-first rollback** sequence. The new optional request requires the
  matching renderer; this work does not add general protocol negotiation.

This branch is for local review; merging, issue closure and deployment wait for
the user's review.

## Verified locally, 2026-10-15

- Lint, TypeScript, frontend build and renderer build passed.
- Complete unit suite: **223 files / 3,133 tests passed**. Tooling: **70 Node
  tests plus 89 Vitest tests passed**. The final unit run used the complete,
  stable implementation after the inspector's recent-hit window was finalized.
- Local renderer integrity, isolation headers and route restrictions passed.
- Browser: real music and simulated beats in Original and Selective; music
  taking priority over simulation; pause/resume and ended-track messaging;
  selected Music & pointer output and actual Bass hits input supplied to
  Animation. Structural edits still wait for an offscreen preview to become
  visible, and the inspector shows a waiting state during that interval.
- Both themes checked; narrow layouts at 320 and 390 CSS pixels had no page
  overflow and kept the full scene aspect ratio. This is desktop browser
  viewport testing, not a claim of physical Pixel testing.
- Frontend and renderer restarted from this branch. Backend remained unchanged;
  the existing 15 scenes and 2 accounts were preserved. Browser review changes
  were not published, and the existing recoverable draft was left untouched.

Local logs and screenshots: `../.local/ar09-20261015/` (not committed).

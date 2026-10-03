# Scene crash recovery (PP-R01)

Recovery lives at the shared player boundary. Home, scene detail, editor previews,
hover cards, and brand artwork all consult the same browser-local guard. There is
no backend change or server-side crash classification.

## What the user sees

- A failed or possibly interrupted scene stays static on the next visit. A saved
  thumbnail is shown when available; the message distinguishes an observed error
  from an interruption whose cause is unknown.
- The **Playback options** cogwheel beside fullscreen contains **Stop this scene**
  and a **Pause all scenes** toggle. These controls are also available in the bottom
  bar while loading, with no permanent buttons covering the scene.
- **Stop this scene** disposes the active player and blocks automatic rendering of
  that revision. **Resume scene** clears an intentional stop, so future visits,
  previews, and other tabs can play that revision again. It only clears the exact
  stop shown by the button; a newer stop or failure stays blocked.
- **Retry scene** permits another attempt in the current tab. It does not approve
  the scene, change validation, or disable any other playback restrictions.
  Other tabs remain blocked during the attempt. The isolated player retires that
  exact warning after ten seconds of sustained foreground frame progress, so a
  recovered scene can play on later visits. Loading, paused or hidden time and
  delayed browser tasks do not count. A newer failure or global pause cannot be
  cleared by an old success signal. Leaving before recovery is confirmed keeps
  observed errors blocked. A suspected interruption can also be retired when its
  deliberate retry ends cleanly, allowing subsequent visits; a newer error always wins.
  A corrected revision has its own identity.
  Stopping an accepted retry retains its original failure history and requires
  **Retry scene** again; it cannot turn a failure into a clearable manual stop.
- One **Playback paused** panel explains whether playback was stopped, interrupted,
  or failed. **Pause all scenes** turns off automatic rendering across this site's
  tabs. Browsing and editing remain available; turning it off does not erase failed
  scenes. Resume stays disabled while all scenes are paused. Internally this setting
  retains the existing safe-mode flag and persistence behavior.
- Turning **Pause all scenes** off resumes scenes that were already playing in the
  current view, including an accepted retry. Clean global-pause disposal retains
  that permission until resume; leaving the view, changing the revision, or a new
  failure cancels it. Previously blocked scenes remain blocked, and other tabs do
  not receive this continuation permission.
- Editor fields and locally selected audio tracks survive replacing a failed
  player. This is not draft autosave: a browser crash or page reload can still
  discard unsaved editor changes and local file selections.

Recovery controls are DOM elements outside the canvas. They remain usable after
observable renderer failures, including failures during renderer cleanup. A
blocked hover card keeps its thumbnail and directs the user to open the scene to
retry; simply hovering again never clears its block.

## Identity and local storage

`sceneRecoveryKey` hashes the stable scene ID and complete scene document into an
opaque revision key. Unsaved scenes use the content fingerprint without a saved
ID. Key ordering is normalized; getters and `toJSON` are never invoked. Invalid,
cyclic, excessively nested, or oversized non-JSON input cannot acquire a render
lease. This fingerprint is a recovery identity, not a trust or security signature.

The editor supplies its original document as `recoverySceneBlob`, before adding
preview defaults. The adapter validates and renders the actual preview document;
the original document is used only for identity. An untouched saved scene therefore
has the same block in the editor, cards, Home, and detail view. Live audio-response
changes transfer the active marker to the new document without restarting music.

Storage contains only opaque keys, random owner IDs, timestamps, fixed reason codes,
and the safe-mode flag. It never contains shader source, full scene data, tokens,
audio, or raw error messages.

- `mage.scene-recovery.v1`: localStorage history, up to 64 entries, seven-day expiry.
- `mage.scene-recovery.active.v1`: per-tab sessionStorage markers, up to 32 entries.
- Corrupt or unavailable storage falls back to guarded in-memory behavior. Recovery
  across reloads is best effort when the browser cannot persist either store.

An active marker is written **before source loading/compilation** and remains for
the entire rendering lifetime, including pauses. Clean replacement or disposal
removes it. Observed failure records a block; failed cleanup retains the marker.
Reloading with a leftover marker means **suspected interruption**, not proof of a
crash. On a normal page exit or refresh, `pagehide` synchronously disposes the
renderer and clears its marker only after successful cleanup. Failed cleanup or
an unresponsive page retains its marker. Browser cache restoration creates a fresh
renderer while preserving the surrounding editor and playlist state. No timer or
first-frame signal clears a running scene's marker.

Successful retry confirmation only removes the matching history warning. The
active marker stays until clean disposal, so an interrupted or failed attempt
after confirmation is still detected. This is browser-local recovery, not scene
approval; validation and server playback restrictions continue to apply. Browser
profiles have independent history, so a scene can be blocked in one browser while
playing normally in another.

Each document has its own owner ID. When a tab inherits sessionStorage, a one-second
BroadcastChannel probe asks whether the old owner is still live. Until resolved,
the scene stays static. A live response releases only the copied marker, never an
explicit failure or the original tab's marker. Late replies are handled. Browsers
without BroadcastChannel conservatively require retry for inherited markers;
ordinary independent tabs retain separate sessionStorage.

## Failure signals and limits

The existing `@notrac/mage@1.0.3` dependency patch adds a small optional
`subscribeRenderLifecycle` hook. It reports completed render submissions and
runtime/GPU shader failures, and stops a failing frame loop before notifying the
adapter. Source load/compile exceptions and WebGL context loss also block the
current revision.

The monitor waits for 15 seconds of observed foreground startup time, or 10 seconds
without progress after a completed frame. It resets observation while paused,
hidden, or after a delayed timer that could indicate browser suspension or system
sleep. It uses completed frame submissions, not the scene's editable animation
clock. Adapters without lifecycle hooks do not fabricate progress timeouts.
Audio loading errors and failed network requests are not renderer crashes.

This story prevents repeated automatic loading after a failure or interruption.
It cannot preempt JavaScript that blocks the browser thread, guarantee GPU recovery,
or certify that a submitted shader is safe. Independent execution isolation and a
host-side watchdog remain separate work. The lifecycle boundary can accept those
future signals without moving recovery controls into the renderer.

## Verification

Automated coverage includes persisted failures and interrupted reloads, clean and
failed disposal, two tabs and copied tab storage, storage corruption/unavailability,
revision changes, deliberate retry, context loss, foreground timeouts, audio failure
exclusion, stopped animation clocks, stale preview initialization, and editor data
preservation. Patched-engine tests exercise real lifecycle notifications, and the
patch is checked against a pristine MAGE 1.0.3 package.

For a harmless manual check, stop a valid scene, reload, and verify it stays static.
Resume explicitly, navigate away and return, and verify the manual pause is gone.
Refresh a playing valid scene and verify it loads without an interruption prompt.
Enable Pause all scenes, browse to another scene, then turn it off.
For editor recovery, make unsaved changes, stop the preview, and confirm the fields
remain intact. Do not use an infinite loop to test a renderer on the browser thread.

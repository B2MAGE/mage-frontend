# Scene playback recovery (PL-01)

Recovery is shared in memory by submitted-scene players on the current page:
Home, Watch, editor previews and hover cards. It records observed failures and
manual stops without changing server permission or classifying a scene as unsafe.
The [PL-01/RF-04 release record](pl01-rf04-local-review.md) tracks this change;
earlier release records describe their original artifacts.

## User actions

- **Stop this scene** disposes its renderer and blocks the current revision.
  **Resume scene** clears only the exact manual stop displayed by the button.
  A newer stop or failure cannot be cleared by a stale Resume action.
- **Retry scene** clears the current page's failure and permits a fresh attempt.
  There is no retry grant, success-observation period or recovery certificate.
  A repeated failure stays stopped until another explicit Retry.
- **Pause all scenes** pauses players and fixed brand artwork on this page.
  Turning it off preserves existing scene failures and manual stops. Resume/Retry
  stays disabled while the page is paused. Other tabs are independent.
- Failure messages distinguish scene loading, compiler and graphics downloads,
  compiler startup, rejected compilation, compilation timeout, invalid compiled
  output, graphics startup, context loss, interrupted startup and stalled playback.
- Recovery controls remain outside the renderer. Editor fields, playlist selection
  and playback intent remain owned by the surrounding UI when it replaces a player.
  Editor browser backups are a separate feature; see [scene foundations](scene-foundations.md#builder-editing-and-recovery-sb-08).

A blocked hover card retains its thumbnail and directs the user to open the scene
to retry. Clearing a failure elsewhere does not restart the focused card; another
hover/focus interaction is required. A changed structural scene revision can load
separately. Live settings edits do not silently resume a stopped preview.

## Page-session state and ownership

`sceneRecoveryKey` fingerprints the stable scene ID and complete current document.
The editor supplies `recoverySceneBlob` before adding preview defaults, so unchanged
saved scenes have the same identity across player surfaces. This identity is not
a security signature. Fingerprinting bounds its work and never invokes getters,
`toJSON` or submitted functions.

The store keeps at most 64 recent blocks, live lease tokens and the page pause flag
in memory. It does not read or write localStorage/sessionStorage, open a
BroadcastChannel, probe abandoned players, or restore older browser history.
Reloading or opening a new tab starts fresh recovery state. Client-side navigation
within the same document keeps the current session state.

Each scene load acquires a lease before work begins. A failure invalidates all live
leases for that revision before notifying players to dispose. Retry, explicit
clear and page-wide pause also invalidate the affected leases. Late failure or
disposal callbacks cannot overwrite a newer attempt. A clean disposal removes only
its own live lease; it does not change another player's block.

The controller still checks current permission on start, resume, scene changes,
audio operations and capture. Local Retry does not bypass a denial. Page hide
cancels active resources; a browser-cache return creates a fresh renderer while
the outer session retains editor, audio-selection and playback-intent state.

Fixed Home/About artwork has a dedicated controller that only loads the frozen
built-in scene. It observes Pause all scenes, visibility and disposal, but does
not use submitted-scene permission or per-revision recovery history.

## Startup and failure limits

The trusted renderer download has a separate 60-second bound. Compiler/graphics
import phases also have 60-second bounds and distinct error messages, but the
production build remains one integrity-pinned bundle; these phases do not introduce
additional production script downloads. The worker has up to eight seconds to
acknowledge startup. Once it acknowledges `started`, submitted compilation retains
the fixed two-second execution deadline. The parent uses nine- and three-second
fallback clocks respectively, allowing the child's precise startup/compilation
failure to arrive first. Slow trusted downloads do not consume the submitted-code
execution budget or extend it.

Graphics startup requires a first frame within 15 seconds of observed foreground,
onscreen time. Once playing, ten seconds without completed-frame progress stops
the player. Pause, hidden/offscreen time and parent scheduling gaps longer than
two seconds do not count as graphics stalls. Progress reports indicate liveness,
not approval of source or compiled output.

An initially hidden document defers compilation. Hiding during compilation
terminates that worker; the same pending load may wait for visibility and retry
once, preserving playback intent. Replacement, cancellation or navigation retires
that work. A second interruption stops with an explicit message. This bounded,
known visibility interruption is the only automatic compiler retry; compilation
errors, downloads, invalid output and renderer failures require explicit Retry.

Audio loading errors remain separate from renderer recovery. Compilation and
compiled-output validation retain the isolated worker/child boundary, resource
limits and current server permissions. Original and Selective audio behavior is
unchanged.

## Verification

Focused tests cover session isolation, absence of browser persistence, Stop/Retry,
page-wide pause, simultaneous leases, stale callbacks, bounded memory and distinct
panel messages. Discovery/editor tests cover blocked previews, explicit retries
and preserved authoring state. Worker, host and lifecycle tests cover their own
deadlines and cancellation boundaries. Unit tests alone do not establish browser
downloads, WebGL, audio continuity or device behavior.

For manual review, stop a valid scene and verify Resume is required while navigating
within the same page session. Reload and verify the old stop is gone. Toggle Pause
all scenes and confirm that an existing failure still needs Retry afterward. Edit
an unsaved document while stopped, retry it, and verify its fields and local music
selection remain intact. Record actual results in the
[local review checklist](pl01-rf04-local-review.md#verification-checklist).

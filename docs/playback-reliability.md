# PL-08 playback reliability

Tracking: [PL-08 #332](https://github.com/B2MAGE/mage-frontend/issues/332), under
[epic #288](https://github.com/B2MAGE/mage-frontend/issues/288). PL-04 #292 owns
page-wide scheduling; PL-06 #294 owns graphics startup and resource measurements.

## Milestone 1: operation failures and evidence

Capture, capability metadata, and optional audio observations have bounded,
request-local failure paths. Their timeout or unavailable result does not stop a
healthy renderer. A timed-out child capture remains single-flight until it settles
or its scene is retired. Malformed protocol envelopes, flooding, context loss and
the independent playback watchdog still retire the session.

Replacing a draft cancels pending work before permission checks or the latest-only
dispatch interval. The child aborts its obsolete load; stale callbacks and timers
cannot mark a newer generation failed. Capabilities are requested after readiness
and do not delay audio or first-frame completion.

Retry screens offer **Save playback report**. The report is kept only in page memory
(eight sessions, eighty operation events per session, latest progress/watchdog
sample). It contains fixed operation/phase/reason labels, generation/request IDs
and timings. It also records the engine release expected by the frontend and the
playback/compiler protocol versions. That engine reference is not proof of the
renderer build actually reached during a mixed deployment. There is no frontend
commit identifier available in the existing build. The report contains no scene
source, media, account details, or URLs and is not uploaded. Closing/reloading the
page clears it.

## Milestone 2: startup and graphics preparation

The isolated adapter starts the maintained engine with `initialScene: 'empty'`.
The requested document is compiled and validated before graphics allocation; the
engine no longer creates its unrelated default visual first. The engine's normal
default startup remains available to its other consumers.

The engine prepares a replacement's materials, background, post-processing and
camera settings in an independently owned scene bundle. With
`KHR_parallel_shader_compile`, it polls program readiness using cancellable,
bounded polling. It deliberately does not use Three's uncancellable
`compileAsync` polling after a candidate has been disposed. Without the extension,
the supported fallback verifies the first graphics submission before activation.
Preparation includes an offscreen draw and, where supported, a GPU fence. It is
not a guarantee that a graphics driver never blocks during compilation or drawing.

Optional graphics diagnostics expose cumulative context creation/disposal,
load-to-verified-frame latency, current geometry/texture/program counts, candidate
prepared/activated/discarded counts, peak resource counts and preparation mode.
The request is single-flight, capped at two requests per second, and is never
automatically polled by production playback. The browser stress harness requests
it after successful loads and before disposal.

## Milestone 3: retained renderer and staged replacement

One isolated renderer session owns the canvas, WebGL renderer, progress
supervision and current active scene. It can prepare at most one candidate scene.
The parent owns audio, user playback intent, permissions and recovery leases.
An ordinary replacement proceeds as follows:

1. Keep the authorized active scene rendering and its audio playing.
2. Check the requested scene's permission independently, compile it in a disposable
   worker and validate the output independently before graphics use.
3. Build candidate graphics and controls without changing active scene settings.
4. Receive `prepared`, then synchronously check that this is still the newest
   request and that permission is still granted.
5. Send `activate`; the child synchronously draws and commits the prepared scene,
   then acknowledges the exact activated generation.
6. Adopt that actual scene's identity, audio-response metadata and recovery lease;
   release the previous scene's resources.

Only the newest pending request may reach preparation. Once activation has been
sent, a newer selection waits for its bounded acknowledgement rather than
pretending the commit was cancelled. The parent adopts an acknowledged
intermediate scene even when the next selection is already queued. This keeps
permission ownership and the visible scene consistent. Both the old active scene
and an approved committing candidate remain watched until the acknowledgement.

Compile, asset, candidate graphics and rollback-safe activation failures discard
the candidate and preserve the healthy authorized active scene. The player shows
a small update-failure notice with **Retry update**. Audio controls remain usable.
Initial-load failure, context loss, broken protocol, lost activation acknowledgement
or an active render/progress failure still retire the entire session. A new
candidate never borrows permission from the previous scene, and permission
revocation still stops the affected renderer.

Pause and Stop are user intent, not scene defaults: a late activation cannot
resume a paused or stopped player. Original and Selective retain their existing
analysis and response behavior. The current audio source and position remain
parent-owned across scene changes. Candidate controls include Builder inputs,
pointer state and authored camera/animation settings before the first graphics
check.

During preparation or a failed replacement, the old image is not exposed as a
capture of the new draft. Scene readiness and capture callbacks become available
for that draft only after its activation or a validated live settings update.
Editor text, saved thumbnails and exportable rejected drafts remain intact. The
preview container and responsive dimensions are unchanged by the update notice.

### Resource ownership and limits

Session disposal still removes the isolated frame, aborts candidate work, disposes
active and candidate resources, and releases the WebGL context. A candidate
discard releases its own resources; normal activation releases the old scene
without disposing the healthy renderer. Cancelling the first load replaces its
canvas before trying again so a delayed old context-loss event cannot stop the
new session.

The combined bound is one active scene plus one candidate under the same host-owned
render profile, with bounded scene structure/effects and unchanged shader workload
limits. Both use the existing pixel, longest-edge, device-pixel-ratio, frame-rate
and raymarch ceilings in `contracts/scenes/scene-limits.v1.json`. Preparation can
temporarily approach two scene bundles' resources, plus shared renderer resources
and caches. Geometry, texture and program counts are useful estimates, not GPU
memory bytes or a universal memory ceiling. No cache of previous scenes is kept.

### Existing and preparation deadlines

| Work | Default bound | Failure scope |
| --- | --- | --- |
| Renderer/compiler/graphics downloads | 60 seconds per relevant wait | Initial session or current candidate |
| Disposable compiler startup | 8 seconds; parent observes a 9-second ceiling | Current candidate |
| Compiler execution after startup | 2 seconds; parent observes a 3-second ceiling | Current candidate |
| Engine graphics preparation | 10 seconds, capped at 15 seconds by the engine API | Current candidate |
| Observable graphics startup / activation acknowledgement | 15 seconds | Candidate before commit; session when commit is uncertain |
| Active playback without progress | 10 seconds of observable silence | Session |
| Capture | 5 seconds, with one child capture in flight | Capture only |
| Capabilities | 15 seconds | Metadata request only |
| Audio/graphics diagnostic request | 1 second | Optional request only |

The progress watchdog does not count paused, hidden or offscreen playback, or a
large gap in the parent's own scheduling, as observed renderer silence. Active
progress remains supervised while a candidate is being prepared. Graphics-startup
observation and active progress use separate timers. A compiler interrupted by a
visibility transition has at most one explicit visibility retry; there is no
indefinite automatic retry loop. These are execution bounds, not guarantees that
browser timers can preempt a blocked GPU driver.

## Validation and evidence

The focused automated coverage includes auxiliary timeouts and invalid results,
stale requests/timers, independent active/candidate permissions, newest-request
selection, acknowledged intermediate commits, candidate cleanup, context loss,
first-use failures, paused activation, capture ownership, retained audio, and
safe renderer teardown. Engine tests cover parallel-program readiness and the
extension fallback. Controller/hook/UI tests also cover recovering a valid draft
after an invalid edit, retrying a replacement without recreating the renderer,
and exporting rejected custom text without replacing a saved thumbnail.

The loopback-only harness is
`scripts/playback-reliability-check.html`, served by `npm run manual-checks:dev`.
It uses the actual player and isolated renderer, with the full template catalog,
sequential and rapid switching, Original/Selective, optional generated audio and
simulated beat. Its bounded JSON distinguishes loads, superseded requests, session
failures, Retry requirements, parent scheduling gaps and graphics measurements.
It does not bypass scene validation or move untrusted execution into the parent.
The diagnostics renderer provides separate local fault fixtures; those fixtures
are excluded from the production renderer.

On 2026-10-16, the local browser run completed all fourteen templates sequentially
in Original mode with one graphics context and no Retry. The Selective rapid
switching run activated seven requests, superseded six and required no Retry.
Five local browser fault cases also passed: actual compiler rejection and actual
`WEBGL_lose_context`, plus explicitly injected candidate first-use failure,
dropped optional-operation replies and held obsolete preparation. The four
recoverable cases kept one context and continued submitting frames; real context
loss removed the frame and correctly required Retry. Injected failures test the
handling path, not the prevalence of those failures on users' hardware.

Measured browser results belong with their exact frontend/engine revisions and
test settings. A snapshot taken before iframe disposal cannot prove driver memory
reclamation after that iframe disappears. An offscreen verified frame is not a
measurement of when the browser compositor presented it to the display.

### Recorded local before/after measurements

These are single local desktop-browser runs on 2026-10-16, not repeated benchmark
trials. The baseline used engine `1.0.4-mage.5`; M2 measured the empty-start change
before retained replacement, and M3 used the released `1.0.4-mage.6` engine from
source commit `cd5a96f`. The maintained frontend pins that immutable release.
Baseline and M2 rebuilt the context for each load; M3 retained it. All browser
measurements used the desktop viewport. The attempted narrow override did not
apply: the DOM remained 1280 × 720. The report named `m3-narrow-selective-burst`
is therefore an additional desktop burst, not narrow-viewport or phone evidence.

The latency column is the parent-observed time from requesting a scene to its
successful load acknowledgement, measured before the optional diagnostics request.
Only successful loads enter the median/range. In M3, acknowledgement follows the
verified candidate draw and activation; baseline acknowledgement followed its first
submitted frame. This does not measure compositor presentation, and the additional
verification makes this a lifecycle comparison rather than identical work.

| Run / mode | Loaded / superseded | Contexts created / disposed before final teardown | Load latency: median (min–max), ms | Largest sampled parent frame gap, ms | Retry |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline sequential / Original + test audio | 14 / 0 | 14 / 13 | 281.2 (247.2–1084.8) | 843.6 | 0 |
| Baseline burst / Selective + test audio | 13 / 0 | 13 / 12 | 254.0 (240.1–470.9) | 117.4 | 0 |
| M2 empty-start sequential / Original + test audio | 14 / 0 | 14 / 13 | 284.5 (245.7–441.7) | 128.4 | 0 |
| M3 sequential / Original + test audio | 14 / 0 | 1 / 0 | 498.2 (325.4–1733.5) | 167.4 | 0 |
| M3 burst / Selective + test audio | 7 / 6 | 1 / 0 | 389.1 (360.9–928.2) | 221.0 | 0 |
| M3 sequential / Selective simulated beat, paused | 14 / 0 | 1 / 0 | 342.4 (284.7–666.4) | 169.8 | 0 |
| M3 additional desktop burst / Selective simulated beat | 9 / 4 | 1 / 0 | 365.2 (317.4–611.1) | 159.4 | 0 |

The clear improvement is context reuse: the fourteen-template sequence changed
from **14 creations / 13 disposals to 1 / 0** while the final scene remained alive.
These results do **not** show a load-speed improvement. Successful M3 activation
was slower in both comparable real-audio runs, while more burst requests were
superseded during preparation. The previous scene stayed available during that
work. Parent frame-gap samples varied between runs and include browser/host
scheduling; they are not a GPU stall attribution or a statistically established
responsiveness gain.

| Resource observation | Geometries | Textures | Programs |
| --- | ---: | ---: | ---: |
| Baseline/M2 largest sampled settled count | 3 | 3 | 3 |
| M3 sequential final scene | 3 | 3 | 4 |
| Other M3 runs' final scene | 2 | 3 | 4 |
| M3 preparation peak in each recorded run | 4 | 6 | 6 |

Baseline/M2 had no preparation-peak instrumentation, so their sampled settled
counts must not be compared as equivalent peaks. The M3 peaks include overlapping
active/candidate resources; all four M3 runs reported the parallel compilation
path. The fallback was tested automatically, not forced in these browser runs.
These are engine resource counts, **not GPU memory bytes**. The final snapshots
were taken while playback still owned its context, so zero disposals is expected;
they do not prove GPU-driver reclamation after final iframe removal.

Raw bounded reports are kept with the local task evidence under
`.local/pl08-reliability-20261016/`: `baseline-original-sequential.json`,
`baseline-selective-burst.json`, `m2-empty-start-original-sequential.json`,
`m3-original-sequential.json`, `m3-selective-burst.json`,
`m3-selective-simulated-paused.json`, `m3-narrow-selective-burst.json`, and
`m3-fixed-failure-checks.json`. They are local verification artifacts, not a
production telemetry service.

Final verification against the pinned engine release passed: **3,272 frontend
unit tests** (one existing skipped test), **71 Node tooling/security tests**, and
**108 manual-harness tests**. The engine release passed **62 engine tests** and
**180 shader parse cases** from a clean merged checkout. Frontend lint, TypeScript,
application/isolated-renderer builds, served renderer security headers/routes, and
all seven scene-contract comparisons with backend `b126805` also passed. The
measurement harness's conventional-median correction passed its eight focused
checks afterward. Frontend review is tracked in PR #333; production is unchanged.

The original intermittent Pixel/Chrome startup timeout has **not** been
reproduced. The implementation fixes reproducible lifecycle and failure-handling
problems; it does not establish the root cause of that historical report or prove
all mobile/network conditions are resolved. Page-wide playback scheduling remains
PL-04's scope. Broader device/resource tuning remains PL-06's scope.

New frontend cancellation/staged-activation commands require the matching renderer build. For a
future approved production release, deploy the renderer before its frontend.
No production deployment is included in this implementation task.

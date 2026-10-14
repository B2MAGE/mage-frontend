# PL-01 / RF-04 verification and release

Branch: `codex/pl01-rf04-session-playback`, based on `848c58a`.
The implementation was reviewed locally, and the owner authorized merging and
deployment on October 14, 2026. The verification below records the local checks;
the release status at the end records production evidence separately.

The earlier `codex/mobile-player-startup-recovery` branch at `0d90946` is already
an ancestor of `848c58a`. Its changes are in this baseline; no separate branch
integration is required. This work replaces the old broad automatic-retry and
persisted-history behavior while preserving current scene validation, renderer
isolation and server permission boundaries.

## Ownership

| Owner | Responsibility |
| --- | --- |
| `MagePlayerSession` in `MagePlayer.tsx` | Gate server permission, validation, Stop/Retry and page-wide pause; retain viewing-session playback intent, editor state and music selection across renderer replacement. |
| `useMagePlayerScene.ts` | Own controller creation, current scene loading/live updates, readiness/capability publication and disposal; reject stale asynchronous completions. |
| `infrastructure/engineAdapter.ts` | Validate the initial submitted document and route it to the isolated controller; no generic in-page engine route. |
| `infrastructure/isolatedController.ts` | Integrate validated scene/audio/capture operations with fresh permission, current page recovery leases and scene/audio cancellation. |
| `isolation/isolatedPlayer.ts` | Own parent input collection, Web Audio/transport, numeric analysis and bridge-facing player operations. |
| `isolation/playbackHost.ts` | Own iframe/private-port transport, request/generation matching, bounded commands/capture, startup phases and watchdog teardown. |
| `isolated-renderer/playbackRuntime.ts`, `playbackEngine.ts`, `compiler/client.ts` | Own child generation/cancellation, disposable compiler workers, independent compiled-output validation, engine/GPU creation and frame progress. |
| `scene-artwork/brandArtworkController.ts` | Load only the frozen built-in artwork; own its animation, visibility, capture, input and cleanup without submitted-scene permission/history or generic playlist/audio capabilities. |
| `recovery/sceneRecovery.ts` | Keep bounded page-session failures, per-attempt lease tokens and Pause all scenes; invalidate stale leases before notifying consumers. |

This split preserves Original (`legacy`) and Selective (`mapped-v1`) audio. It does
not change the onset/FFT algorithm, scene contracts, moderation permissions,
renderer sandbox or production hosting architecture.

## Recovery and timing contract

Failures and manual stops remain in the current document's memory. Retry clears
the current block, while a stale callback from a retired renderer cannot replace
a newer failure. Pause all scenes affects this page and does not erase failures.
Reload and a new tab start fresh; there are no localStorage/sessionStorage recovery
records, ownership probes, migrations or healthy-progress certificates.

Trusted download/bootstrap phases are distinct from submitted compilation. The
compiler retains its fixed two-second deadline after `started` acknowledgement,
with eight seconds allowed for acknowledgement. The production renderer remains
one integrity-pinned bundle. A visibility interruption terminates compilation;
one guarded retry after visibility returns may continue the pending load. Other
compiler, output, startup or graphics failures require explicit Retry. See
[scene recovery](scene-recovery.md) for phase limits and messages.

## Verification checklist

The results below are from this local branch. Browser observations used the
normal application at `http://127.0.0.1:5178/` and the rebuilt local renderer.
They do not establish production or additional device/browser coverage.

The local renderer build produced `renderer-DPw4Nf6J.js`, with integrity
`sha384-lHA/Qq+fB9I8j3TM01DzU1mhyMbtyw+sKukE3gJfOuLK+uwZ1nVdBgnLtlKYno73`.

| Check | Status / evidence |
| --- | --- |
| TypeScript, lint and app/renderer builds | Passed: TypeScript + Vite application build, lint and local renderer build. |
| Renderer hosting | Passed: `renderer:test`, 10 tests; `renderer:verify`, local artifact/header verification. |
| Focused host and recovery regressions | Passed: host suite, 38 tests; recovery store/panel, 34 tests. |
| Extracted scene lifecycle hook | Passed: 9 focused tests, including stale startup/load completion handling. |
| Player integration regressions | Passed: availability, capabilities, clear-music, controls and engine-availability suites, 95 tests. |
| Entire frontend suite | Full run: 218/220 files and 3039/3043 tests passed. Four existing editor UI cases failed on timing: a one-second draft lookup and three 30-second test limits. The draft case passed independently (13.25 seconds overall); the three template cases passed with a command-line-only `--testTimeout=120000` (35.33, 40.01 and 32.34 seconds). Repository test timeouts were not changed. This is not a claim that the default full-suite command was green. |
| Final unused-watchdog cleanup | Removed the old in-page monitor and its six tests after confirming there were no implementation callers. `RenderFailure` now derives from the shared recovery reasons. TypeScript, worker-check TypeScript, 73 host/player/store tests, five import-boundary checks, targeted lint and diff checks passed afterward. The full-suite counts above precede deletion of those six obsolete tests. |
| Real local Home/Watch and Create/Edit/import playback | Home featured **Signal Duet**, Watch scene 15 and Create playback observed. Edit/import are covered by automated tests; they were not walked through in this browser review. |
| Rapid scene replacement and navigation during startup | Create switches **Prism Core → Alloy Capsule → Steel Lattice → Prism Core** completed. Startup cancellation/stale completion have focused automated coverage; navigation during startup was not separately observed in the browser. |
| Cold/throttled trusted download, acknowledged compile timeout, invalid output and distinct messages | Host and recovery regression suites passed. No real mobile network throttle or browser cold-download timing run was performed. |
| Hidden/visible compiler interruption and bounded retry | Automated host/lifecycle coverage is recorded above. This was not separately exercised in the browser walkthrough. |
| Stop, Retry, Pause all scenes and reload reset | Stop removed the iframe and exposed Resume. Reload started fresh playback. Explicit Pause remained paused after Pause all scenes was turned on and off. Failure Retry and stale leases are covered by automated recovery tests. |
| Original and Selective response / audio continuity | Both modes updated live with Simulate beat in Create. A locally generated 20-second WAV played through the normal audio picker. Pause and seek to 19.99 seconds survived switching response mode and replacing Prism Core with Alloy Capsule; the same track, seek position and paused state remained after loading completed. Clear music removed the fixture afterward. This checks actual browser audio transport, not musical quality or a real music catalog. |
| Thumbnail capture | Capture produced a thumbnail and enabled Recapture. Switching templates discarded the outdated capture. Replacement/disposal cancellation has automated coverage. |
| Fixed Home/About artwork | About artwork visibly rendered after restarting Vite cleared a stale development dependency cache. This observation does not cover every pointer, visibility or cleanup scenario. |
| Current server permission | Automated availability regressions passed; no new browser moderation/denial walkthrough was performed. |
| Mobile cold-start incident | Not reproduced on a physical device. Real Pixel/network-throttle and other device/browser review remain open; the local desktop walkthrough does not resolve that incident. |

The original physical-device/mobile-network conditions and response quality with
the user's music remain unverified. The owner approved releasing the implementation;
that approval does not establish coverage of those conditions or untested browsers.

## Release status

Released on October 14, 2026 through [PR #322](https://github.com/B2MAGE/mage-frontend/pull/322),
merged as `11e3b4e25d77949f84d81c02295aa247c104705d`. Coolify deployment
`iq0ra1rk1dklk3tkam18mzcl` finished at that commit and serves
`/assets/index-CZcoXTkd.js`. The backend and engine were not changed.

The production renderer is `assets/renderer-B1GzPCY4.js`, built from
`d033bd118759f0f20c5be5576fdc6b95429feb34` with SHA-256
`7ea24653428cb178414bffbdc6c7c58a64921a6db431c2fbedef2579cab78979`.
The `mage-isolated-renderer` stack reached `UPDATE_COMPLETE`, CloudFront reported
`Deployed`, and the final template/document and completion token were verified.
Both CloudShell and `renderer:verify:production` verified the exact final headers,
bundle bytes and forbidden routes. Only the four expected hosting resources were
modified; prior versioned artifacts remain available for rollback.

Before the application update, the previous production frontend created a fresh
iframe using the new renderer, played a generated 20-second WAV and captured a
thumbnail without console errors. After the application update, production
Create playback, capture, Stop/Resume, page-wide pause preserving manual Pause,
reload clearing the current-page stop, and both Original/Selective controls with
Simulate beat passed in desktop Chromium. The iframe still has exactly
`sandbox="allow-scripts"`. Public API and asset checks passed; all 14 existing
scene documents, revisions and thumbnails were unchanged. These checks do not
establish physical Pixel, throttled-network or musical-quality coverage.

The child renderer must deploy before the application. Updated parents explicitly
request startup-phase reporting in the connection handshake. Existing parents
continue receiving only their original response and error vocabulary, so open
tabs can create another renderer during rollout. Roll back the parent before
rolling back the child. The negotiated reporting does not change validation,
sandbox permissions or compilation limits.

Release preparation passed the rebuilt production application, production renderer
and lint. The connection compatibility regression suites passed 100 tests, with
20 fixed-recovery tests and TypeScript checks for the application, worker and
diagnostics. The separate security-page suite's 11 tests passed after its mock was
updated to read the current custom-scene envelope; its older mock threw before
the baseline timing check. No production timing limits were changed for that fix.

### Production artwork correction

The final About-page smoke found a production-only artwork failure after the
initial deployment. The optimized app bundle had removed Shader Park functions
called dynamically by the fixed artwork (`setStepSize`, followed by `torus`).
Development mode had retained them, so the earlier local check missed this.

The app build now retains statements only in the engine's generated Shader Park
compiler module. Other modules remain optimized; no runtime permissions, CSP,
scene source boundary or renderer deployment settings change. The regression
builds that compiler through the actual production Vite configuration and
compiles the exact checked-in artwork. It failed before the correction and
passed afterward. All 23 compiled-output tests, the production application
build and lint passed. The rebuilt full engine chunk produces the same compiled
artwork as the unbundled compiler, and the local production preview visibly
renders the rings.

The correction merged in [PR #323](https://github.com/B2MAGE/mage-frontend/pull/323)
as `280b4920b36af206234d1959d19f36d39adb1f5f`. Coolify deployment
`sqeiw6dhy5a4r0iqh3zgck6f` finished its rolling update at
2026-10-14 14:47:45 UTC, running that exact commit and serving
`/assets/index-CtiYZw3J.js`. The live About artwork visibly rendered with a ready
canvas. Fresh Create playback and thumbnail capture passed; Original and
Selective both played with Simulate beat, with no console errors. Post-release
API checks again confirmed all 14 scenes, revisions and thumbnails unchanged,
working tags, rejected anonymous account/template access and retired diagnostic
routes. The previously verified isolated renderer artifact remained unchanged.

# PP-I03 integration and release record

## Status — October 5, 2026 UTC

Normal player and availability integration is merged and deployed. PP-I03 remains **To Verify** for outstanding public release verification. The requested support target is Chrome, Edge, Firefox and Safari, including mobile. The production custom-rendering release gate and saved playback control remain **off**; neither completed implementation nor fixed-fixture checks approve untested browsers or normal-app paths.

PP-I04's worker renderer and fixed verification page are deployed from `eede2567b455bd7cf9931d7c4718ed7dd5f7a893`; final deployment verification passed. The story merged through [PR #232](https://github.com/B2MAGE/mage-frontend/pull/232) at `a34c7e9a5dc3d48e28ce16af9b031bfa150c60a1`, and [issue #222](https://github.com/B2MAGE/mage-frontend/issues/222) is **Done**. The owner accepted user-reported worker-test passes on Pixel / Chrome / Android 17 and Apple / Safari / iOS (described as the latest iOS, exact version unspecified). Exact hardware models, browser versions and mobile JSON were not supplied; collecting them remains in PP-I03 release verification. No independent mobile run is claimed.

PP-I05 is merged through [PR #233](https://github.com/B2MAGE/mage-frontend/pull/233) and the fixed-report compatibility follow-up [PR #234](https://github.com/B2MAGE/mage-frontend/pull/234). The renderer, check service and normal frontend deployed from `9f1d50bc2886136999a963cb78770d035fdfeb08`; [issue #223](https://github.com/B2MAGE/mage-frontend/issues/223) is **Done**. The deployment evidence below supersedes I04 artifacts. Public custom rendering remains disabled. PP-I06 is now merged and deployed as recorded below; PP-I03 retains the wider release decision.

Use the [browser/device checklist](custom-shader-release-checklist.md) and [result template](custom-shader-release-result.template.json) for the remaining runs. The recovery epic is complete; its closure does not approve arbitrary-source playback.

See [isolated renderer architecture and hosting](isolated-renderer.md) for protocol limits, immutable artifacts, AWS resources and the previous deployment evidence. This record separates current branch verification from those historical results.

## I03 verification fixture deployment — October 5, 2026 UTC

The renderer, check service and normal frontend now serve `5f5295eb42c95f3aa119454118cec9bd01c9b25c` from `pp-i03-worker-release-verification`. The existing worker and security pages contain the current boundary and trusted recovery fixtures. No public path or AWS resource was added. No backend was deployed; both custom-playback controls remain unchanged and public rendering status confirms `enabled: false`.

| Artifact or check | Evidence |
| --- | --- |
| Renderer | `assets/renderer-CUTFEClb.js`, 17,775,923 bytes; SHA-256 `3a76393485a059001acc423b20a6369d0bde50d308daaee38bb5ef060ac03677`. |
| Hosting rollout | Old/new-hash transition, document switch and final single-hash stack update reached `UPDATE_COMPLETE`; previous-parent scene15 playback passed before parent deployment. AWS final verification confirmed exact headers/hashes, entry document and forbidden paths. The matching frozen production HTTP verifier passed at `2026-10-05T02:11:04Z`. |
| Check service | Coolify `j13c10tq2szw9ygcyqzun3la`, Finished and healthy at `2026-10-05T02:02:16Z`. All **31 exact deployed HTTP checks passed**, including current files/headers, restricted routes and fetch/XHR/import-script canary positive controls. The reviewed LF Docker image is `sha256:b078de238e84b426c6380dc29dc3fd7658cd711c743405bb6d73f8b96b1b1dbf`; its separate offline HTTP smoke also passed 31/31. |
| Normal frontend | Coolify `hr4nqk5zyc2eou5wav27nwbw`, Finished; rolling update completed at `2026-10-05T02:03:43Z`. Live HTML references `/assets/index-BLl5gpEc.js` and `/assets/index-DrNYC_gP.css`; response `frame-src` is exactly `https://d2wwpgc7sgvmnm.cloudfront.net/index.html`. Watch scene15 rendered with the updated parent and child. |
| Live worker fixture | Windows in-app Chromium 154: **19/19 passed**, schema 2 / `fixed-worker-2`, maximum parent gap 62.9ms. Positive-control counters recorded three requests; worker counters recorded zero. CacheStorage was explicitly `NOT_EXPOSED`, not an observed denied opening. |
| Live recovery fixture | Same browser: **7/7 passed**, schema 3 / `fixed-security-3`, `fixed-renderer-recovery-1`, coverage `current-renderer-recovery`. Actual context loss passed; no case was unsupported. Historical security groups remain historical. |
| Live fixed music | Selective scene switching preserved advancing audio from 17.1 to 17.4 seconds; Original reload preserved the paused 25.8-second position. A 320 × 180 capture succeeded, Resume advanced to 25.9 seconds, and Stop cleared audio and the frame. |

Frozen files, HTTP reports, screenshots and browser exports are under `.local/deployments/pp-i03-worker-verification-5f5295e/`, including `live-worker-report.json`, `live-recovery-report.json`, `production-final-http-verification.json` and `aws-final-verification.txt`. These are deployed fixture and focused Watch observations, not the full browser/device or normal-application matrix. **PP-I03 remains To Verify; public release is NOT APPROVED.**

### Owner-reported current browser passes — October 5, 2026 UTC

After receiving instructions to run the current worker checks and current renderer recovery group, the owner reported: "okay so they pass in all the browsers we tested last time". Record both current groups as **user-reported PASS on the previously tested browser/device set**. Previous conversation records identify desktop Chrome/Edge/Firefox, Pixel/Chrome/Android 17, and Apple/Safari/iOS. This statement does not establish additional operating-system/browser combinations or a new independent test run. No new JSON exports or exact version/device details accompanied it; retain those details as unspecified rather than copying versions from older reports.

These reported passes satisfy the current fixed-page checks for that tested set. The owner subsequently reported the six-step normal-app walkthrough below passing. Reuse these results and the recorded automated evidence; no repeat of passing fixture groups or the same walkthrough is requested by this record. Public release approval and both playback controls remain unchanged, and I03 stays **To Verify** for controlled custom/global-control acceptance and the rollout decision.

### Owner-reported normal-app walkthrough

The owner reported "these all passed" for the six-step walkthrough on normal live MAGE using a new template test scene. Record each step as **user-reported PASS**, separate from an independently observed run:

| Step | Reported passing behavior |
| --- | --- |
| 1. Create and edit | Template rendering, local music, effects, Selective response and template switching work; music continues and the page remains responsive. |
| 2. Capture and save | Thumbnail capture and scene creation succeed; saved-scene audio, play/pause, seeking, volume, dragging and zooming work. |
| 3. Pause and return | Pause-all restores playback; deliberately stopped scenes stay stopped across reload until resumed. The supplied walkthrough also includes mobile rotation and background/return. |
| 4. Block the test scene | A scene block stops foreground playback within the stated 30-second bound; refresh cannot bypass it and scene details remain visible. No exact elapsed time was supplied. |
| 5. Edit and export while blocked | Owner settings and thumbnail survive; description updates and JSON export work without clearing the block. |
| 6. Restore playback | Unblocking and reloading or deliberately resuming restores playback. |

Browser, device, OS, scene ID and explicit attribution of the mobile-only actions were not supplied with this report; clarification was requested. Do not infer this walkthrough ran on every browser in the separate fixture report. No new screenshot/export or independent execution is claimed.

This completes the supplied live template walkthrough as reported. It does not claim a production custom-source/global-switch test: that portion was explicitly excluded because public custom playback is still locked. The next functional verification is the controlled custom-source/global disable/re-enable and recovery walkthrough, using the existing automated contract/authorization evidence alongside it. Production release approval and both playback controls remain unchanged.

The separate usability follow-ups are #236 (compatible live setting updates), #237 (single-song preview/featured players), and #238 (Clear music). They do not invalidate these reported results or expand this isolation release walkthrough.

### Local preparation — October 4, 2026

- Local in-app Chromium 154 / Windows: **19/19 worker checks passed**, maximum parent timer gap 62.8ms. Independent canary control was observed, fetch/XHR/importScripts requests were denied with zero canary requests, IndexedDB opening was denied, and CacheStorage was explicitly `NOT_EXPOSED`. That last observation is not a denied-open claim. An earlier 17/19 report is preserved; it exposed that the fixture failed to distinguish absent CacheStorage from an unusable exposed API.
- Current trusted recovery: **7/7 passed**, including actual context-loss event, private-port rejection/flood removal, ignored window spoof with continued progress, missing readiness, observed iframe reload and a fresh healthy retry. Report schema3/`fixed-security-3`, group `recovery`, coverage `current-renderer-recovery`; historical groups remain historical.
- Dedicated local template scene28: block removed playback; owner fields and saved thumbnail survived; owner JSON downloaded and parsed; saving while blocked succeeded; original description and playback permission were restored. This does not measure the foreground polling bound or exercise global custom enablement.
- Current backend `ae03e7399a8364bb0068c90197908b7a80e12aa2`: **275 targeted release tests /17 classes passed**, no skips/failures/errors, using disposable test databases and stubbed storage. Mode/limits/moderation/release interlock/owner-repair coverage is automated evidence, separate from browser walkthroughs.
- Full frontend regression: **1,945 tests /142 files passed**, plus **43 worker fixture tests**, **27 recovery/UI tests**, **23 report/HTTP policy tests**, and **eight hosting tests**. Lint, TypeScript/application, production renderer, and all three check-page builds passed. The music-page build allowlist was updated for the exact new fixed-recovery protocol dependency; no directory-wide exception was added.
- Independent source review found no confirmed blocker in fixed activation, envelopes, attempted-call/positive-control evidence, denial classifications or hosting restrictions.

Reports and screenshots: `.local/pp-i03-worker-acceptance/`. Backend evidence: `../mage-backend-submission-limits/.local/pp-i03-backend-verification-20261005/`. The exact requested Chrome/Edge/Firefox/Safari and mobile matrix, remaining controlled custom/global-disable walkthrough, and final release decision remain **NOT COMPLETE / NOT APPROVED**. Local or deployed in-app Chromium results do not approve the other browsers. Both public release controls remain unchanged.

## Release verification — October 4, 2026

### PP-I06 lifecycle deployment

PR #235 merged at `e9a1649c8404d622b6278226b3d0f69ffec66716`; issue #224 is closed and Done. The parent and fixed-check service both deploy this exact commit. Public `/api/rendering-status` remains `CUSTOM_RENDERING_DISABLED`.

| Artifact or check | Evidence |
| --- | --- |
| Renderer | `assets/renderer-B-hwXhYk.js`, 17,766,557 bytes; SHA-256 `a80024e47f8397872f0ba29da17cfc0f00085db85b8dd197d6f4efe334dfe08c` |
| Hosting rollout | Existing stack completed old/new transition, compatible previous-parent check, new document switch and final single-asset configuration. Exact bytes, headers, paths/methods and parent frame policy passed. Old immutable artifacts retained for rollback; no additional AWS resource. |
| Parent | Coolify `du6ejvta3fg8r0gt4e6z4z85`, finished at 2026-10-05 00:42Z; live entry `/assets/index-CaTn6c0-.js` verified. |
| Fixed-check service | Coolify `p6nszckhrekb4a8bzelx49v6`, healthy at 00:40Z; all 31 exact HTTP checks passed. |
| Worker smoke | Deployed fixed-worker-1: 11/11 passed, foreground, maximum parent gap 63.6ms, finite-loop termination 2004.2ms. |
| Normal app/music | Live Watch scene15 loaded a local test rhythm and resumed the same track after pause-all. Fixed music page switched/captured, later stopped safely in the in-app browser; retry restored playback and capture, then deliberate Stop released the player. Cause of that one interruption is unconfirmed and retained for I03. |
| Regression | 1,936 tests / 141 files; lint, TypeScript/app, renderer and all three check-page builds passed before merge. |

Evidence directory: `.local/deployments/pp-i06-player-lifecycle-e9a1649/`, including frozen approved files, final HTTP reports, worker JSON and screenshots. These are focused deployment checks, not the complete I03 browser/device and normal-app acceptance matrix. No backend was deployed and custom execution remains locked.



### PP-I04 compiler-worker deployment

This rollout changes the separate renderer and the existing fixed-check service. It does not deploy a new normal frontend/backend or enable public custom rendering. The exact parent is `https://mage.peterbucci.com`; the renderer remains `https://d2wwpgc7sgvmnm.cloudfront.net/index.html`.

| Artifact or check | Recorded evidence |
| --- | --- |
| Frozen source | `eede2567b455bd7cf9931d7c4718ed7dd5f7a893` |
| Renderer | `assets/renderer-DZcqe5Im.js`, 17,711,804 bytes; SHA-256 `e776e5dbb44a5339b19d1e4dedae2572c37968e342ebb8d7593015b2180b282c`; SRI `sha384-0antzIvPnO/7yis7YNpEAXlCO6iTAYl080o22HwNadC0s9zYLGC5G0m/V4ZqgIeE` |
| Embedded compiler worker | 665,108 bytes; integrity `sha384-MhVJbAz3clkmm5kXtrvVrY7cWOpFuR6mXWTtvsdeB0+B46LDOLjLf0I++6m1Oz1P`. The build audits the exact five compiler/bootstrap modules. No separate worker file is hosted. |
| AWS rollout | Existing stack `mage-isolated-renderer` completed its exact old/new-hash transition at `2026-10-04T20:34:27Z`, followed by a successful final single-hash update. The only hosting-policy change is `worker-src 'none'` to `worker-src blob:`; opaque sandbox, exact parent and network restrictions remain. The AWS helper verified final deployment, exact bytes/headers and forbidden paths; `npm run renderer:verify:production` also passed against the matching artifact. Evidence: `.local/deployments/pp-i04-worker/aws-final-verification.txt`. |
| Check-service image | Built from the frozen Git archive with `core.autocrlf=false`, `core.eol=lf`; image `sha256:2fc3343f256536084dacae440dc28c7ac6297eabc854c8818a6fdf7a3ed0384a`. Its actual nine runtime files were exported from `/app/dist-player-check` to `player-check-approved-lf/`. Twenty-six local HTTP checks passed in a read-only, network-disabled container as uid 1000 with all capabilities dropped. |
| Coolify deployment | `p11yjmd2lk5dib05isfe1goe`, pinned to the frozen source above; healthy at `2026-10-04T20:34:44Z`. Music, historical security and new worker pages use the same existing service. |
| Live HTTP | All 31 checks passed at `20:35:13Z`: exact approved file bytes/headers, aliases, HEAD/redirect behavior, rejected routes/methods, bounded canary behavior and normal homepage availability. Evidence: `.local/deployments/pp-i04-worker/fixed-harness-live-verification.json`. |
| Live worker browser check | All 11 fixed checks passed at `/player-check/worker/` in Windows in-app Chromium 154.0.0.0, `20:35:49Z`–`20:35:56Z`. Report status `passed`, opaque frame verified, no hidden-page interruption; finite-loop termination 2,004.7 ms and maximum parent timer gap 63 ms. Evidence: `.local/deployments/pp-i04-worker/live-worker-report.json` and `live-worker-pass.png`. |
| Live music compatibility | Startup and opaque boundary; audio continuity through scene switching and Original response; pause/switch/resume; decoded 320 × 180 capture; Stop removal/audio release; unavailable-player safe failure and successful Retry passed. Capture evidence: `.local/deployments/pp-i04-worker/live-music-capture.png`. |
| Initial music interruption | Before retry, the player stopped safely after reporting capture success and before image dimensions were inspected. The fixed page did not retain the failure reason. Subsequent retry/checks succeeded. Offscreen scheduling is a hypothesis only; this interruption remains recorded, not reclassified as an expected or diagnosed failure. |
| Normal live scene | `/scenes/15` (Aurora Drift) rendered through the CloudFront iframe. Visual evidence: `.local/deployments/pp-i04-worker/live-scene-smoke.png`. This is a focused smoke check, not the complete normal-app acceptance matrix. |
| Android and Apple devices | **Owner-accepted, user-reported passes:** Pixel / Chrome / Android 17; Apple device / Safari / iOS, described as the latest version but exact version unspecified. Exact models, browser versions and exported mobile reports were not provided; that remaining metadata belongs to PP-I03. No independent mobile run is claimed. |
| Public controls and story | Production custom release approval and saved playback remain off, verified during this rollout. PP-I04 is merged through PR #232 at `a34c7e9a5dc3d48e28ce16af9b031bfa150c60a1`, and issue #222 is Done. The broader custom-rendering release is not approved. |

Preparation and rollback evidence are retained under `.local/deployments/pp-i04-worker/`, including the previous `Cz795m_s` artifact, exact transition/final templates, build audit, reviewed package and approved LF check-service files. The submitted-source worker lifetime checks do not establish network denial, GPU containment or every application lifecycle. `/player-check/security/` now labels its earlier window-source probes as historical and links to the current worker page; the prior reports below remain historical evidence rather than worker results. PP-I05/I06 and the wider release matrix keep their separate scope.

### Historical pre-worker iOS failure

The following investigation records the earlier renderer that evaluated source
on its window thread. PP-I04's later disposable-worker checks passed according
to the owner's accepted mobile reports above. Those reports close PP-I04; they
do not replace missing device metadata or the remaining PP-I03 release matrix.

User-provided Chrome 154, Edge 154 and Firefox 157 reports each passed all 27 deployed fixed safety checks. The Safari 17.6 report passed the 25 boundary/recovery checks but failed both finite CPU-stall checks: the parent timer gap reached 3,807 ms and the combined failure/removal condition was not satisfied at observation. The tester identified that run as an iOS device and also reported failures in BrowserStack iPhone/iPad sessions. Exact device/OS versions and exports for the additional sessions remain unconfirmed. The Mac-style Safari user-agent string is not evidence of desktop Safari coverage.

The report alone does not establish a sandbox escape or Safari's process architecture. The host deliberately discards watchdog observation gaps above two seconds to avoid treating suspended-page time as scene failure. That reset is consistent with the result, but the original report does not contain enough event timing to establish the cause. Its marker was sent before the finite loop began, and its removal result combined failure state with frame disconnection before unconditional fixture cleanup.

The diagnostic verification build exports report schema 2 (`fixed-security-2`). It adds a separately timed benign baseline, child queued/scheduled/start/end markers, host load/progress/watchdog events and separate failure/frame-connected observations. The original 3,600 ms observation and below-1,000 ms parent responsiveness criterion remain; the subsequent 1,200 ms recovery observation cannot change the recorded verdict. The two rows measure removal and parent responsiveness during the scheduled fixed probe, using scheduling evidence as before; queued/scheduled markers alone are explicitly not evidence of loop entry or completion. Teardown can discard a start/end message from the blocked child, so absent messages are not proof the loop never ran. Child elapsed timestamps and parent receipt timestamps are separate; the report caps its allowlisted timeline at 256 events and flags truncation. Cleanup and cancellation preserve the last connected-frame state before removing the test frame.

The fixture uses a 1,000 ms progress timeout; the normal host default remains 10,000 ms. Host watchdog decisions, renderer artifacts, browser policy and release controls are unchanged. After this build is deployed, rerun **Check a bounded CPU stall** on the same iOS and BrowserStack devices with the tab visible, export the version 2 report and record the service/device model/OS. Retain the original reports. This work does not approve iOS playback; keep public custom rendering off until the failed supported-browser path and remaining acceptance work are resolved.

### Browser evidence collection

The fixed HTTPS safety page is built for `https://mage.peterbucci.com/player-check/security/` on the existing dedicated player-check service. It adds the same 17 boundary, eight recovery and two optional finite-stall checks available locally, with retained JSON results and a copyable report. It accepts no shader input or account data. Its bounded canary stores only short-lived random identifiers and request counts; it does not forward requests to MAGE APIs.

The service verifies its exact built assets and integrity hashes at startup, uses a non-root Node 24 runtime, and rejects unknown files, request bodies, excess headers and invalid control requests. Independent review verified the final bundle boundary, artifact hashes, CSP, five HTTP server regression tests and additional malformed-request checks. Fourteen combined policy/report/server tests, two UI initialization tests, TypeScript and lint passed. The final Node 24 Docker image ran healthy as uid 1000 on port 80; all six public file hashes and both private manifests matched the reviewed build. Its HTTP checks passed exact headers, closed routes and canary behavior. Evidence is retained under `.local/deployments/pp-i03-release-verification/`. This service is evidence collection, not a change to renderer isolation or release approval. Deployment and actual browser/device results must still be recorded separately.

The previous dedicated check service was pinned to `70087e7ecb060b0294b3759cbe26fb269d0dbd0a`; its built files are preserved under `.local/deployments/pp-i03-release-verification/player-check-before-security/`. Restore that pin to roll back the check service. The normal app, backend and CloudFront renderer are separate deployments.

At the time of this pre-worker verification, the normal production frontend was `a49a955ff12ecb14c85d898b9cc0082f2ac018e8` (PR #219), backend was `ae03e7399a8364bb0068c90197908b7a80e12aa2` (PR #154), and renderer was `assets/renderer-Cz795m_s.js`, SHA-256 `727bc2abc98ac24026ee99212de43dfcded4d11f5bf331921f55437550f2bad1`. The frontend/backend identifiers remain unchanged by PP-I04; its renderer and check-service deployment above supersede those earlier artifacts. Historical evidence is retained with its original scope.

| Check | Result and scope |
| --- | --- |
| Backend regression | 275 tests across 17 classes passed with no failures/errors/skips using isolated PostgreSQL Testcontainers. Covers validation, shared contracts, release controls, moderator authorization/revocation, source withholding, owner repair and block preservation, concurrency, thumbnails and migrations. Frontend/backend contracts matched after newline normalization. |
| Packaged backend HTTP walkthrough | Ten grouped checks passed using the current packaged backend and a disposable database. Approval off rejected enable; approval on with the saved switch off still withheld source; an explicit administrator enable published eligible source; withdrawing approval suppressed it again. Moderator grant/revoke, owner repair, block preservation, private reasons and cache controls passed. All temporary resources were removed and existing services remained unchanged. This is HTTP/persistence evidence, not a normal-app browser walkthrough. |
| Frontend regression | The initial full run passed 1,835 tests in 134 files and had eight editor timeouts in two files. A controlled single-worker rerun of both files passed all 17 tests in 50.01 seconds with a command-only 30-second default timeout; existing explicit 15-second test limits were unchanged. All 1,843 tests were observed passing across these runs. The initial full command's timeouts remain recorded. TypeScript, lint and production frontend build passed. |
| Renderer hosting | Seven hosting tests and the official live renderer verifier passed against the unchanged `Cz795m_s` artifact, including exact response policies, document/script integrity and rejected paths/methods. |
| Local browser boundaries and failures | The Windows in-app browser (Chromium 154 user agent) passed 17 boundary, eight failure and two finite-stall checks. The three-second child stall's largest observed parent timer gap was 63 ms. The report-enhanced fixture repeated these groups and retained a deliberately cancelled run alongside completed runs. These are local loopback results, not Chrome/Edge/Firefox/Safari device approval. |
| Existing live music check | The deployed fixed check verified the isolated document boundary, generated audio, scene switching, Original response, capture, seek, pause at 7.7 seconds, unavailable-player disposal and successful Retry. This fixed page does not establish saved-scene or owner/account behavior. |
| Production controls | The authenticated administrator page showed saved playback Off and the release lock still active. No production scene, account permission or release setting was changed for these checks. |

Sanitized evidence and logs are retained locally under frontend `.local/deployments/pp-i03-release-verification/` and backend `.local/release-approval-20261004/`. Report export collects fixed check outcomes, timestamps, browser identification and test endpoints only. It does not collect account data, source or storage contents. Cancelled, incomplete and hidden-page runs cannot count as passing; stale asynchronous results cannot be attributed to a newer run.

The connected browser inventory only exposes the Windows in-app browser; requesting desktop Chrome automation returned unavailable. Actual Chrome, Edge, Firefox, Safari and mobile runs remain unverified. No viewport emulation, user-agent string, automated unit test or fixed music sample is counted as a substitute. Public release remains unapproved until the required browser/device and production-equivalent normal-app checks are complete.

## PP-I05 compiled-output policy and deployment

The implementation retains artifact version 1 but adds independent validation
in the worker receiver and the patched engine before graphics allocation. The
compiler channel is now protocol version 2 with fresh job/channel IDs and the
current scene revision, an absolute two-second deadline and at most two replies.
Stale, malformed, oversized and unsupported output fails closed and retires the
worker. Correlation does not make output trusted.

The accepted program uses the installed compiler's exact vertex and fragment
scaffold. UTF-8 limits are 524,288 bytes for the fragment, 65,536 for the vertex,
262,144 each for geometry/color, and 786,432 in aggregate. At most 64 uniquely
named float/vector uniforms are allowed, with finite bounded values and valid
ranges. Host-owned policy independently clamps raymarch iterations to the profile
ceiling (no more than 200), reflections to two and finite step constants to
0.005–1. Existing full/preview pixel, edge, DPR, FPS, effect and capture budgets
remain separate and cannot be raised by an artifact or uniform.

Ordinary Shader Park DSL and finite JavaScript geometry-building loops remain
supported when their output meets the policy. Raw GLSL is not a general supported
escape hatch: GPU loops, arrays/indexing, recursive helpers (including cycles
through trusted functions), arbitrary directives and shader-shell replacements
are rejected. Accepted saved source/settings stay unchanged. Compiler rejection
becomes a fixed `compile` playback error, a removed frame and a stored static
recovery state explaining how to simplify the shader or choose a template.
Retries stay explicit; existing owner repair/export remains available, and raw
worker diagnostics/source never reach the UI.

See [the architecture policy](isolated-renderer.md#pp-i05-compiled-output-policy--local-implementation)
and `.local/pp-i05-budget-compatibility.md` for the code-derived policy and the
16-preset compatibility audit. The final pre-merge application suite passed 1,907
tests, artifact contract 14/14, and focused engine/runtime 128/128. A clean patched
published package compiled all 16 presets and 100 demo fixtures at ceilings 32
and 200. The report compatibility follow-up passed 21 Node and 9 UI tests plus
all three check-page builds. Accepted finite programs can still stress a driver;
this is not a general GPU-containment guarantee.

### Production verification — October 4, 2026

| Item | Recorded result |
| --- | --- |
| Source and rollout | `9f1d50bc2886136999a963cb78770d035fdfeb08`; exact child asset transition first, matching parent services next, then final single-asset policy. No new AWS resources or backend changes. |
| Renderer | `assets/renderer-C_SgAeRr.js`, 17,766,528 bytes; SHA-256 `ce36780ac674085ad38353309f50a1f7f6978d69760b975c1bf10b62f3fec0cc`. Final CloudFormation `UPDATE_COMPLETE`; final document, hash, headers and denied paths verified from CloudShell and the frozen official production verifier. |
| Check service | Coolify deployment `h6gkd6wgx1k079seskcdow9r`, Finished and healthy. Clean LF Docker build, 26 local HTTP checks, and 31/31 deployed checks matched the exact exported runtime files. |
| Normal frontend | Coolify deployment `dtg6r409wrlwkzsifpmzas2a`, Finished. Entry `/assets/index-BnCY9eJE.js`; HTTP 200 with exact `frame-src https://d2wwpgc7sgvmnm.cloudfront.net/index.html`. Aurora Drift Watch playback succeeded with both the prior and updated parent. |
| Live fixed checks | In-app Chromium worker 11/11; maximum parent gap 63 ms, stall termination 2,002.4 ms. Music check exercised test rhythm, scene replacement, seeking, pause/resume, capture and resource cleanup. These are not new mobile/browser-matrix results. |
| Gates | Public `/api/rendering-status`: `enabled: false`, `CUSTOM_RENDERING_DISABLED`. No release approval or global switch changes. |

Frozen artifact, exact templates, rollback source and verification evidence remain
under `.local/deployments/pp-i05-output-policy-9f1d50b/`. The old I04 immutable asset
and versioned document remain available for the reviewed rollback procedure.

## Production rollout — October 3, 2026

The frontend runtime commit is `70087e7ecb060b0294b3759cbe26fb269d0dbd0a`, pushed on `pp-i03-isolated-player-integration`. The backend commit is `28c3c84ba290f1fd852537d89978e3ad276e5d20`. The following statuses describe observed operations, not an assumption that every service or verification step has completed.

| Component/check | Observed status |
| --- | --- |
| Backend deployment | Coolify deployment `owdhr7fd606duqxzui2fzjr6` completed for the backend commit above. Migrations 18 and 19 succeeded. The existing `qui2u58zdesarnjtr1vfgqfy_postgres-data` volume was preserved. |
| API routing | Prefix stripping is off, restoring the `/api` path expected by the backend. Public status returned HTTP 200 with custom rendering disabled. Unauthenticated admin and repair requests returned HTTP 401. These denials do not establish authenticated operator/owner success. |
| Existing scenes | All 16 existing scene rows remain subject to the legacy-upgrade requirement. Their stored data was preserved; deployment did not relabel or automatically upgrade them. |
| Renderer deployment | `assets/renderer-Ci9Tz163.js` and its matching entry document are live on the existing CloudFront renderer. Both the exact two-hash transition and subsequent final single-hash stack update reached `UPDATE_COMPLETE`. The final helper and official `npm run renderer:verify:production` both passed; the latter exited 0 with `MAGE_RENDERER_VERIFY_ORIGIN=https://d2wwpgc7sgvmnm.cloudfront.net`, checking exact headers, document/SRI, immutable script, forbidden paths and POST rejection. |
| Old parent compatibility | The deployed PP-I02 check at commit `4c0f9e11d54f4e8a1aada362ac3373769329b49c` worked with the new child: rendered scene and isolation checks passed, generated audio reached 15.4 seconds, and scene switching, capture and Stop worked. Its unavailable-player check failed safely, removed the iframe and offered Retry. |
| New verification parent | Coolify deployment `ow1y3tgnv8v9x7fkxx3pv6cv` finished for runtime commit `70087e7`. The live `check-BohxKod2.js` asset passed SRI verification. Start, generated audio, Original response, scene switching and capture passed against the new child. |
| Initial normal frontend deployment | Coolify deployment `i6bqctj14mfkf3qdd8k0qzgf` finished with `index-BFvbeYDA`. The real editor rendered Ripple Rings in the CloudFront iframe with only `allow-scripts`, played a 90-second WAV to 20.38 seconds and displayed Selective capability controls. An inherited build setting produced `/api/api` requests and HTTP 404 for editor tags; this initial deployment was not fully functional. |
| Corrected normal frontend | Production `VITE_API_BASE_URL` was corrected to `/api`. Coolify deployment `hqsa7gj16560y4v2t5i9201v` finished for the same runtime commit. At 21:01:08 UTC, the public page served `index-BcVPG3Jh.js` with the exact `/api` base; `/api/tags` returned HTTP 200, and the expected frame CSP and `nosniff` headers were present. |
| Corrected live editor | After reload, editor tags loaded without the prior 404 and Capture Thumbnail succeeded. The parent contained zero canvases; the player used the fixed CloudFront `/index.html` iframe with `credentialless` enabled and exactly `sandbox="allow-scripts"`. On the final corrected bundle, music continued from 17.68 to 18.20 seconds through Original → Selective, then reached 28 seconds after selecting Bass, without failure. Evidence is saved locally at `.local/deployment-evidence/pp-i03-live-editor-music.jpg`. |
| Live global pause/resume | Pause all removed the iframe. Turning it off restored a new iframe and music was observed at 9.08 seconds. This result uses the observed final UI/player state: the automation acknowledgement timed out after the temporary control disappeared. |
| Corrected live Home | Featured Phonk101 metadata, cards and the Ambient tag loaded without an API load error. Existing legacy scene source remained withheld under the expected upgrade requirement; displaying their metadata is not a claim that those old scenes played. |
| Public custom release | Disabled. The wider production-equivalent adversarial/browser matrix and release approval have not been completed. |

Before the backend cutover, database dumps were saved on the host at:

- `/data/coolify/backups/mage-pp-i03-20261003-preflight/database.dump`
- `/data/coolify/backups/mage-pp-i03-20261003-cutover/database.dump`

Both recorded dumps are 47,958 bytes with mode `0600`. The cutover dump was taken after stopping the old writer; its SHA-256 is `ac71f5ea93ad7956acbe430f92e4c368dd735ea633f8b3c5f10d0de7e4931fa5`. A preserved dump and hash are backup evidence, not a claim that a restore drill has been performed. Keep these files private and retain the live database volume.

The new renderer is 17,024,678 bytes, with SHA-256 `2b42ae7a8828305aec00e126b37a6595ef7f866528f71bac3363eaf1b5acec3d` and integrity `sha384-u9Efhm1bynfPHq4SzLhmWzYRHJpxR7qOhLPdN+HMJ0Dmk2jqTx0sH9SkZu7pEwgv`. Its allowed parent remains exactly `https://mage.peterbucci.com`. The temporary transition permitted only `/`, `/index.html`, the previous `assets/renderer-CutVKi26.js` and the new exact bundle path, with both exact script hashes. The final policy serves only the new bundle path/hash alongside the entry document. Artifact/transition verification and all seven hosting regression tests passed before upload; the four changed resources were the file allowlist, two response-header policies and distribution cache behaviors.

The previous complete production renderer artifact is preserved in `.local/deployments/pp-i02-before-i03/dist-isolated-renderer-production/`, with all five files hash-verified before the rebuild. The transition template and review record are in `.local/deployments/pp-i03-transition/`; the new final template is `dist-isolated-renderer-production/cloudformation.json`. Keep both generations through the rollback window. Do not downgrade the child before restoring a compatible parent.

## Selective response follow-up — October 3, 2026

The initial isolated child applied music-response settings before selecting the response mode. Selecting the mode reset those settings, so the displayed Amount could disagree with the effective response; Amount 0 could still produce strong distortion. Commit `5e8447cb90686329b53319484ec507d0f036d262` changes only the child adapter and its tests: select a changed mode first, then apply the requested configuration, and skip duplicate settings. Same-mode edits preserve analysis sessions and the existing response curve. The engine package patch is unchanged.

This is a child-only release. The deployed artifact is `assets/renderer-Cz795m_s.js` (17,024,992 bytes), SHA-256 `727bc2abc98ac24026ee99212de43dfcded4d11f5bf331921f55437550f2bad1`, with integrity `sha384-A91wJ3H79vtGpXZjLddhsOmd0hzlB40YcfH4/8UArPag16Kjl+MHBo13tjMntjXo`. The normal frontend and verification parent remain pinned to runtime commit `70087e7`; the backend remains at `28c3c84`. This update does not require a Coolify rebuild, database migration or permission change, and public custom rendering remains disabled.

| Check | Recorded result |
| --- | --- |
| Focused regression validation | 241 tests in 19 files passed, including response ordering, duplicate updates and isolation/playback coverage. TypeScript, lint and the production renderer build passed; independent code review found no outstanding issue. |
| Local Amount behavior | In the actual local editor, Amount 0 showed the base orb, 0.1 showed visible moderate deformation, and 0.4 showed much stronger movement that filled the screen. These are qualitative observations, not a measured response curve or a claim that stronger settings cannot fill the viewport. Before the fix, Amount 0 still produced full-screen distortion. |
| Local evidence | `.local/deployment-evidence/pp-i03-selective-before-zero.jpg` and `.local/deployment-evidence/pp-i03-selective-fixed-local-zero.jpg` record the before/after Amount 0 comparison. |
| Deployment preparation | The five-file `Ci9Tz163` baseline and checksums are preserved under `.local/deployments/pp-i03-selective-fix/baseline/`. Both artifacts, the exact two-hash transition and the expected four-resource template diff passed verification. Package checksums, eight mocked AWS safety tests and all 14 archived file bytes passed before upload. |
| AWS transition and document switch | The transition reached `UPDATE_COMPLETE` with its matching completion token verified. The document switch then verified the exact new document, bundle hash, response headers and blocked paths at the live CloudFront edge. |
| Live Selective response | A fresh production editor page used Selective response with Simulate beat: Amount 0 showed the base orb, 0.1 moderate deformation, and 0.4 strong movement that filled the screen. Returning to Amount 0 and loading the 90-second WAV kept the base orb. With Amount 0.1, changing hit sensitivity from 0.1 to 3 preserved the song; its counter progressed through 28, 35 and 48 seconds without restarting. These are observed UI/playback results, not a measured response curve. |
| Live evidence | `.local/deployment-evidence/pp-i03-selective-fixed-live-zero.jpg` and `.local/deployment-evidence/pp-i03-selective-fixed-live-low.jpg`. |
| Final policy and official HTTP verification | The final change set contained exactly four Modify changes without replacement and reached `UPDATE_COMPLETE`; the deployment helper verified its matching latest stack-completion token and CloudFront `Deployed` state. `verify-final` passed for the exact new document, single approved bundle hash, headers and blocked paths. The official `npm run renderer:verify:production` also passed (exit 0) against `https://d2wwpgc7sgvmnm.cloudfront.net` with the matching `Cz795m_s` production artifact. |

The completed change sets are `pp-i03-selective-transition-5e8447c` and `pp-i03-selective-final-5e8447c`. Their temporary transition allowed only the prior `Ci9Tz163` and new `Cz795m_s` bundle paths/hashes alongside the entry document; the final policy permits only `Cz795m_s`. The existing deployment helper retains exact account/stack checks, four Modify changes without replacement, conditional document replacement and completed-change-set verification. No broader hosting policy is part of this correction. The unchanged parents are compatible with either child; rollback of this correction can restore the saved `Ci9Tz163` artifact through its exact-hash transition without downgrading those parents.

## Integration closeout — October 3, 2026

The following checks supplement the earlier evidence. Browser results use Chromium 154 on Windows with the actual local parent at `http://127.0.0.1:5178` and separate renderer at `http://localhost:5181/index.html`. They do not extend the recorded browser support or substitute for authenticated production verification.

| Check | Observed result |
| --- | --- |
| Repeated browser boundary and recovery checks | All 17 boundary checks and eight failure checks passed again. The separate, finite three-second CPU probe passed both checks with a largest observed parent timer gap of 64 ms. The scheduling marker was received and the iframe was removed; the historical marker does not prove loop entry/completion. This is not an infinite-loop or GPU-hang claim. |
| Isolated availability fixture | A simulated server disable was observed through normal polling in 6,482 ms. The original iframe was removed, the unavailable panel appeared and the parent contained zero scene canvases. The page-local fixture did not change backend permissions or production release approval. |
| Re-enable and focus continuity fixtures | Re-enable preserved the recorded local failure with no frame; only explicit Retry created a new isolated frame, with zero parent scene canvases. The focus check retained the same frame: audio paused at 65.13 seconds and resumed at 66.17 seconds after fresh permission, without restarting. Confirmed denial removed the frame and displayed the unavailable panel. The fixture now loads its silent track while paused and requires **Start test audio** before checking continuity, so browser autoplay restrictions cannot be mistaken for a failed permission check. |
| Owner edit and JSON export | Local owner editing of scene 25 used the exact local renderer iframe with only `allow-scripts` and zero parent scene canvases. The downloaded `scene-25.json` was a valid `reaction-rings-v1` template document. This confirms the observed editing/export path; it does not by itself establish every disabled or unsupported-source repair case. |
| Authenticated local operator and owner walkthrough | A temporarily allowlisted local operator disabled dedicated template scene 27 through the actual UI. Its iframe disappeared, metadata remained and the parent contained zero scene canvases. The owner's disabled editor retained its fields, disabled capture and allocated no iframe; downloading the JSON produced a valid template. Re-enable restored server permission. After a development-page reload, local recovery still required deliberate Retry, which restored the frame; re-enable was not recorded as clearing local crash history or automatically restarting playback. |
| Local API authorization and restoration | Guest admin access returned 401; an ordinary account's admin access and attempted re-enable returned 403. Disable was reflected by the next public status request 25 ms after the committed response; this HTTP interval is separate from the browser polling measurement. Disabled detail/list responses retained metadata but withheld source, owner repair returned `playable: false`, and an owner save preserved the operator block and private audit. Re-enable restored source. The original local backend configuration was restored afterward: no operator allowlist, release approval false and global custom rendering disabled; the formerly allowlisted account's admin request then returned 403. No production permission was changed. |
| Focused frontend regression checks | 329 isolation/facade/recovery tests in 21 files and 461 contract/policy/editor/hover tests in 11 files passed: 790 tests total. This is a targeted closeout run, separate from the earlier full-suite result. |
| Backend authorization regression checks | 30 tests passed with zero failures/errors/skips using PostgreSQL test containers: availability controller integration/unit tests, custom-release gate integration tests and operator access tests. They cover source withholding, repair-save block persistence, audit idempotency, re-enable and release-gate 409 responses. These local tests do not claim a production operator walkthrough. |
| Security and hosting checks | All 18 Node tests passed: 11 fixed security/import/canary tests and seven hosting tests. These include installed-parser execution of the fixed probes and exact header/path policy checks. |
| Shared contracts | Frontend/backend scene fixtures, limits, schema and template catalog matched exactly after normalizing line endings. The frontend tests exercised the shared fixture expectations and strict template/custom classification. |

Local screenshots are saved at `.local/deployment-evidence/pp-r03-isolated-focus-denial.jpg`, `.local/deployment-evidence/pp-r03-isolated-reenable.jpg` and `.local/deployment-evidence/pp-r03-disabled-owner-export.jpg`. The focused backend test log is `.local/pp-r03-closure-tests.log` in the backend checkout. These records contain local verification; they do not change the production deployment identifiers above.

The normal-player isolation work and its availability integration have completed the recorded integration checks. The public custom-release decision remains blocked on the required release matrix below. Only the recorded checks are claimed complete; untested browsers, additional production-equivalent surface/adversarial checks and authenticated production operator/owner walkthroughs remain unapproved. No parent fallback, relaxed sandbox or client-side override is provided for those paths.

## Execution boundary

All submitted scene paths use `createMagePlayer()` → `isolatedController.ts` → the private MessagePort bridge → the separate renderer: Home/featured scenes, Watch, editor create/edit/import previews, discovery/profile hover previews and captures. Template documents also use the separate renderer; their immutable source is resolved there. Legacy/custom source remains untrusted even when it matches a template.

The fixed, bundled `BRAND_SCENE` object is the only in-page engine exception. The adapter requires its exact object identity, the explicit internal artwork option and no saved scene ID. A copied object or user-selected trust flag cannot authorize this path. Parent runtime imports and developer rendering harnesses are checked by `scripts/isolated-security-imports.test.mjs`; tests also exercise the facade and invalid-brand attempts. The static import check is a regression guard, not a proof that arbitrary future code is safe.

The parent retains account access, owner editing/export, availability checks, crash recovery, playlist/audio transport and controls. It sends validated scene data, bounded numeric audio/control state and capture requests. The child receives no account credentials, profile objects, authenticated fetch instructions or selected audio files. Unsupported origins, bad documents, unavailable rendering, failed startup, invalid replies and retry failure leave a static error/recovery state. None selects a parent compilation fallback.

Saved scenes need fresh per-scene availability. Custom drafts/imports need global custom permission; valid new catalog templates have their narrower template permission. Focus restoration rechecks permission while suspending the current renderer; confirmation resumes it, and denial disposes it. Capture and audio work cannot complete into a revoked or replaced scene. Local retry does not override server denial. Recovery markers are owned outside the frame and survive until the corresponding renderer has actually stopped.

The new parent can request a bounded target capability list and update numeric audio-response settings without reloading the scene or song. These optional v2 commands are new in PP-I03: an old PP-I02 child rejects them. This requires **child-first deployment and parent-first rollback**.

## Local evidence

These browser results are from **Chromium 154 on Windows**, using `http://127.0.0.1:5178` as the parent and `http://localhost:5181/index.html` as the renderer with real response-header CSP/sandbox. They do not establish behavior in Firefox, Safari, other Chromium configurations, mobile browsers or the production HTTPS deployment.

| Check | Result | Scope and limits |
| --- | --- | --- |
| Browser boundary group | 17/17 passed | Actual parent/child DOM isolation; cookie, localStorage, sessionStorage and IndexedDB denial; popups and parent navigation; no local canary requests from fetch, XHR, beacon, image, WebSocket or form; child self-navigation blocked or safely retired. |
| Browser failure group | 8/8 passed | Proven window-message spoof ignored; thrown source and invalid source fail closed; proven unknown private-port command and bounded output flood rejected; WebGL context loss and child reload retire the frame; no-response startup expires. |
| Finite CPU probe | 2/2 passed | The fixed finite-loop probe was scheduled; the frame was retired and the parent remained responsive. The historical marker does not prove loop entry/completion. Largest observed parent timer gap was 63 ms. This was not an infinite loop or GPU-hang test. |
| Normal editor preview | Passed locally | Actual iframe at the fixed child URL with `sandbox="allow-scripts"`; thumbnail capture produced a preview; a 90-second WAV played in the parent. Music advanced from 28.64 to 37.14 seconds, continued through a Ripple Rings switch at 47 seconds, and remained paused at 70.2506666 seconds through a Mint Halo switch. Selective controls received capabilities. |
| Home and Watch | Passed locally | Featured scene 26 and `/scenes/26` used actual isolated frames; real WAV playback reached 40.92 and 19.96 seconds respectively. |
| Successful retry history | Passed locally | Scene 26 played in the in-app browser after retry, reload, navigation to Home and return to Watch without the old warning. Its original failure cause remains unknown. Automated cases cover ten seconds of foreground progress, newer failure precedence, pause/visibility resets and retained active markers. |
| Editor simulated beat and recovery | Passed locally | Simulated beat visibly deformed the scene without loaded audio. Pause all removed the frame and unpause restored it. Stop plus reload retained the paused state; deliberate retry restored the frame. |
| Rapid editor updates | Passed locally | Twelve scale changes in roughly half a second coalesced to the final value of 22 and rendered without failure. |
| Shared preview entry points | Automated coverage passed | Hover/profile paths use the guarded shared facade. The Home/Watch checks above are not a claim of a separate manual hover/profile walkthrough; include these surfaces in the release browser matrix. |
| Isolated render-budget fixture | 5/5 viewport cases passed locally | Full/preview profiles, a 7,680 × 4,320 resize and captures remained bounded. Requests for 10,000 × 10,000 captures were fitted to the shared 230,400-pixel / 640-edge ceilings. Captures were spaced at least 550 ms apart to respect the two-per-second limit. |
| Fixed security Node tests | 11 passed | Canary request/session bounds, malformed registrations, expiry, WebSocket handling, parent import guard and installed ShaderPark parser execution of the fixed probes. The finite-loop test uses an advancing mock clock, not a real CPU stall. |
| Backend regression suite | 159 passed locally | Submission, versioned transport and availability/release controls. A passing local suite does not verify deployed backend configuration. |
| Shared frontend/backend contracts | Matched | Scene fixtures, limits, schema and template catalog match after normalizing line endings. Source classification and resource policy must stay consistent across deployments. |
| Production frontend build and clean Docker build | Passed locally | Includes TypeScript, clean dependency patch application and nginx configuration validation. The local container returned HTTP 200 with the exact CloudFront `/index.html` frame policy and `nosniff`; it was removed after verification. This is local artifact validation, not a deployed-site check. |
| Full frontend regression suite | 1,742 passed in 130 files | Re-run after the successful-retry history fix; TypeScript and lint also passed. |
| PP-I03 production HTTPS and additional browser engines | Deployment smoke checks passed; wider release matrix incomplete | Old/new live check parents, corrected normal editor/Home and both final production verifiers passed the recorded checks. The wider surface/adversarial/browser matrix remains pending. Keep public custom execution disabled. |

The security fixture is `/scripts/isolated-security-check.html`, available only on the exact local development origin. Run **Check browser boundaries**, **Check failure recovery**, then the separately opted-in **Check a bounded CPU stall**. **Stop checks** removes its player. It does not enable backend custom rendering or offer arbitrary source input.

The fixture sends only fixed test programs. Diagnostic messages contain a fresh nonce and booleans, checked against the exact frame, opaque origin and a bounded schema; no actual cookie/storage values are read out or retained. Destructive probes report setup before a short delay to reduce lost diagnostic evidence during frame teardown. The historical CPU marker proves scheduling only, not loop entry/completion; schema 2 distinguishes these stages. Thrown/invalid source rows report rejected load, not an unobserved execution claim; installed-parser Node tests separately confirm the fixed deliberate throw. These diagnostics are fixture-only and are not accepted by the production playback host.

The Vite-only canary counts attempts at a local dummy endpoint, including WebSocket upgrades. It does not call a real account API, perform authenticated mutations, or log headers, bodies or secrets. Registrations require the exact parent origin and a 32-hex nonce, reject bodies/unknown fields, expire after five minutes, allow at most 32 sessions and saturate counts at 1,000. No production canary endpoint is installed. Repeat relevant boundary checks against controlled production-equivalent endpoints before approving public execution.

Useful local commands (run from the frontend checkout):

```powershell
npm run test:isolation-security
npx vitest run src/modules/player/isolation src/modules/player/infrastructure/isolatedController.test.ts src/isolated-renderer
npm run renderer:build
npm run renderer:serve
```

`npm test` also runs the 11 security tests through its `pretest` hook. The renderer server holds the verified build in memory. Restart it after rebuilding, then run `npm run renderer:verify`. The parent development server and child must contain matching protocol changes. See the architecture document for the production build/verifier and optional fixed-sample HTTPS setup.

## Required release matrix

For each browser/version/OS the product intends to support, record the exact frontend commit, backend commit/configuration, child bundle/hash, date and result. A failed or untested custom execution path stays disabled; do not work around it with parent compilation, a broader CSP, extra sandbox flags or a broader origin allowlist.

| Area | Required production-equivalent checks |
| --- | --- |
| Every entry point | Home/featured, Watch, create, edit, imported JSON, discovery/profile hover and captures run submitted source only in the separate frame. Bad source, missing child, unsupported site, retries and failed loads never create a parent engine. |
| Normal playback | Template and permitted custom source; real and simulated music; seek/volume; both response modes and live edits; pointer/drag/zoom; resize; bounded capture; rapid scene changes; pause preservation; disposal and retry. Verify stale loads/audio/captures cannot affect the next scene. |
| Browser boundary | Parent DOM, cookies/storage, popups, parent navigation, own-frame navigation/redirect, unauthorised network/API attempts, exact-source/session spoofing and bounded malformed/flooded messages. Record server-side canary counts as well as browser observations. |
| Failure behavior | Throw, compile rejection, no response, finite CPU stall, context loss, child reload and page lifecycle. Parent controls and owner data remain usable; the failed frame is retired and the revision requires the appropriate retry. |
| PP-B02 / PP-V01 / PP-V02 | Versioned documents and all shared fixtures agree across frontend/backend. Malformed markers, unknown fields, excessive bytes/workload/effects and forged templates are rejected; legacy upgrade rules remain enforced. |
| PP-R01 | Stop/resume, global pause, observed failure and interrupted reload, revision identity, storage unavailable/corrupt and deliberate retry. Clearing local history must not grant server permission. |
| PP-R02 / PP-R03 | Per-scene and global disable stop active foreground rendering within the documented bound; stale/missing/offline status fails closed; re-enable does not erase a local failure. Verify ordinary users cannot manage availability and private operator reasons stay private. |
| Owner recovery | Disabled/failed/unsupported scenes can be opened by their owner for permitted editing and JSON export without executing their source. Account changes and stale responses cannot disclose another owner's repair document. |

The three-second CPU result is limited evidence that this Chromium configuration kept the parent responsive. No test here intentionally creates an infinite loop, GPU hang or unlimited memory allocation. Separate sites do not guarantee separate GPU processes, and WebGL driver/browser defects remain possible. A hostile renderer may forge progress, allocate before a message is validated, or evade cooperative render limits. Paused/background timeouts are suspended intentionally. Do not describe heartbeat delivery, iframe removal or finite-loop success as a universal CPU/GPU containment guarantee. Record failing browser behavior and leave public custom execution off for unsupported paths.

## Deployment and enablement

1. Keep `MAGE_CUSTOM_RENDERING_RELEASE_APPROVED=false` in the production backend and global custom rendering disabled. Preserve immutable prior child/parent artifacts, manifests, deployment identifiers and backend configuration. Do not enable the gate just to test a UI. Use a controlled staging/local backend and fixed fixtures for custom-source checks.
2. Finish the release matrix and regression/build checks for the intended artifacts. Verify the deployed backend includes PP-B02, PP-V01/V02 and PP-R02/R03 behavior, not merely the checked-out source. Confirm authenticated operator disable and owner repair work in the production-like environment.
3. Build the production renderer for the exact parent `https://mage.peterbucci.com`. Deploy the new child to the existing private-S3/CloudFront host using the reviewed two-hash transition in [the hosting procedure](isolated-renderer.md): upload the immutable script, allow only the exact old/new hashes and paths, wait for propagation, then upload the new no-store `index.html` last. Keep sandbox/CSP/permissions/origin restrictions intact. Test old v1 and PP-I02 parents against the backward-compatible child before changing a parent.
4. Deploy the new verification parent and then the normal frontend using the matching PP-I03 commit. Its response must restrict `frame-src` to `https://d2wwpgc7sgvmnm.cloudfront.net/index.html`; inspect the real HTTP response rather than only the repository nginx file. Smoke-test templates and fixed checks while the public custom gate stays off. Verify the new capability and live audio-response commands, authoring/capture, availability/recovery and stop/retry. Record the actual production release identifiers; do not infer success from a completed build.
5. Complete controlled production-equivalent custom and browser-matrix verification. After the release owner approves the recorded evidence, set the backend environment release approval and redeploy it. This only removes the release interlock; a server-authorized operator must separately enable the persisted global custom-rendering control. Public `/api/rendering-status` and `/api/scene-availability` responses must confirm the intended state. Ordinary owners and client settings cannot grant it.
6. Observe normal entry points and the disable/re-enable walkthrough with the exact deployed artifacts. Finalize CloudFront to the single new hash/path only after compatible-parent verification, then run the matching production HTTP verifier. Preserve old immutable files for rollback and record approvals/results here. A failed criterion leaves public custom execution disabled.

## Rollback

1. Disable global custom rendering through the authenticated operator control first, verify the public status, and confirm foreground custom players stop. If backend permissions/configuration are uncertain, keep the release approval false and restore the known restrictive backend configuration. Do not turn off validation or availability polling to recover service.
2. Restore a compatible previous parent before downgrading the child. New PP-I03 parents send commands the PP-I02 child does not understand; leave the backward-compatible new child available while old/new parent tabs coexist. Ask users of cached incompatible tabs to refresh. The rollback target must retain the versioned submission contract; do not reintroduce an old authoring client that cannot write current documents.
3. If a child rollback is also necessary, use the saved exact-hash transition policy, wait for propagation, restore the matching old `index.html`, verify with the compatible parent, then restore its final single-hash policy. Never relax sandbox/CSP, permit arbitrary hosts or add an in-page fallback. Old immutable S3 versions remain private except for the exact paths intentionally served by the reviewed policy.
4. Leave custom rendering disabled until the revised matrix passes again. Preserve submitted data, owner repair/export and recovery records; a rollback does not require rewriting scenes or deleting browser storage. Record the failure, artifact IDs and restored configuration.

## Local recovery data and owner editing/export

Recovery stores bounded metadata, not scene source: `mage.scene-recovery.v1` in localStorage holds up to 64 records with seven-day expiry; `mage.scene-recovery.active.v1` in sessionStorage holds up to 32 active markers. Values are opaque revision keys, owner IDs, timestamps, fixed failure codes and safe-mode state. Corrupt/unavailable storage falls back to guarded memory. This is **not draft autosave**: editor fields and selected audio survive replacing the renderer in the current page, but an entire page crash/reload can lose unsaved changes and local file selections.

An authenticated owner can use `/api/scenes/{id}/repair` to obtain withheld source for editing/export. That response does not authorize playback. The editor keeps the saved ID, document identity and server permission; unsupported stored versions are export-only. Valid edits preview only when the separate renderer and fresh availability permit it. Saving a repaired legacy scene upgrades transport but does not clear an operator disable or enable the global gate.

**Confirm → Raw JSON → Download scene JSON** exports the retained draft, including invalid values needing repair, without rendering it. Disabled capture does not disable this export. A failed preview or release rollback must not replace the owner's source with a default, clear their fields, or silently relabel custom source as a trusted template. See [scene recovery](scene-recovery.md), [scene availability](scene-availability.md) and the [editor contract](../src/modules/scene-editor/README.md) for detailed behavior; their historical verification sections describe the earlier stories.

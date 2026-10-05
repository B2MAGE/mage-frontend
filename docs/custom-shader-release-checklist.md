# Custom-shader release checklist

The requested release covers Chrome, Edge, Firefox and Safari, including mobile. Keep the production release setting and persisted custom-playback control off until the required evidence is complete and the release owner approves it. A fixed-fixture pass or a local Chromium run does not approve another browser, operating system, device or application path.

Use this checklist alongside [the integration and release record](isolated-renderer-release.md) and [the player lifecycle evidence map](isolated-player-lifecycle.md). Copy [the result template](custom-shader-release-result.template.json) for each actual browser/device/environment combination. The template's schema version describes the manual release record; it is separate from each fixture's exported report schema and test version. Record failures and missing checks explicitly.

## Current architecture and historical checks

Submitted source now compiles in a fresh disposable worker inside the separate renderer. The renderer accepts a validated compiled artifact; source cannot select an in-page compilation fallback. PP-I04 changed the compilation lifetime, PP-I05 restricted its output, and PP-I06 integrated cancellation, visual suspension, audio and scene ownership. Record the deployed artifact set from the release record before testing; implementation or a merged story alone is not deployment evidence.

`/player-check/worker/` is the current compiler lifetime/CPU check. Its earlier `fixed-worker-1` report contains 11 checks, including an observed finite-loop entry, termination before the three-second loop limit under the two-second deadline, parent responsiveness, cancellation, fresh jobs and no surviving delayed callback. That version explicitly excludes network, GPU and normal-application verification.

The deployed I03 boundary update uses `fixed-worker-2` and report schema 2 at the same path. The current build declares 19 rows (11 lifetime checks and eight boundary observations); match that count to the exported report. It separates actual compiler-worker API-probe/lifetime evidence from a fixed 600 ms observation worker under the same opaque child/CSP. The observation covers fetch, XMLHttpRequest, importScripts, IndexedDB and CacheStorage, with a parent canary positive control and attempted/settled markers. It does not add a WebSocket probe, and does not collect source, raw errors, storage values or credentials. These are distinct observations: the compiler closes after its synchronous job, whereas the fixed observation worker remains alive for the bounded CSP check. The [release record](isolated-renderer-release.md#i03-verification-fixture-deployment--october-5-2026-utc) identifies the verified deployment and local/live in-app Chromium results; the requested real-browser/device matrix remains incomplete. CacheStorage `NOT_EXPOSED` proves the property is absent, not that an opening was denied. An exposed API must reject opening; an exposed but unusable API fails the check.

The earlier groups at `/player-check/security/` and its local equivalent are **historical**, including the 17 boundary, eight recovery and two finite-stall counts. Their source programs assume window/document APIs that the compiler worker does not have. Early compilation rejection or zero canary requests from a probe that never reached its network calls is not a passing worker-boundary test. Do not use those expected counts or rerun the old iframe stall as the current worker acceptance criterion.

The deployed I03 update also adds the `recovery` group at the existing `/player-check/security/` path. Its report is `fixed-security-3`, schema 3; each current run identifies fixture version `fixed-renderer-recovery-1` and coverage `current-renderer-recovery`. Its seven cases are missing readiness, ignored window spoof, unknown private-port instruction, a bounded 50-message flood, actual context loss, actual iframe reload, and a fresh healthy retry after observed failure. Trusted fixed actions exercise the real runtime without accepting arbitrary code, source or URLs. A missing context-loss extension produces `UNSUPPORTED`, which is non-passing. The older `boundary`, `failures` and `stall` groups remain historical even when exported in the newer report format. Local and deployed runs are recorded separately against their matching artifacts.

The original failing iOS report remains evidence about its original build. Replacing that architecture does not turn the failure into a pass; current worker/device results must be recorded separately. Historical source-driven DOM probes do not establish renderer recovery on the worker architecture, and the new renderer-recovery group does not supersede the worker CPU/lifetime checks.

## Browser coverage to record

Every cell below means **current release matrix NOT COMPLETE**. Recorded narrower or historical results are listed separately; none is a full current-build browser approval. Record exact browser and OS versions and the actual device. Phone and tablet results are separate if both are to be supported. Test the installed versions rather than claiming all versions are supported.

| Browser | Desktop | Mobile |
| --- | --- | --- |
| Chrome | Windows: NOT COMPLETE; macOS: NOT COMPLETE | Android: NOT COMPLETE; iOS/iPadOS: NOT COMPLETE |
| Edge | Windows: NOT COMPLETE; macOS: NOT COMPLETE | Android: NOT COMPLETE; iOS/iPadOS: NOT COMPLETE |
| Firefox | Windows: NOT COMPLETE; macOS: NOT COMPLETE | Android: NOT COMPLETE; iOS/iPadOS: NOT COMPLETE |
| Safari | macOS: NOT COMPLETE | iOS: NOT COMPLETE; iPadOS: NOT COMPLETE |

Safari on Windows or Android is not a release target. A browser brand on one OS does not establish its behavior on another. Leave individual unrun checks `NOT_RUN`, failed checks `FAIL`, and record unavailable platforms as blockers; do not silently narrow this scope. Viewport or user-agent emulation is not a physical-device result. For remote-device services, record the service, actual device/OS and sanitized session reference, and distinguish a real device from an emulator.

The owner subsequently reported both current fixed-page groups passing on the previously tested browser/device set. This satisfies those fixture groups as user-reported evidence; the table above still tracks the full application release, not just those two tests. See the current report below before requesting repeat runs.

### Evidence already received

| Evidence | Established result | Remaining limits |
| --- | --- | --- |
| Pre-worker user exports, October 4, 2026 | Chrome 154, Edge 154 and Firefox 157 reports with Windows user-agent strings each passed all 27 historical fixed checks. | Not current-worker, music or normal-app release evidence; exact OS/device metadata still needs recording. |
| Pre-worker Safari 17.6 export | 17 boundary and eight recovery checks passed; both finite-stall checks failed, with a 3,807 ms parent timer gap. The tester identified an iOS device despite its Mac-style user-agent string. | Exact device/OS unconfirmed. This is not desktop Safari coverage. Keep the original failure and artifact context. |
| Other pre-worker BrowserStack iPhone/iPad reports | The tester reported failures. | Exports, session configuration, device/OS versions and exact failed checks were not supplied. Do not infer their cause or outcome. |
| PP-I04 mobile worker checks | Owner-accepted, user-reported passes on Pixel / Chrome / Android 17 and an Apple device / Safari / iOS, described as the latest iOS. | Exact hardware models, browser versions, Apple OS version and exported mobile JSON were not supplied. These closed I04; they do not complete I03 or establish an independent mobile run. |
| PP-I05 deployed fixed checks | Windows in-app Chromium passed worker 11/11; recorded music checks exercised playback, switching, seek, pause/resume, capture and cleanup. | Fixed-fixture evidence for the recorded I05 artifacts, not a new Chrome/Edge/Firefox/Safari matrix. |
| PP-I06 local lifecycle evidence | Automated coverage and a focused local in-app browser walkthrough cover cancellation, switching/audio, pause preservation and editor capture. | See the lifecycle evidence map for exact scope and the release record for subsequent deployment status. Remaining real-device/application checks below are not implied to have passed. |
| I03 deployed fixtures, October 5, 2026 UTC | `5f5295e`: Windows in-app Chromium 154 passed worker 19/19 and current recovery 7/7, including actual context loss. Canary positive control recorded three requests and worker probes zero; CacheStorage was `NOT_EXPOSED`. Fixed music/capture/cleanup and Watch scene15 smoke passed. | Current-artifact fixture evidence only; not independent Chrome/Edge/Firefox/Safari or mobile approval. PP-I03 remains To Verify and public release NOT APPROVED. |
| Owner report after current I03 deployment | Both current worker and recovery groups passed in "all the browsers we tested last time": the previously discussed desktop Chrome/Edge/Firefox, Pixel/Chrome/Android 17 and Apple/Safari/iOS set. | User-reported PASS; no new exports or exact version/device details supplied. Do not infer additional platform combinations, independent verification or completion of the remaining normal-app walkthrough. |

Original browser exports and hashes remain under `.local/deployments/pp-i03-release-verification/user-browser-reports-20261004/` and are recorded in [PP-I03](https://github.com/B2MAGE/mage-frontend/issues/204). Keep historical files unchanged. Link a new result to its own artifacts instead of relabelling an old result.

## Freeze the test environment

Record the frontend and backend commit/image, check-service commit/image, renderer bundle path and integrity, embedded compiler-worker integrity and compiler/artifact protocol versions. For every fixture export, record its test version, report schema, expected row count, evidence file and checksum. Record the exact parent/renderer URLs, backend release approval and persisted global setting. Capture actual HTTP policies with the matching renderer verifier; a build alone does not verify deployment.

Use dedicated accounts and scenes for mutations. Custom-source permission checks require a controlled backend with its own database and storage; do not enable public custom playback just to test. Retain and restore the starting scene/control state. Evidence must not contain tokens, passwords, storage values, private reasons or arbitrary scene source.

The normal local pair is parent `http://127.0.0.1:5178` and renderer `http://localhost:5181/index.html`. The local worker fixture uses its dedicated child at `http://localhost:5182/index.html`. These servers hold verified builds in memory: rebuild and restart the matching server after code changes, and run its applicable verifier. Record the artifact actually served; preserve archived production artifacts. A phone's `127.0.0.1` is the phone itself. Do not substitute LAN origins for these exact loopback origins.

## What each available page proves

| Page | Purpose | Limits |
| --- | --- | --- |
| `http://127.0.0.1:5178/scripts/isolated-worker-check.html` | Current fixed worker fixture, with the version and rows declared by that build. | Local evidence only. Use the matching dedicated worker-check child; the old 11-row version has no network-canary coverage. |
| `https://mage.peterbucci.com/player-check/worker/` | Deployed `fixed-worker-2` / schema 2: 19 capability/lifetime and boundary checks, verified against the artifacts in the release record. | Does not exercise GPU failure, accounts, saved-scene availability or all application paths. Match each report to the intended artifact and browser. |
| `http://127.0.0.1:5178/scripts/isolated-playback-check.html` | Fixed scenes, parent-owned audio, response modes, pointer controls and capture. | Does not test saved-scene permissions or owner repair. |
| `https://mage.peterbucci.com/player-check/` | Deployed fixed playback, music/controls, capture, stop/retry, unavailable-player behavior and startup document boundary. | No account or saved-scene API. Does not enable public custom playback or complete boundary/release checks. |
| `/scripts/isolated-security-check.html` locally; `/player-check/security/` deployed | `fixed-security-3` / schema 3: the seven-case `recovery` group uses `fixed-renderer-recovery-1` trusted actions. | Verify matching parent/child deployment. Older `boundary`/`failures`/`stall` groups remain historical; neither their 17/8/2 totals nor the new recovery group establish worker CPU containment. |
| Normal MAGE pages in a controlled environment | Actual playback surfaces, authoring/imports, moderation, owner recovery and account changes. | Custom-source checks require controlled server permission. Observe the submitted scene's separate iframe; fixed brand artwork is the documented in-page exception. |

Use only fixed probes and the existing bounded dummy canary for boundary evidence. A zero count needs proof that the intended call was reached and that the canary was available, with the report's bounded observation/positive-control evidence. Missing APIs, attempted-and-denied requests, and probes that did not execute must be distinguishable. A canary must never forward to account APIs or collect credentials. No expanded fixture is credited before it has been built, deployed where applicable, and run on the recorded browser/device.

## Remaining acceptance work

| Area | Evidence to collect for the intended release |
| --- | --- |
| Worker lifetime and current boundaries | Versioned worker report on each target: scope, deadline/termination, cancellation, delayed callbacks and fresh jobs, plus the distinct compiler-attempt and bounded observation-worker network/storage results and server canary evidence. Old worker reports lacking new rows remain partial evidence. |
| Renderer boundary and failure behavior | Current parent/child DOM isolation, exact origin/session/port rejection, bounded malformed/flooded messages, missing child, context loss and child reload. Use the versioned current recovery group and its removal/retry proofs, plus recorded controlled observations for any uncovered checks. Submitted source no longer has DOM access. An unsupported context-loss extension leaves that check unverified. |
| Playback and input | Generated and real local audio, both response modes, seek/volume, simulated beat, pointer/drag/zoom where supported, resize, capture, scene switching and explicit pause preservation. Record actual mobile touch, orientation and background/foreground behavior. |
| Normal surfaces and lifecycle | Home/featured, Watch, create/edit/import, discovery/profile/Home For You hover, capture, rapid replacement, navigation during startup, stale load/audio/capture rejection, stop/pause-all/retry and page return. Watch recommendations are static links; verify navigation into Watch. |
| Server permission and recovery | Dedicated-account scene/global disable, foreground stop interval, missing/stale/offline status, permission restoration and retained local failure. Retry must not bypass server denial. Ordinary users cannot manage controls; private reasons remain private. |
| Owner document and contracts | Disabled/failed/unsupported owner repair/export, compiler-rejected draft and saved-thumbnail preservation, save without clearing moderation, stale account/repair responses, template/custom classification and existing shared invalid/forged/oversized fixtures. |

Existing parser/contract, worker-client, bridge, lifecycle and backend tests remain useful evidence; the evidence map identifies their mocks and limits. The recorded backend HTTP/persistence walkthrough does not replace the authenticated normal-app browser walkthrough. Do not build a new diagnostics platform or duplicate existing test suites to fill a browser-observation gap.

## Repeatable run

1. Fill a fresh result record with the frozen artifacts and actual browser/device. Verify the served policy and keep public custom playback off during controlled verification.
2. Open the exact deployed `/player-check/worker/` path without query parameters or a fragment. Keep it visible, run the current fixed checks, and save **Download results JSON** or **Show report JSON** before reloading. Match the exported test version and expected rows to the intended fixture build. Retain incomplete, cancelled, hidden or failed runs as such; none counts as a pass. Preserve earlier evidence when repeating a failed check.
3. At the exact deployed `/player-check/security/` path, run the current seven-case `recovery` group and save its `fixed-security-3` / schema 3 report. Check that the run identifies `fixed-renderer-recovery-1` and `current-renderer-recovery`. Record missing/unsupported actions and remaining renderer boundary checks explicitly; `UNSUPPORTED` is non-passing, and unrun items stay `NOT_RUN` with blockers. Do not substitute the historical groups' 17/8/2 totals or a worker lifetime pass.
4. Run the music page checks above with generated audio and a small local file. Record mobile input, orientation and background/return behavior. Then perform the normal-app surface/lifecycle walkthrough in the controlled environment. Hover may be `NOT_APPLICABLE` only for an actual input mode without hover, with a reason and the corresponding tap/open path tested.
5. Complete the dedicated-account moderation, recovery and owner walkthroughs above. Measure the documented foreground disable bound, verify retained blocks, and confirm failed rendering leaves editing/export available. Run the relevant existing shared-contract regressions against the frozen frontend/backend artifacts.
6. Record observations, report versions/checksums, evidence paths and unresolved failures. Stop test players and restore dedicated scene/control state. Do not mark a group `PASS` solely because its controls are clickable, a page looks correct or another browser passed.

Follow the [required release matrix](isolated-renderer-release.md#required-release-matrix) for the full acceptance detail. The current worker architecture changes how CPU/source isolation is verified; it does not remove the requested browsers, normal application workflows, moderation or owner recovery from acceptance.

## Approval and rollout

Keep the release decision **NOT APPROVED** while a required current-artifact check is failed or untested. Preserve superseded-build failures in the historical record without treating them as current-build passes. A bounded worker loop and worker termination are limited observations, not an unlimited-memory or universal CPU/GPU/driver-containment guarantee.

Once the intended matrix passes, the release owner can approve that recorded artifact set. Follow the existing rollout order: preserve rollback evidence, update the backend release setting and redeploy, use the administrator control to enable the persisted global setting, verify public status and normal app playback, and perform the authenticated disable/re-enable walkthrough. An unexpected failure requires disabling custom playback and retaining evidence. Do not relax validation or isolation to complete rollout.

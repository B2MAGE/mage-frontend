# Custom-shader release checklist

The requested release covers Chrome, Edge, Firefox and Safari, including mobile. A successful local Chromium check does not approve the other browsers, operating systems or devices. Keep the production release setting and persisted custom-playback control off until the required evidence is complete and the release owner approves it.

Use this checklist alongside [the integration and release record](isolated-renderer-release.md). That record describes earlier verified artifacts; its historical results are not results for a new browser or build. Copy [the result template](custom-shader-release-result.template.json) for each actual browser/device/environment combination. Record failures and missing tests explicitly. Do not copy a passing result from another browser or replace a real device with viewport emulation.

## Browser coverage to record

All rows below begin **NOT RUN**. They are the requested coverage plan, not a claim of compatibility. Record the exact browser version, OS version and physical device for every completed row. Phone and tablet results are separate if both are to be supported; a check on one device does not cover the other. Test current installed releases and state the tested versions rather than claiming every version is supported.

| Browser | Desktop | Mobile |
| --- | --- | --- |
| Chrome | Windows: NOT RUN; macOS: NOT RUN | Android: NOT RUN; iOS/iPadOS: NOT RUN |
| Edge | Windows: NOT RUN; macOS: NOT RUN | Android: NOT RUN; iOS/iPadOS: NOT RUN |
| Firefox | Windows: NOT RUN; macOS: NOT RUN | Android: NOT RUN; iOS/iPadOS: NOT RUN |
| Safari | macOS: NOT RUN | iOS: NOT RUN; iPadOS: NOT RUN |

Safari on Windows or Android is not a release target. Do not infer browser-engine coverage from a browser brand on a different OS. If a listed platform is unavailable, retain NOT RUN and record the blocker; do not silently narrow the requested release scope.

## Freeze the test environment

Before a run, record the frontend and backend commit/image, renderer bundle path and integrity hash, parent and renderer URLs, backend release setting and persisted global setting. Capture the actual HTTP policies with the matching renderer verifier. Build output alone is not deployment evidence.

Use only dedicated test accounts and scenes for mutations. For custom-source permission tests, use a controlled backend with its own database and storage. It may enable custom playback for that test environment; do not enable the public gate just to run a test. Retain the starting scene/control state and restore it afterward. Never export tokens, passwords, storage values, private reasons or arbitrary scene source in the evidence record.

The normal local pair is fixed: parent `http://127.0.0.1:5178`, renderer `http://localhost:5181/index.html`. The renderer server holds a verified build in memory: rebuild and restart it when testing changed renderer code, then run `npm run renderer:verify`. Record the bundle that is actually being served. Do not replace an archived production artifact when preparing a local build.

## What each available page proves

| Page | Available checks | Limits |
| --- | --- | --- |
| `http://127.0.0.1:5178/scripts/isolated-security-check.html` | Fixed boundary probes with server canary counts; failure recovery; separately selected finite CPU stall; downloadable group history | Development-only, exact loopback hosts and ports. Local browser evidence, not deployed HTTPS evidence. |
| `http://127.0.0.1:5178/scripts/isolated-playback-check.html` | Fixed scenes, local audio, simulated beat, response modes, pointer controls and capture | Does not test saved-scene permissions, owner repair or all app entry points. |
| `https://mage.peterbucci.com/player-check/` | Deployed fixed scenes, music/controls, capture, stop/retry, startup DOM/storage boundary | No network/self-navigation canary and no account or saved-scene API. Does not enable public custom playback. |
| Normal MAGE pages in a controlled environment | Real authoring, imports, playback surfaces, moderation, owner recovery and account changes | Custom-source checks require controlled server permission. Observe the actual separate iframe and confirm no parent scene canvas. |

The loopback security page is not reachable from a phone by using the desktop's `127.0.0.1` address; that address refers to the phone itself. Its server and origin checks deliberately reject LAN substitution. The optional HTTPS fixed-sample setup in [the hosting guide](isolated-renderer.md#optional-https-parity-check) does not extend the adversarial canary or normal-app local resolver.

**Remaining harness gap for mobile/deployed adversarial checks:** provide a separately reviewed, fixed-probe HTTPS verification page with a bounded, credential-free canary at controlled allowed endpoints. Keep arbitrary shader inputs, account/API imports and secrets out of that page. Its policy must exercise the actual strict parent/renderer boundary; do not broaden the production renderer's allowed parents, sandbox flags or CSP to make the test pass. Until that fixture and actual device runs exist, mark those checks NOT RUN. The existing live music page alone cannot complete them.

## Repeatable run

1. Record the frozen environment and actual browser/device in a fresh result file. Confirm the page stays in the foreground, the real renderer response has the expected policy, and the production custom gate is still off during controlled verification.
2. On the local security page, run **Check browser boundaries**, then **Check failure recovery**, then the separately opted-in **Check a bounded CPU stall**. Expected counts are 17, 8 and 2. Keep the tab visible for each group. Click **Download results JSON** after the groups finish, before reloading. The download retains the latest 24 runs; cancelled, hidden, incomplete and failed runs cannot count as passing. Repeat only the affected group after correcting a failure, retaining the earlier evidence.
3. On the deployed music page, start the player and test generated audio and a small local audio file. Check pause/resume, seek, volume, both response modes, simulated beat, pointer/drag/zoom where supported, resizing, capture, scene switching during audio, stop, unavailable-player handling and retry. On mobile record the actual touch behavior, orientation changes and background/foreground behavior. Do not describe unsupported gestures as tested features.
4. In the controlled normal app, test templates and permitted custom scenes through Home/featured, scene detail, create, edit, JSON import, discovery/profile hover and capture. Exercise rapid switches and ensure old load/audio/capture work cannot affect the next scene. Failed source, child unavailability and retries must never create a parent renderer. Hover-specific checks can be marked NOT APPLICABLE only on an actual input mode without hover, with a reason; test the corresponding tap/open path.
5. Use dedicated accounts to block a scene and globally disable custom rendering while it is playing. Record the elapsed foreground stop interval against the documented availability bound. Check missing/offline/stale status, permission restoration, deliberate retry and retained local failure. Confirm an ordinary user cannot change controls and public responses do not expose private reasons.
6. As the dedicated scene owner, open a disabled or failed scene, edit permitted fields and download JSON without executing its source. Save a repair without clearing the moderation block. Switch accounts and verify a stale response cannot show another owner's repair document. Test template/custom classification, forged/invalid imports and workload/size limits using the shared contract fixtures and targeted regression checks.
7. Record every observation, artifact reference, evidence filename and unresolved failure. Stop test players and restore dedicated test scene/control state. Do not mark a group PASS solely because its controls are clickable or a page looks correct.

For the full acceptance detail, follow the required matrix in the [release record](isolated-renderer-release.md#required-release-matrix). Regression tests complement actual browser/device observations; neither replaces the other.

## Approval and rollout

Keep the release decision **NOT APPROVED** while any required row is failed or untested. A finite three-second CPU probe is limited evidence about that run; it is not an infinite-loop, unlimited-memory or GPU-hang containment guarantee.

Once the intended matrix passes, the release owner can approve the recorded artifact set. Then follow the existing rollout order: preserve rollback evidence, update the backend release setting and redeploy, use the administrator control to enable the persisted global setting, verify public status and normal app playback, and perform the authenticated disable/re-enable walkthrough. An unexpected failure requires disabling custom playback and retaining the evidence. Do not relax validation or isolation to complete rollout.

# PP-I03 integration and release record

## Status — October 3, 2026

Normal player integration is implemented and locally verified on `pp-i03-isolated-player-integration`, ready for review. PP-I02 is merged in #215 and its separate CloudFront renderer and `/player-check/` page were deployed earlier. Those deployments do **not** constitute deployment or release approval for PP-I03. The production custom-rendering release gate stays **off** until the production checks and supported-browser matrix below pass.

See [isolated renderer architecture and hosting](isolated-renderer.md) for protocol limits, immutable artifacts, AWS resources and the previous deployment evidence. This record separates current branch verification from those historical results.

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
| Finite CPU probe | 2/2 passed | A deliberately delayed, finite three-second child loop executed; the frame was retired and the parent remained responsive. Largest observed parent timer gap was 63 ms. This was not an infinite loop or GPU-hang test. |
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
| PP-I03 production HTTPS and additional browser engines | Not yet verified | Keep public custom execution disabled. Earlier PP-I02 live checks do not cover this new parent/child combination. |

The security fixture is `/scripts/isolated-security-check.html`, available only on the exact local development origin. Run **Check browser boundaries**, **Check failure recovery**, then the separately opted-in **Check a bounded CPU stall**. **Stop checks** removes its player. It does not enable backend custom rendering or offer arbitrary source input.

The fixture sends only fixed test programs. Diagnostic messages contain a fresh nonce and booleans, checked against the exact frame, opaque origin and a bounded schema; no actual cookie/storage values are read out or retained. Destructive probes report their execution before a short delay so frame teardown cannot silently discard the evidence. Thrown/invalid source rows report rejected load, not an unobserved execution claim; installed-parser Node tests separately confirm the fixed deliberate throw. These diagnostics are fixture-only and are not accepted by the production playback host.

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

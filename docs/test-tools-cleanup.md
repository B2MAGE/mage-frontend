# Release test tools after PP-I03

[Cleanup story #241](https://github.com/B2MAGE/mage-frontend/issues/241) separates manual release fixtures from ordinary MAGE. This document describes the cleanup implementation; it is not proof that production has been redeployed.

## Normal application

`npm run dev` serves the app and its API proxy. The former `/scripts/` browser checks, the security canary and `/player-check/` routes return HTTP 410 instead of loading a fixture or falling through to the app. The default renderer accepts normal playback connections only. Sample, worker-check and deliberate recovery-fault entry points belong to the explicit development build.

The public check service is retained as a small retirement responder. After its updated image is deployed, `/player-check`, `/player-check/`, `/player-check/security/`, `/player-check/worker/`, old assets and canary requests return HTTP 410. It does not build or serve fixture files, collect canary observations or contact the backend. Its separate `/healthz` endpoint supports the container health check. The app's nginx configuration also reserves the old prefix with 410, so removing the dedicated proxy route later cannot expose an SPA fallback there.

## Retained development checks

Useful fixture sources, automated tests and exported release evidence are retained. Manual checks require deliberate setup:

1. Stop the normal Vite server before reusing port 5178.
2. Run `npm run manual-checks:dev`. This separate configuration serves only on loopback, with the fixture headers and bounded local canary.
3. Run the matching local renderer or diagnostic child described below. Never publish a diagnostic renderer to the production bucket.
4. Stop the manual services when finished and return to `npm run dev -- --host 127.0.0.1 --port 5178 --strictPort` plus the normal renderer.

The retained pages under `http://127.0.0.1:5178/scripts/` are:

| Page | Purpose |
| --- | --- |
| `audio-response-browser-check.html` | Generated audio signal and response checks |
| `audio-response-player-check.html` | Saved and temporary player audio settings |
| `isolated-playback-check.html` | Isolated playback, music and capture |
| `isolated-renderer-check.html` | Historical fixed-sample fixture; diagnostic child required |
| `isolated-security-check.html` | Fixed recovery fixture; diagnostic child required; older probe groups remain historical |
| `isolated-worker-check.html` | Compiler worker fixture; dedicated worker-check child required |
| `quality-scene-capture.html` | Local rendering and capture inspection |
| `render-budget-check.html` | Render workload ceilings |
| `scene-availability-browser-check.html` | Simulated permission revocation |
| `scene-focus-browser-check.html` | Audio continuity during permission rechecks |

The worker child still uses `node scripts/build-worker-check.mjs` followed by `node scripts/serve-worker-check.mjs` on port 5182. Normal playback checks use `npm run renderer:build` and `npm run renderer:serve` on port 5181. The default renderer intentionally cannot run fixed sample or recovery-fault protocols.

For those two diagnostic fixtures, stop the normal renderer, run `npm run renderer:diagnostics:build`, then `npm run renderer:diagnostics:serve`. This type-checks the diagnostic entry, builds into `.local/diagnostics-renderer/` and serves only on loopback port 5181. It rejects production deployment arguments. Restore the normal renderer when done. The obsolete HTTPS sample configuration has been removed; retained manual fixtures use the fixed local HTTP pair.

Production-shaped fixture builders remain available for regression tests and archived artifact comparisons. Their output is not copied into either deployment image. They must not be used to recreate a public test service.

## Deployment retirement

1. Build and verify the normal production renderer. Preserve its current artifact and hosting manifest; deploy the new normal bundle and its matching CloudFront policy with the existing controlled transition procedure.
2. Deploy the main frontend image from this cleanup revision. Check a normal template and custom scene, editor controls and capture.
3. Deploy the existing `mage-player-check` Coolify service using `deployment/isolated-renderer/Dockerfile.player-check` from the same revision. Preserve its `/player-check` route prefix; the replacement responds with 410. The health check uses `/healthz` within the container, not the retired page.
4. Verify all three former public pages, an old script URL and a canary request return 410. Verify normal app pages and `/api` still work. Record deployed revisions and observations on #241 before closing it.

No new AWS resource, domain or backend permission change is needed. Do not disable custom playback merely to retire testing pages. Keep the retired-route responder until the main nginx 410 rule is deployed; only then may the separate proxy/service be removed in a later deployment operation.

## Other leftovers and evidence

- `.local/deployments/`, downloaded reports, screenshots and release records are evidence and rollback material. They are ignored by Git and excluded from Docker builds. Preserve them; they are not public endpoints.
- Generated `dist-player-check/` and local diagnostic builds are disposable build outputs, also excluded from production images. Deleting a directory is not a substitute for retiring a running service.
- The controlled custom-release database copy and original stopped backend/database contain saved scenes. They are not part of this cleanup. Preserve both until their contents are reconciled and a separate data cleanup is requested.
- Saved walkthrough scenes can contain later edits. No account, saved scene, thumbnail, database, credential or release-approval record is deleted by this story.
- Automated validation, moderation, worker termination, render limits, availability checks and recovery tests remain active. Historical failures remain recorded against their original artifacts.

## Local implementation verification — October 5, 2026 UTC

The application, normal local renderer, production renderer and explicit diagnostic renderer built successfully. ESLint and TypeScript checks passed. The focused editor, playback/worker/recovery, route-retirement, build-boundary and hosting regression tests passed.

On the running normal app at port 5178, all ten old browser-check pages, the public check prefix and the local canary returned 410; `/` and `/create-scene` returned 200. The temporary manual harness successfully ran the historical fixed sample and all seven current recovery cases in the Windows in-app Chromium browser. This checks the refactored local tooling, not a new release/browser matrix. Reports remain under `.local/test-tools-cleanup/`.

After restoring the normal app and playback-only renderer, the editor preview rendered and captured a thumbnail. Advanced opened without changing template identity; changing its source entered custom editing, and returning to Basic required explicit replacement. The local saved moderation setting denied custom playback during this check and was preserved. No scene was published.

The retirement container built and returned 410 for former pages/assets/canaries and 200 for `/healthz`. The main nginx configuration passed validation. Temporary diagnostic services and the worker-check helper were stopped; the normal app and renderer remain on ports 5178 and 5181. No production deployment is claimed by these checks.

# Local diagnostics and retired test-service cleanup

Normal startup and verification are in the [README](../README.md#getting-started).
RF-08 removes the dedicated HTTP 410 service, its Dockerfile/nginx configuration,
the three hosted page builders and deployment-only entries. Local diagnostics
retain current compiler, playback and recovery checks without a production mode.

## Normal application

`npm run dev` serves the app and API proxy at `http://127.0.0.1:5178`.
`npm run renderer:serve` builds and starts the normal isolated renderer on 5181.
Main app nginx and Vite exclude diagnostic URLs from the app: `/player-check`,
`/scripts` and the security-canary prefix return HTTP 410. These small route
exclusions do not need a separate container.

`npm run verify` runs lint, tests and both normal builds. `npm test` explicitly
runs the application suite followed by tooling tests, without a hidden
`pretest` chain. Tooling tests cover engine/compiler artifacts, hosting policy,
contract comparison, local route/canary guards, worker termination and recovery.
Current auth, scene saving, Builder compilation and Original/Selective tests stay.
Real API auth verification is opt-in because it creates an account.

## Retained development checks

Use these for a targeted browser investigation, not ordinary startup.

1. Stop your normal Vite process before reusing port 5178.
2. Run `npm run manual-checks:dev`, which enables loopback-only diagnostic pages
   and the bounded local canary.
3. Start the appropriate child below. Do not run normal and diagnostic renderers
   on 5181 at the same time.
4. Stop diagnostic processes when done. Return to `npm run dev` and
   `npm run renderer:serve`.

All page paths below are under `http://127.0.0.1:5178/scripts/`:

| Page | Purpose / child |
| --- | --- |
| `audio-response-browser-check.html` | Audio analysis; no child. |
| `audio-response-player-check.html` | Saved/temporary audio settings; normal renderer. |
| `builder-catalog-check.html` | Catalog visual comparison; normal renderer. |
| `isolated-playback-check.html` | Playback, Original/Selective, capture and cleanup; normal renderer. |
| `isolated-worker-check.html` | Compiler lifetime/boundary; worker child on 5182. |
| `isolated-security-check.html` | Current fixed recovery; diagnostic renderer. Older probe groups are historical, not current worker proof. |
| `isolated-renderer-check.html` | Historical fixed sample; diagnostic renderer, not a current-format acceptance gate. |
| `quality-scene-capture.html`, `render-budget-check.html` | Rendering/capture and workload ceilings; normal renderer. |
| `scene-availability-browser-check.html`, `scene-focus-browser-check.html` | Permission changes and audio continuity; normal renderer. |

Worker child:

```sh
node scripts/build-worker-check.mjs
node scripts/serve-worker-check.mjs
```

Fixed recovery child (stop the normal renderer first):

```sh
npm run renderer:diagnostics:build
npm run renderer:diagnostics:serve
```

Diagnostic builds write under `.local/`, reject production options and are
excluded from deployment images. Their types and regression checks run in
`npm run test:tooling`. An old report is not evidence about today's renderer.

## Deployment retirement

Source removal is separate from removing an existing Coolify resource. Do not
rebuild that resource using the deleted Dockerfile. When releasing RF-08:

1. Verify main frontend nginx reserves `/player-check` and subpaths.
2. Remove the old `mage-player-check` public route and stop its retirement
   container. Disable its automatic deployments. The ordinary frontend route
   then owns the old URLs; no replacement responder is needed.
3. Verify the prefix, security/worker pages, an old asset and canary URL return
   410 through main nginx. Check the app, API and separate renderer still work.
   Record actual operations in issue #305.

No database, account, scene, thumbnail, engine release or CloudFront renderer
needs deleting. Keep ignored `.local/` reports and rollback evidence. Existing
`dist-player-check/` remains ignored/excluded to avoid publishing stale local
artifacts, but no current command creates it.

## Historical #241 evidence

The following record predates RF-08, including its temporary retirement
container. It does not claim RF-08 is deployed.

## Local implementation verification — October 5, 2026 UTC

The application, normal local renderer, production renderer and explicit diagnostic renderer built successfully. ESLint and TypeScript checks passed. The focused editor, playback/worker/recovery, route-retirement, build-boundary and hosting regression tests passed.

On the running normal app at port 5178, all ten old browser-check pages, the public check prefix and the local canary returned 410; `/` and `/create-scene` returned 200. The temporary manual harness successfully ran the historical fixed sample and all seven current recovery cases in the Windows in-app Chromium browser. This checks the refactored local tooling, not a new release/browser matrix. Reports remain under `.local/test-tools-cleanup/`.

After restoring the normal app and playback-only renderer, the editor preview rendered and captured a thumbnail. Advanced opened without changing template identity; changing its source entered custom editing, and returning to Basic required explicit replacement. The local saved moderation setting denied custom playback during this check and was preserved. No scene was published.

The retirement container built and returned 410 for former pages/assets/canaries and 200 for `/healthz`. The main nginx configuration passed validation. Temporary diagnostic services and the worker-check helper were stopped; the normal app and renderer remain on ports 5178 and 5181. No production deployment is claimed by these checks.

# RF-08 development checks cleanup

Issue: [frontend #305](https://github.com/B2MAGE/mage-frontend/issues/305).
Local verification: October 14, 2026. The owner subsequently approved merge and
deployment. Implementation merged through [frontend PR #325](https://github.com/B2MAGE/mage-frontend/pull/325)
at `295132a` and [backend PR #174](https://github.com/B2MAGE/mage-backend/pull/174)
at `ef438ed`. Issue #305 records production deployment and retirement evidence;
the checks below describe the preceding local verification.

## Changes

- Frontend branch `codex/rf08-development-checks`, based on `5f43008`:
  removes the retired check-service container and hosted-page builders, combines
  duplicate music diagnostics, and makes remaining diagnostics local only.
- `npm run verify` explicitly runs lint, application/tooling tests, and both
  normal builds. One tooling configuration covers retained diagnostic entrypoints.
  Current authentication, scene saving, Builder, containment and recovery checks
  remain. Original and Selective remain supported; the app UI is unchanged.
- The README describes one backend/app/renderer startup path. Vite uses the
  required port 5178 and refuses an occupied port rather than silently switching.
- Backend branch `codex/rf08-local-startup`, commit `8d5f76a`, aligns local
  password-reset URLs with 5178 and removes database deletion from first-run
  instructions. Normal startup preserves existing data.

## Verification

Tests ran from a fresh clone of the frontend branch at `1fa3720`, with no copied
environment file, dependencies or ignored build artifacts. `npm ci` and the full
`npm run verify` command succeeded, including lint, TypeScript, the application
build and the normal isolated renderer build.

- Application suite: 217 files, 3,039 tests passed.
- Tooling: expanded TypeScript check, 65 Node tests and 89 Vitest tests passed.
- Retained diagnostic-renderer and compiler-worker helper builds passed.
- All seven shared scene contract files match the backend branch.
- Starting the clean checkout while 5178 was occupied failed with the expected
  port-in-use error, rather than using another port.
- Backend Compose configuration resolves from `.env.example`; six password-reset
  service tests passed, including the correct local origin in generated links.
- Existing local app routes `/` and `/create-scene`, renderer and backend readiness
  returned 200. Retired/diagnostic routes remain excluded from normal Vite with 410.

The existing dependency audit findings and engine compiler `eval` warnings remain;
this change does not update dependency versions. No fresh mobile/browser rendering
matrix or production deployment is claimed. The running backend was not rebuilt;
its default-origin change takes effect on the next normal build/start.

## Release checklist

Record completion in #305 after live verification. Remove the old `mage-player-check`
public route, stop its container and disable its automatic deployments as described
in [deployment retirement](test-tools-cleanup.md#deployment-retirement). The main
app retains the small 410 route exclusions; no replacement service is required.
Verify the app/API/renderer and retired paths after deployment. No data reset or
engine release is needed.

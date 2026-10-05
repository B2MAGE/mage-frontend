# PP-I06 player surfaces and lifecycle evidence

This inventory accompanies [PP-I06](https://github.com/B2MAGE/mage-frontend/issues/224).
It describes source routing and local regression coverage, not a production release
approval. PP-I06 deployment and the complete browser/device matrix are not verified
by this document. Keep the production custom-rendering release approval and saved
global custom-rendering switch off. [Release evidence](isolated-renderer-release.md)
records deployments separately; the remaining public release decision belongs to
PP-I03.

## Rendering surfaces

Submitted scenes share this route: `MagePlayer` or a hover owner calls
`createMagePlayer` → `createIsolatedMageController` → `createIsolatedPlayer` →
`createIsolatedPlaybackHost`. The child installs `installPlaybackRuntime`, calls
`loadPlaybackEngine`, finishes `compileInWorker`, then loads the validated artifact
with `loadCompiledPreset`. No submitted-source fallback is selected when the worker,
host, permission check or output policy fails. Engine changes remain in the
frontend-owned package patch.

| Surface | Source route | Relevant automated coverage |
| --- | --- | --- |
| Watch | `src/modules/scene-detail/SceneDetailPage.tsx` → `MagePlayer` | `SceneDetailPage.availability.test.tsx`, `MagePlayer.recovery.test.tsx`, `MagePlayer.availability.test.tsx` |
| Home featured | `src/modules/home/HomePage.tsx` → `MagePlayer` | `HomePage.test.tsx`, shared player/recovery/availability tests |
| Create, edit and imported-scene preview | `src/modules/scene-editor/SceneEditorShell.tsx` → `MagePlayer`; imported data retains the same validation and permission boundary | `SceneEditor.preview.test.tsx`, `SceneEditor.recovery.test.tsx`, `SceneEditor.captureAvailability.test.tsx`, `sceneTransport.test.ts` |
| Browse, profile and Home For You hover previews | `DiscoverySceneCard` → `useSceneHoverPreview` → `sceneHoverPreviewCoordinator` → `createMagePlayer`, with the preview budget | `DiscoverySceneCard.preview.test.tsx`, `engineAdapter.test.ts`, controller lifecycle tests |
| Watch recommendations | `src/modules/scene-detail/ui/SceneRecommendationRail.tsx` displays static images/placeholders and navigation links. It does **not** start a renderer or hover player. Following a link enters Watch. | `SceneRecommendationRail.test.tsx`, `SceneDetailPage.recommendations.test.tsx` cover static presentation/navigation, not shader execution |
| Thumbnails and editor capture | Capture requests use the current isolated player and bounded raster bridge; saved thumbnail display is static | `SceneEditor.captureAvailability.test.tsx`, `playbackRuntime.test.ts`, `playbackHost.test.ts`, `playbackEngine.test.ts` |
| Retry, scene replacement and return navigation | The same controller/host route reacquires permission and the exact scene-revision recovery lease; no separate evaluator | `isolatedController.test.ts`, `isolatedController.startup.test.ts`, `MagePlayer.recovery.test.tsx`, `sceneRecovery.test.ts` |

Paths in the coverage column are test basenames; most tests exercise the named
component with a lower transport or engine mocked. They do not independently prove
browser worker creation, WebGL or hosting policy. Tests are found alongside their
owning module, except child tests under `src/isolated-renderer`.

### Fixed brand artwork exception

`src/modules/scene-artwork/BrandScene.tsx` uses the internal `BRAND_SCENE` through
`platformArtwork: 'brand'`. This fixed Home/About artwork is the only intentional
parent-engine route. The adapter requires the exact internal scene identity and
rejects saved IDs, clones, custom/template replacements and unsuitable render
targets. `engineAdapter.test.ts` covers these restrictions, including later source
replacement. It is not a submitted-scene playback surface or an alternate route
for a failed scene.

### Relevant harnesses

| Harness | Path exercised |
| --- | --- |
| `scripts/isolated-playback-check.html`, deployed `/player-check/` | Normal isolated playback bridge, parent-owned audio, controls, capture and stop/retry |
| `scripts/isolated-renderer-check.html` | Fixed v1 sample; `src/isolated-renderer/sample.ts` also compiles in a worker and loads a compiled artifact |
| `scripts/isolated-worker-check.html`, deployed `/player-check/worker/` | Fixed compiler fixtures through the actual disposable worker; reports worker lifecycle and policy observations |
| `scripts/quality-scene-capture.html`, `scripts/render-budget-check.mjs` | Isolated scene/capture path with resource limits; not direct parent engine compilation |
| `scripts/audio-response-player-check.html` | Shared `createMagePlayer` facade |
| Historical `/player-check/security/` | Earlier iframe probes retained for comparison; its legacy script tests are not proof of current worker behavior |

`scripts/isolated-security-imports.test.mjs` audits application and harness sources,
including inline HTML scripts, for forbidden engine/compiler imports, evaluation
calls and child source-loading APIs. Its explicit brand exception is narrowly
scoped. Test-only direct compiler calls are fixtures, not shipped runtime paths.

## Lifecycle evidence map

| Requirement | Existing or added evidence |
| --- | --- |
| Fresh job, fixed deadline, terminate on success/error/abort | `compiler/client.test.ts`; the fixed worker fixture adds actual browser observations |
| Rapid replacement cannot overwrite the newest scene | `playbackRuntime.test.ts`, `isolatedController.test.ts`, `MagePlayer.availability.test.tsx`; generation/request correlation and old-load cancellation |
| Navigation or hover exit during startup releases pending work | `isolatedController.startup.test.ts`, `engineAdapter.test.ts`, `DiscoverySceneCard.preview.test.tsx`; owner AbortSignal reaches startup and an already-created bridge |
| Unsupported workers fail without a main-thread evaluator | `workerRecovery.integration.test.ts` composes the real compiler receiver, engine loader, child runtime, host and recovery store; only transport and Worker capability are simulated |
| Repeated failure requires deliberate retry of the exact revision | `sceneRecovery.test.ts`, `MagePlayer.recovery.test.tsx`, `workerRecovery.integration.test.ts`; another document stays blocked, a failed retry retains quarantine, a changed revision has a distinct key |
| Old WebGL context loss cannot stop a replacement | `playbackRuntime.test.ts` replaces the canvas and rejects stale callbacks; `playbackEngine.test.ts` covers context loss while paused |
| Background, page exit and return | `playbackHost.test.ts`, `sceneAvailability.test.ts`, `MagePlayer.recovery.test.tsx` cover watchdog scheduling gaps, visibility, pagehide/BFCache and permission refresh |
| Audio remains parent-owned through switching and controls | `isolatedPlayer.test.ts`, `isolatedController.test.ts`, `MagePlayer.audio.test.tsx`, `MagePlayer.audioAvailability.test.tsx`, `musicCheck.test.ts`; source changes do not send audio files or rerun source callbacks for numeric controls |
| Capture cleanup and stale responses | `playbackRuntime.test.ts`, `playbackHost.test.ts`, `playbackEngine.test.ts`, `SceneEditor.captureAvailability.test.tsx`; timeouts, generation ownership, permission withdrawal and retained saved thumbnails |
| Editing/export and moderation remain separate from playback | `SceneEditor.recovery.test.tsx`, `SceneEditor.preview.test.tsx`, `sceneTransport.test.ts`, availability/admin tests; playback failure does not authorize rendering or discard the authoring document |

The added cross-layer integration has two cases: missing Worker and a Worker
constructor rejected by browser policy. Both passed locally on October 4, 2026.
They assert the fixed `compile` failure crosses the real bridge with the matching
request/revision, no graphics engine import/allocation occurs, ports/frame/timers
are released, private source/browser errors are not returned or persisted, and no
automatic restart occurs. This is simulated-browser integration evidence, not a
real CSP or WebGL test.

## Local verification, October 4, 2026

Branch: `pp-i06-player-lifecycle`, based on the deployed PP-I05 merge `9f1d50b`.
The final complete Vitest run passed **1,936 tests in 141 files** with two workers
and no competing build. An earlier run overlapped production builds and timed out
in two editor tests; the complete rerun passed without changing test timeouts.
ESLint, TypeScript/application build, local and production renderer builds, and
music, worker and security check-page builds passed. Both source/import-boundary
tests passed. A separate read-only review found no further confirmed regression.

The local in-app browser walkthrough at `http://127.0.0.1:5178/` verified Home
featured and Watch rendering, local audio loading/seeking, manual pause preserved
through pause-all and resume, and editor playback. In the editor, rapid replacement
from Prism Core through Steel Lattice to Mint Halo completed while the same audio
timeline continued. Seeking to the start, pausing, capturing the replacement's
thumbnail, resuming, and changing Selective frequency focus/amount succeeded.
These were unsaved local editor changes; no scene was published or altered in the
database. This walkthrough is narrower than the full device/release matrix.

PP-I06 merged through PR #235 at `e9a1649c8404d622b6278226b3d0f69ffec66716`. The normal frontend, fixed-check service and compatible renderer `assets/renderer-B-hwXhYk.js` are deployed. The final single-asset hosting policy passed exact-byte/header/route verification. No backend or public release-gate change was made. See the [release record](isolated-renderer-release.md).

## Remaining verification

Local/browser walkthroughs should exercise Watch and Home; browse/profile hover
enter/leave; create/edit/import; rapid scene replacement; navigate away during
startup; scene switch while audio plays; seek, pause, simulated beat and Selective
response; capture followed by replacement/teardown; stop, pause-all and explicit
retry; and hidden/visible or pagehide/return behavior. Include a rejected custom
draft whose text/settings/export remain available and a moderation denial that
does not clear when Retry is pressed. Use controlled local/staging permission for
custom source instead of enabling production custom rendering for the test.

After a separately approved deployment, verify matching parent/child artifacts and
headers, fixed worker/music checks and normal-app surfaces. Retain exported reports
with exact device, OS and browser versions for supported desktop and mobile
targets. A fixed worker pass does not prove every normal-app surface, audio/capture
workflow or GPU failure mode. No universal GPU/driver hang containment is claimed.

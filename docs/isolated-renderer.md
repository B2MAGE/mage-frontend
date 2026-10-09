# Isolated renderer (PP-I01 / PP-I02 / PP-I03 / PP-I04 / PP-I05)

PP-I01 provides a separately built, hosted player. PP-I02 adds a versioned playback bridge and local/live music checks. PP-I03 connects normal application players to that bridge; the normal app integration and later moderation controls have been merged and deployed. The renderer is hosted on the existing CloudFront site, with manual checks now separated from normal application services by [cleanup story #241](test-tools-cleanup.md). The owner-approved production rollout enabled custom playback on October 5, 2026 UTC and verified the global disable/re-enable controls.

See [the PP-I03 release record](isolated-renderer-release.md) for the approved deployment evidence, recorded scope and limits, deployment order, rollback, and owner repair/export behavior, and the [browser release checklist](custom-shader-release-checklist.md) for reusable verification procedures. [PP-I03](https://github.com/B2MAGE/mage-frontend/issues/204) tracks release-branch integration and closure. Historical deployment results below describe their named artifacts only; they are not new requests to repeat passing tests.

> Current tooling: normal builds accept playback only. Public check routes are retired by the cleanup deployment; all manual pages require the explicit local harness. See [test tools and retirement instructions](test-tools-cleanup.md). Dated results below remain historical evidence.

## PP-I03 application boundary

`createMagePlayer()` validates an initial document before creating a player and routes templates, custom documents and legacy blobs through `isolatedController.ts`. The shared controller retains the `MagePlayerController` interface for Home, Watch, editor create/edit/import previews, hover cards and capture. It wraps the isolated bridge with fresh availability checks and browser-local recovery leases. Invalid documents, missing hosts, unsupported sites, startup failures, denied permission and retry failures never fall back to compiling submitted source in the parent page.

The sole in-page engine path is fixed platform brand artwork. It requires the exact imported `BRAND_SCENE` object, the internal brand option and no saved scene ID. Submitted JSON, matching source text, a template label or caller-supplied trust flags cannot obtain that path. Development rendering harnesses also use the isolated boundary; the audio-analysis-only fixture does not compile scenes.

The parent owns account access, availability polling, recovery UI, editor state, playlists, Web Audio and input collection. The child owns source resolution/compilation, WebGL and camera/deformation controls. Pending availability checks suspend the existing player; confirmed denial disposes it. Starting, resuming, switching scenes, loading audio and capturing require current permission. A retry clears neither server denial nor validation requirements. Recovery markers are acquired before source loading, and retired only after the old renderer stops.

The production renderer URL is fixed to `https://d2wwpgc7sgvmnm.cloudfront.net/index.html` for `https://mage.peterbucci.com`. The development resolver accepts only the opposite loopback hostname on ports 5178/5181 over HTTP. Other sites fail closed. The parent response policy restricts `frame-src` to that exact renderer entry; the child response sandbox and iframe both use only `allow-scripts`. No scene field, query parameter or message can choose another renderer.

Audio response edits use a bounded `audio-response` message, preserving the parent audio session. The optional `capabilities` request returns only the supported target enum list; it does not expose shader source or private engine data. These new commands require the PP-I03 child. Deploy it before the new parent: the PP-I02 child rejects unknown commands rather than silently accepting an incompatible client.

## PP-I02 playback bridge

Start `npm run manual-checks:dev` instead of the normal Vite server, then open `http://127.0.0.1:5178/scripts/isolated-playback-check.html` with the local renderer on `http://localhost:5181`. Start the player, use **Play test rhythm** or select a local audio file, then switch scenes, pause/resume, seek, toggle simulated beat, choose Original/Selective response, drag, zoom, and capture a frame. The fixture uses the exported `createIsolatedPlayer` boundary. It is not a production custom-code authoring surface.

- Protocol v2 uses a fresh session, monotonic request IDs, and a new generation for each scene. The default child accepts only the v2 playback bootstrap; the old v1 sample belongs to the explicit diagnostics build. The parent transfers a private MessagePort to the exact iframe window. The sole `targetOrigin='*'` is this payload-free opaque-origin bootstrap; the child checks the exact parent source and allowed origin. Window messages are not accepted as playback replies.
- Load data is bounded and validated with the shared submission/resource policy in both parent and child. Template source is resolved from the immutable library inside the child. No bearer tokens, cookies, profile objects, file contents, media addresses, or fetch instructions appear in protocol messages. Unknown fields and command types are rejected.
- Parent Web Audio owns decoding, transport, volume, seek, and analysis. The same session survives scene replacement. A source is at most 64 MiB; URL fetches omit credentials/referrers and reject redirects. The worklet receives parent audio; only numeric levels, up to 16 hits, the legacy FFT64 bin-2 amplitude, and bounded clocks reach the renderer. Real playing audio takes precedence over simulated beats.
- Inputs are coalesced at roughly 30 Hz, retaining intervening hits. Limits are 90 commands/s, 45 child replies/s, 4 loads/s and 2 captures/s. Resize, pointer and zoom have one pending value each. Diagnostics are fixed codes, displayed as text. There is one current scene load, one capture, and one parent image decode. Stale work cannot complete a newer generation.
- The maintained engine provides external audio and an external visual clock. Authored animation speed and saved time are preserved; interpolation stops after 250 ms without new clock input. Legacy and mapped music response, pointer deformation, left-drag orbit and optional wheel zoom stay inside the renderer. Touch camera gestures and browser Ctrl/Meta-wheel zoom remain outside these controls.
- Render ceilings come from `getRenderBudget(profile)`, never submitted data. Scene/effect validation runs before loading. This bridge conservatively renders at DPR 1, with full/preview pixel, edge, FPS and raymarch ceilings. Size updates cannot raise those ceilings. Zoom stays within 0.4–2.5 times the authored camera distance.
- Captures are requested, limited to the shared preview pixel/edge ceiling and 1 MiB, and transferred as PNG/JPEG/WebP bytes. The parent checks the request/generation, MIME signature, encoded dimensions, decoded dimensions and requested size before returning a Blob. URLs, HTML, SVG, unexpected formats and unsolicited captures are rejected. Timeouts/disposal reject pending captures and release frame/port/timer resources; an in-flight browser image decode may finish later and its bitmap is closed.
- Startup has a parent-observed 15-second timeout; active foreground progress has a 10-second timeout. Completed-frame progress is throttled to twice per second. Intentional pause/background suspension does not produce false progress failures. Failures remove the frame, stop sampling and pause parent audio, with a typed callback for PP-R01 integration. A claimed frame/heartbeat is only a liveness signal, not proof of safe source.
- After a deliberate retry, ten seconds of sustained foreground frame progress clears only that attempt's matching browser-local warning. Pause, hidden time, missing progress and delayed tasks restart observation. The active crash marker remains until clean disposal; later failures, newer warnings and server denial still apply.

The normal application controller applies availability, revocation, recovery and retry rules around this lower-level bridge. The developer fixture is not an authorization surface and does not enable the public arbitrary-code release gate. Source limits cannot prevent infinite loops, JavaScript cannot guarantee cancellation of a GPU hang, and a receiver cannot prevent structured-clone allocation before delivery. A hostile child can defeat its own engine limits or lie about progress; the browser sandbox, separate site, parent teardown and release verification remain necessary.

The engine release includes the compiler, compiled-output validation and audio
entrypoints. They are built in the fork and installed directly; see
[engine package maintenance](engine-package.md). A clean application install must
not modify or generate files inside the engine dependency.

### Local regression checks

```powershell
npx vitest run src/modules/player/isolation src/isolated-renderer src/modules/player/infrastructure/engineExternalAudio.test.ts src/modules/player/infrastructure/engineClock.test.ts
npm run renderer:build
npm run renderer:serve
npm run renderer:verify
```

The local server retains a verified build in memory; restart it after rebuilding. Parent and child must both contain protocol v2 before using the music check. The original v1 sample is available only in the explicit diagnostic child. The former public `/player-check/` service is retired by the cleanup deployment.

Browser verification on October 3, 2026 used Chromium with the real response-header sandbox and CSP on the local cross-site pair. Verified visible rendering, real parent Web Audio from a generated WAV, music time continuing across a scene switch (0.2 to 0.4 seconds), pause preservation across a switch (0.6 seconds), resume/seek, both response modes, simulated beats, pointer/zoom interaction, a decoded PNG preview, and removal of the iframe on Stop. Scene replacement uses a new canvas after disposing the old engine so delayed WebGL context loss cannot stop the new scene. Production verification is recorded below; the full multi-browser/public-source release checks remain ahead.

## PP-I04 disposable compilation

Each scene load creates a fresh compile-only worker before allocating graphics.
The owner accepts one matching versioned result within a fixed 2,000 ms deadline;
started messages never extend that deadline. Success, failure, timeout, scene
replacement and cancellation terminate the worker and revoke its Blob URL.
Workers also close themselves immediately after returning. Unsupported worker
creation fails the load without evaluating submitted source in the renderer or app.

Artifact version 1 contains only `uniforms`, `frag`, `vert`, `geoGLSL`, and
`colorGLSL`, plus its version. Uniforms are named finite float/vec2/vec3/vec4
values, with optional finite bounds. The receiver normalizes and copies this
bounded data, then the engine's `loadCompiledPreset` builds the mesh from it.
The original source remains inert metadata for exports and existing response
capability detection. Audio, time, camera, pointer and effects still update
trusted engine fields. Captures reuse the compiled mesh/artifact.

Shader Park geometry and declared inputs are supported; code relying on a DOM,
parent window, nested workers or later callbacks is not. Delayed callbacks are
deliberately retired after compilation. The original PP-I04 artifact checks did
not establish that arbitrary generated GLSL is safe. The local PP-I05 policy
below narrows accepted output; PP-I06 still verifies every application lifecycle.
Workers do not guarantee GPU hang containment or prevent all memory pressure.

### Fixed local worker checks

With `npm run manual-checks:dev` running at `http://127.0.0.1:5178`, build and start the fixed child:

```powershell
node scripts/build-worker-check.mjs
node scripts/serve-worker-check.mjs
```

Open `http://127.0.0.1:5178/scripts/isolated-worker-check.html` and run the fixed
checks. The separate child on `http://localhost:5182` uses the same hosting
manifest, opaque sandbox and compiler build as the renderer. A finite
three-second loop must be terminated by the unchanged two-second deadline while
the parent stays responsive. A positive timer control distinguishes a working
delayed callback from a compiler callback correctly retired after completion.
The same fixture checks thrown source, invalid syntax, cancellation after actual
loop entry, and fresh globals across repeated compilation jobs. Run its automated
checks with `npm run worker-check:test`; these also run before `npm test`.
Reports retain exact browser information and bounded lifecycle/timing evidence;
hidden or cancelled runs cannot pass. The original 11-check `fixed-worker-1`
fixture did not test network denial. The deployed I03 `fixed-worker-2` update
adds eight boundary observations, separating compiler probes from a fixed 600 ms
policy worker and requiring independent canary positive controls. CacheStorage
`NOT_EXPOSED` records an absent API, not a denied opening. See the [current
deployment evidence](isolated-renderer-release.md#i03-verification-fixture-deployment--october-5-2026-utc).
Neither version establishes GPU behavior or full application acceptance;
historical window-based security probes remain historical.

At the PP-I04 acceptance stage, public custom-shader gates were still off. PP-I04 merged through [PR #232](https://github.com/B2MAGE/mage-frontend/pull/232)
at `a34c7e9a5dc3d48e28ce16af9b031bfa150c60a1`, and [issue #222](https://github.com/B2MAGE/mage-frontend/issues/222)
is **Done**. The owner accepted the user's reported passing worker checks on a
Pixel using Chrome / Android 17 and an Apple device using Safari / iOS
(described as the latest iOS; exact version unspecified). Exact hardware models,
browser versions and exported mobile reports were not supplied; that metadata
remains unspecified in the evidence. These are user-reported passes, not independent
mobile runs. PP-I04 acceptance did not itself enable the public gate; the later
owner-approved production rollout is recorded in the [release record](isolated-renderer-release.md).

Local evidence on October 4, 2026: all 11 fixed checks passed in the Codex in-app
browser on Windows (reported Chromium 154.0.0.0). The finite-loop worker was
terminated after 2,004.4 ms; the maximum parent timer gap was 63.3 ms. The normal
Home featured player also rendered through the new compiler path. The saved
report is `.local/pp-i04-worker-iab.json`; this evidence does not cover physical
mobile devices. The application suite passed 1,873 tests, and both the app and
renderer builds and the actual local HTTP policy verification passed.

### Production worker deployment — October 4, 2026

Source `eede2567b455bd7cf9931d7c4718ed7dd5f7a893` produced the deployed
`assets/renderer-DZcqe5Im.js` (17,711,804 bytes), SHA-256
`e776e5dbb44a5339b19d1e4dedae2572c37968e342ebb8d7593015b2180b282c`.
The existing AWS stack's exact old/new-hash transition completed at
20:34:27 UTC. The final single-hash update completed, and both the AWS helper
and official production HTTP verifier passed against the exact artifact. No new
AWS resource or domain was added; the explicit policy change permits Blob
compiler workers while preserving the opaque sandbox and network restrictions.

The existing player-check service deployed the same source in Coolify operation
`p11yjmd2lk5dib05isfe1goe` and was healthy at 20:34:44 UTC. Its three pages
passed 31 live HTTPS byte/header/routing checks against the approved LF Docker
artifacts. The actual deployed worker page passed all 11 fixed checks in the
Windows in-app Chromium browser: finite-loop termination took 2,004.7 ms and
the maximum parent timer gap was 63 ms. The visible run verified the opaque
frame. Report: `.local/deployments/pp-i04-worker/live-worker-report.json`;
HTTP evidence: `fixed-harness-live-verification.json` in the same directory.

Live music checks verified startup/isolation, music continuity through scene
and response changes, pause/switch/resume, a decoded 320 × 180 capture, Stop,
unavailable-player failure and successful Retry. An initial run stopped safely
after capture before its image dimensions were inspected; the reason was not
retained by that page. Retry and subsequent checks succeeded. Offscreen frame
scheduling is a possible cause, not an established diagnosis. Retain that
interruption alongside the passing checks. Public custom gates were verified
off. The normal live scene `/scenes/15` (Aurora Drift) also rendered successfully;
its screenshot is `.local/deployments/pp-i04-worker/live-scene-smoke.png`.
See the [release record](isolated-renderer-release.md#pp-i04-compiler-worker-deployment)
for artifact and evidence details; fixed checks do not approve the full release.

## PP-I05 compiled-output policy — local implementation

PP-I05 treats a worker result as untrusted data even when its job matches. The
worker protocol is version 2: each disposable worker receives a fresh random job
ID, a separate random channel ID and the positive scene revision supplied by the
playback generation. The receiver accepts only the exact response shape,
protocol/version, IDs and revision for that job. At most two responses are
accepted: `started`, then one terminal result. The absolute 2,000 ms deadline
also covers result validation; progress or a queued late result cannot extend
it. Success, rejection, timeout and abort terminate the worker and release its
Blob URL.

The version-1 artifact retains exactly six fields: `version`, `uniforms`,
`frag`, `vert`, `geoGLSL` and `colorGLSL`. The receiver normalizes it before
allocating the engine; the patched engine's `loadCompiledPreset` revalidates it
before constructing the shader mesh.
Records must contain only allowed data properties, and the uniform list must be
a dense ordinary array. Accessors, extra keys, unsupported prototypes, sparse
arrays and unsupported values are rejected. The accepted shader-data limits are:

| Field | Limit |
| --- | --- |
| Fragment shader | 524,288 UTF-8 bytes |
| Vertex shader | 65,536 UTF-8 bytes; must match the installed compiler's fixed vertex shader |
| Geometry and color sections | 262,144 UTF-8 bytes each |
| All four shader strings together | 786,432 UTF-8 bytes, including duplicated sections in the fragment |
| Uniforms | At most 64, unique bounded names, only float/vec2/vec3/vec4, finite components with absolute magnitude at most 1,000,000 |

Required engine uniforms must have the expected types. Optional uniform bounds
must be finite, ordered and contain the value; reserved shader names cannot be
redefined. The accepted result is copied into normalized data rather than
passing the worker's original objects onward.

The fragment must match the exact installed Shader Park scaffold around its
geometry/color sections, including the declared uniforms and quality constants.
The receiver rebuilds that trusted program with raymarch iterations no higher
than the host profile's ceiling (at most 200), at most two reflections, and a
finite step constant clamped to 0.005–1. A submitted constant or a comment that
looks like an iteration guard cannot replace this enforcement. The generated
vertex/scaffold source is tied to the installed patched compiler, so preparing
the engine and checking compatibility are part of the build.

Supported authoring remains the Shader Park DSL that emits the accepted
straight-line geometry/color code. Finite JavaScript loops that construct
geometry execute in the disposable worker and can emit straight-line GLSL;
they are not GPU loops. General raw GLSL is unsupported: supplied sections cannot
add GPU loops, arrays/indexing, recursive helper calls (including cycles through
trusted scaffold helpers), arbitrary preprocessor directives, global declarations
or replacement scaffold functions. Only the compiler's balanced `USE_PBR`
conditionals are allowed. Unsupported output fails before GPU allocation;
accepted authored source and saved settings are not rewritten.

The existing resource budgets remain independent of shader values: full playback
is capped at 2,073,600 pixels, a 1,920-pixel edge and 60 FPS; previews at 230,400
pixels, a 640-pixel edge and 30 FPS. DPR, effects and captures retain their
host-owned limits. A uniform named `resolution` is an input, not authority to
allocate a larger buffer. The local compatibility audit of all 16 immutable
presets found at most eight uniforms, zero reflections and a largest fragment
of 59,663 characters; those are corpus measurements, not additional limits.
Audit detail is retained in `.local/pp-i05-budget-compatibility.md`.

Compiler failures cross the playback bridge as the fixed `compile` code only.
The parent removes the player, stores that reason for the scene revision and
shows a static message to simplify the shader or choose a template. Retry is
deliberate; owner edit/export remains available. No worker error text, compiler
source or shader source is exposed in the failure response. Playback protocol
v2 remains unchanged: older parents safely reject the unknown `compile` code
as a generic failure. Future rollout must deploy the child before the matching
parent and keep public custom-rendering gates off during verification.

Local verification on October 4, 2026 passed: the full application suite (1,907
tests in 139 files), 14 compiled-output contract tests, and a final focused
engine/runtime rerun (128 tests) after the CSG intersection compatibility fix.
Lint, TypeScript, app and renderer builds, eight hosting tests and actual local
HTTP-policy verification passed. A fresh published engine package accepted the
complete patch, retained all six exports and compiled all 16 preset plus 100
demo fixtures at both 32 and 200 iterations. Evidence is retained under
`.local/pp-i05-clean-engine-arity-20261004/`.

The final local worker page passed 11/11 checks in Windows in-app Chromium
154.0.0.0, with a 62.3 ms maximum parent gap and 2,004.8 ms worker termination.
Report: `.local/pp-i05-worker-report.json`. Home's featured `Basic controls review`
scene rendered after an explicit retry of its existing generic recovery state;
the earlier stopped state is not evidence of a diagnosed PP-I05 failure.
Screenshot: `.local/pp-i05-home-smoke.png`. These are local smoke checks, not the
full PP-I06 application matrix or new mobile evidence. The local renderer is
`assets/renderer-CGVMJh26.js`.

At this local verification stage, PP-I05 was **To Verify**, committed locally but
not yet pushed, merged or deployed. Its subsequent merge/deployment and the later
approved production rollout are recorded in the [release record](isolated-renderer-release.md).
The policy bounds accepted output and supported
engine work; it is not a complete GLSL type checker or a general guarantee
against GPU-driver failures, slow finite expressions or worker memory exhaustion.
The PP-I04 artifact and observations above remain preserved as historical evidence.

## Hosting boundary

### PP-I04 compiler worker hosting

The renderer build first builds `src/isolated-renderer/compiler/worker.ts` as a
separate, in-memory classic script. Its exact module allowlist admits only the
worker protocol/bootstrap and the engine's compiler-only modules; it rejects the
DOM/WebGL engine, app modules, arbitrary packages and additional script chunks.
The resulting source is embedded in the renderer through
`__MAGE_COMPILER_WORKER_SOURCE__`. The outer renderer's existing SRI hash therefore
covers the worker source too. `build-audit.json` records the worker's source hash,
byte count and module list for release review; it remains private deployment
metadata. There is still only one public JavaScript file plus `index.html`.

The sole hosting-policy change is `worker-src blob:`. The opaque renderer creates
a disposable dedicated worker from the bundled source; it never fetches a worker
URL or enables same-origin access. Blob workers inherit the renderer's CSP,
including `connect-src 'none'` and the absence of remote script sources. The
compiler can evaluate source under the existing `unsafe-eval` allowance, but
requests and external script imports remain blocked. See [worker CSP
inheritance](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#content_security_policy).

The worker bootstrap removes nested-worker constructors before evaluating source.
This JavaScript hardening is defense in depth, not a separate security boundary:
the inherited `worker-src blob:` directive itself does not distinguish first-level
workers from nested workers. Browser checks must demonstrate successful opaque
worker startup, blocked network requests, compilation timeout/termination and
safe recovery. A build or unit test alone does not prove those browser behaviors.
Browsers that cannot start the restricted worker must fail safely without
compiling on the renderer or parent page as a fallback.

This is a hosting-policy release, not merely a new bundle. Preserve the prior
production artifact and review the explicit worker-policy change along with the
two-hash transition before deploying. Restart local hosting after rebuilding;
existing in-memory servers retain the previous policy. No new AWS resource or
public worker route is required, and preparing this build does not update the
deployed CloudFront distribution or open the custom-rendering release gate.

### Shared renderer policy

This implementation requires the renderer to use a different **registrable domain** from MAGE in production. MAGE is hosted at `https://mage.peterbucci.com`; the renderer will use the HTTPS hostname assigned by CloudFront, such as `https://d123example.cloudfront.net`. That example hostname is illustrative, not a provisioned resource. A sibling such as `https://player.peterbucci.com` does not meet this story's chosen separate-site boundary. The iframe sandbox remains the core access restriction; the separate site adds browser isolation where supported.

The selected hosting plan needs no additional domain purchase, Route 53 zone, DNS changes or custom ACM certificate. CloudFront supplies the hostname and certificate. MAGE's existing Coolify/frontend/backend deployment stays in place; CloudFront and its private S3 bucket host only the separate renderer files.

Only `src/isolated-renderer/main.ts`, its child implementation, the engine and an exact allowlist of shared protocol, capture, scene validation, render-budget, template-resolution and pointer-deformation modules are bundled. The build rejects other workspace modules and emits one classic IIFE with all engine assets embedded. It does not load the app's Vite configuration, public directory or environment files. No API client, account session, auth code, telemetry or service worker is included. The allowed parent origins are an explicit build input, not a URL parameter or message field.

Each build's `hosting-manifest.json` is the source of its response headers and generated CloudFormation policies. Local output lives in `dist-isolated-renderer/`; `renderer:build:production` uses `dist-isolated-renderer-production/` so the two do not overwrite each other:

- Response-header `sandbox allow-scripts` creates an opaque origin even when somebody navigates directly to the renderer. The parent iframe also uses only `allow-scripts`.
- CSP defaults to no resources. It allows the exact immutable script hash with SRI, a fixed stylesheet hash and only Blob worker URLs. There is no broad `self`, remote script, inline-script or network-worker allowance. Only the renderer and its inherited compiler-worker policy permit `unsafe-eval`, which the existing Shader Park compiler requires.
- Embedded `data:`/`blob:` images support engine skyboxes; external images, requests, frames, external worker scripts, media, objects, fonts and form submission are denied. The parent controls the exact allowed frame source as well.
- The public static script uses anonymous CORS (`Access-Control-Allow-Origin: *`, no credentials) because its sandboxed document has an opaque origin. This is not an API CORS policy.
- Permissions Policy denies camera, microphone, geolocation, clipboard, fullscreen, device APIs and other sensitive features. No cookies are set; referrers are omitted and MIME sniffing is disabled.
- Only `/`, `/index.html` and the one current hashed script are served. Methods other than GET/HEAD, arbitrary paths, query strings and API routes are rejected. There is no proxy or SPA fallback.

The local server loads and verifies the complete build before listening, binds to loopback, and keeps its bytes and headers together in memory. Rebuild **and restart** it after child-code changes. A tampered document, bundle, or relaxed manifest policy prevents startup.

## Local check

Keep the existing app on **`http://127.0.0.1:5178`**. Use **`http://localhost:5181`** for the renderer. These distinct loopback hostnames provide a cross-site test without editing the operating system's hosts file. Do not open the parent as `localhost` when exercising this cross-site check.

```powershell
npm run renderer:build
npm run renderer:serve
```

In a second terminal:

```powershell
npm run renderer:verify
npm run renderer:test
```

Open normal MAGE at `http://127.0.0.1:5178` to inspect the playback-only renderer. To run the old sample or fixed recovery faults, stop these servers and follow the [explicit diagnostics workflow](test-tools-cleanup.md#retained-development-checks); those protocols are deliberately absent from normal builds.

The renderer build defaults to allowing parent origins `http://127.0.0.1:5178` and `http://localhost:5178`. The normal application uses the opposite hostname on renderer port 5181 over HTTP. The fixed-sample and recovery fixtures use the explicit HTTP-only diagnostic child. Changing normal application addresses requires coordinated changes to `rendererConfig.ts`, host URL validation, parent CSP, the child origin build input and the server port; `VITE_ISOLATED_RENDERER_URL` is only a developer-fixture input, not a production redirect mechanism. Wildcards, credentials, paths and query strings are rejected as parent origins.

## Retired public verification pages

The old `/player-check/`, `/player-check/security/` and `/player-check/worker/` pages are no longer part of the deployment contract. The check-service Dockerfile now builds a small 410 responder, and normal renderer artifacts exclude sample, worker-check and recovery-fault entry points. See [cleanup and deployment retirement](test-tools-cleanup.md) for the retained local tools and the required deployment sequence.

The following dated records describe previous deployments. They do not instruct operators to recreate the public check service or run the retired routes.

### PP-I02 deployment and live verification — October 3, 2026

The existing CloudFront distribution `E2M1AJZB7BOSN0` now serves
`assets/renderer-CutVKi26.js` (17,023,174 bytes) and its matching document.
The reviewed `pp-i02-transition-20261003` and `pp-i02-final-20261003` change sets
modified only the file allowlist, two response-header policies and distribution
cache behaviors, without replacement or new resources. Both reached
`UPDATE_COMPLETE`. The final exact-manifest HTTP verifier passed; old-script,
plain-HTTP and direct-S3 requests returned 403. Previous artifacts remain in the
versioned bucket and the operator's `.local/deployments/pp-i01-production/` backup.

Coolify's existing `mage-player-check` service is pinned to
`4c0f9e11d54f4e8a1aada362ac3373769329b49c` on `pp-i02-isolated-playback`.
Deployment `fa8dwklr5yxol2dgbdsqmij4` finished at 18:59:41 UTC. PP-I02 subsequently
merged in pull request #215. No normal frontend/backend service was rebuilt for that deployment.

The live Chromium check rendered the new player, verified its opaque boundary,
played the generated WAV, preserved music across scene replacement (0.0 to 0.2
seconds), preserved pause across replacement (17.1 seconds), sought back to
12.1 seconds and resumed. Response selection, volume and simulated-beat controls
worked, as did drag orbit and wheel zoom. A returned PNG decoded to 320 × 180
pixels. Stop removed the frame and released audio; an unavailable renderer timed
out safely, and retry rendered a fresh scene with working audio and capture.
There were no unexpected browser errors; the engine's existing duplicate-Three.js
warning remains. The intentional unavailable-host check produces a rejected frame
request as expected.

Validation passed 33 focused playback/page tests, five parent-policy tests,
seven renderer hosting tests, TypeScript, lint, the clean-install Docker build
and nginx configuration check. The clean install exposed missing audio module
exports; those are now retained in the engine patch. Live parent checks verified
the exact CSP, no-store/no-referrer/nosniff headers and missing-file 404. MAGE's
homepage still serves `/assets/index-CwcHXyJq.js` without the test-page CSP.
Normal app integration and release-gate verification remain PP-I03.

### PP-I01 live verification recorded October 3, 2026

The original fixed sample was deployed at **https://mage.peterbucci.com/player-check/** through
Coolify application `mage-player-check` (`u8rnherfuj07qyl0tbc5c8y0`), pinned to
feature-branch commit `304a8be83ce4c238e8ec228190ad1dd42b5abbe6`. Deployment
`zt41epxqm8dsmkmeo2kntkyh` finished successfully. The source branch was pushed for
this deployment; PP-I01 subsequently merged in pull request #214.

Chromium on the real HTTPS parent displayed the torus sample loaded from
CloudFront. Parent access to the renderer document was blocked; the frame had
exactly `sandbox="allow-scripts"`. The child's successful boot also confirms its
cookie, local-storage and parent-document access guards. Stop removed the iframe
with no canvas in the parent. An unavailable child timed out, removed its frame,
and offered retry; retry rendered a fresh sample and passed isolation again.
The live page's error log was empty after the successful retry.

Live HTTP checks confirmed the exact parent CSP, no-store and no-referrer
headers, and 404 for a missing test file. The main homepage still returned 200
with the same `/assets/index-CwcHXyJq.js` bundle and no test-page CSP. The existing
frontend/backend deployment was not rebuilt. Validation also passed 39 focused
host/boundary tests, three page-policy tests, TypeScript, lint, the fixture build,
the Docker build, nginx configuration validation and local container HTTP checks.

## AWS deployment — provider-issued CloudFront address

The template is prepared for the selected plan. Deployment and production-browser verification are separate from building it; record the real stack outputs and verification results when those steps succeed. Do not mark PP-I01 deployed based on a local build or template validation alone. AWS credentials must remain in the operator's CLI profile or deployment environment, never in renderer build inputs.

**AWS deployment, October 3, 2026:** deployed through the operator's signed-in AWS console session after the local `mage-local-dev` profile was denied CloudFormation access. The development user's permissions were not changed. The reviewed `initial-renderer-hosting` CREATE change set added nine resources without changing existing infrastructure, and stack creation reached `CREATE_COMPLETE`.

| Output | Deployed value |
| --- | --- |
| Stack / region | `mage-isolated-renderer` / `us-east-1` |
| Renderer origin | `https://d2wwpgc7sgvmnm.cloudfront.net` |
| Distribution ID | `E2M1AJZB7BOSN0` |
| Bucket | `mage-isolated-renderer-rendererbucket-u6lw6vmevh07` |
| Allowed parent | `https://mage.peterbucci.com` |
| Uploaded bundle | `assets/renderer-CLjwoTfj.js` (16,950,333 bytes) |
| Uploaded entry document | `index.html` (753 bytes) |

Only the two runtime files were uploaded, with the content types and cache metadata specified below. The production HTTP verifier passed against the assigned HTTPS origin, checking response policies, bundle integrity, no credentialed responses, and rejected routes/query strings/methods. Additional live checks confirmed correct MIME types, lengths, caching and HSTS, plus HTTP 403 for unencrypted viewing and direct S3 object access. Direct navigation in Chromium displayed “Open this player from MAGE.” The production-parent sample, isolation and lifecycle checks subsequently passed as recorded above; the normal application players are not connected by this deployment.

Build for MAGE's actual parent origin into a separate output folder, so the local HTTP fixture keeps its matching local bundle and headers. Production builds have no default parent and reject loopback/HTTP:

```powershell
$env:MAGE_RENDERER_PARENT_ORIGINS = 'https://mage.peterbucci.com'
npm run renderer:build:production
Remove-Item Env:MAGE_RENDERER_PARENT_ORIGINS
```

This generates `dist-isolated-renderer-production/cloudformation.json` using the **same build's** immutable script hash and security headers. There are no domain or certificate parameters: `CloudFrontDefaultCertificate: true` uses the assigned `*.cloudfront.net` address. HTTPS-only viewing is enforced. CloudFront controls the default certificate's viewer TLS policy; this route does not configure a custom minimum-TLS policy. See [CloudFront distribution settings](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesGeneral.html) for that distinction.

The template creates:

- A versioned, encrypted private S3 bucket with public access blocked and no website endpoint.
- A CloudFront origin access control that always signs requests. The bucket grants read-only access only to that distribution and denies non-TLS access.
- Exact-path viewer-request validation, HTTPS-only viewing, an immutable current bundle behavior, an uncached document behavior, and response-header policies that override origin headers. Cookies, authorization and query strings are not forwarded to S3.
- No `/api` origin, custom error-to-index redirect, app files, account cookies, analytics or request logging configuration.

Initial deployment sequence (use the existing-release sequence below when replacing a deployed build):

1. Select the approved AWS deployment profile and confirm its identity/account. Use `us-east-1` for this stack and the same explicit profile/region on every command. Validate the generated template, then inspect the `mage-isolated-renderer` stack using `describe-stacks`. The read commands below require an actual approved profile name; the blocked development profile is not a substitute.
2. Create a CloudFormation **CREATE** change set only after confirming that `mage-isolated-renderer` does not exist. An access-denied or network error is not proof that a stack is absent. If the stack already exists, inspect its status/events and use **UPDATE** for an updateable stack. Reconcile an interrupted or failed operation before creating another change set. Use the exact generated template and a unique change-set name; review the resource changes before execution. This dedicated stack must not replace MAGE's existing application infrastructure.
3. Execute the reviewed change set once, wait for successful stack creation/update and read its outputs: `BucketName`, `DistributionId`, `DistributionDomainName` and `RendererOrigin`. If an execution request times out or returns an ambiguous result, inspect the change-set execution status and stack events before proceeding; do not blindly execute or recreate it.
4. Upload **only two files**: first the exact `assets/renderer-<hash>.js` named by the build manifest, then `index.html`. Set the script content type to `text/javascript; charset=utf-8` and `Cache-Control: public, max-age=31536000, immutable`; set HTML to `text/html; charset=utf-8` and `Cache-Control: no-store`. Do not upload the whole output folder: the manifest, module audit and CloudFormation template are private deployment metadata. Do not make S3 objects public; CloudFront reads them through origin access control.
5. Wait for CloudFront propagation and verify the actual HTTPS responses and browser behavior as described below. Use the `RendererOrigin` output directly; there is no DNS record or ACM validation to perform.

Initial read/validation commands, after replacing the profile placeholder:

```powershell
$rendererDeployProfile = 'your-approved-deployment-profile'
aws sts get-caller-identity --profile $rendererDeployProfile --region us-east-1
if ($LASTEXITCODE -ne 0) { throw 'Resolve AWS identity access before continuing.' }
aws cloudformation validate-template --template-body file://dist-isolated-renderer-production/cloudformation.json --profile $rendererDeployProfile --region us-east-1
if ($LASTEXITCODE -ne 0) { throw 'Resolve template validation before continuing.' }
aws cloudformation describe-stacks --stack-name mage-isolated-renderer --profile $rendererDeployProfile --region us-east-1
```

Inspect the final command's result: only an explicit stack-does-not-exist response permits CREATE; otherwise require a successful status read before deciding how to continue. Resolve access, network and stack-state errors first. These commands intentionally do not create or execute a change set automatically.

Existing-release sequence:

1. Before rebuilding, preserve the complete previous production artifact outside `dist-isolated-renderer-production/`, which the build clears. Keep its `index.html`, immutable bundle, manifest and generated CloudFormation template together. Record the deployed parent commit or image and its routing configuration as well. Retain the old immutable S3 object; do not overwrite its hashed URL or rely on a browser cache for rollback.
2. Build and validate the new production artifact. Compare both manifests and generated templates. For a bundle-only release, the final template should change only `AllowlistedFiles`, `DocumentHeaders`, `AssetHeaders` and the distribution's exact bundle cache behavior. Investigate other changes before execution; no existing application infrastructure should be replaced.
3. Prepare a temporary transition template from those two verified artifacts. Allow only `/`, `/index.html` and the two exact old/new hashed script paths. Include both exact script hashes in the document and asset CSP, and an immutable cache behavior for each exact bundle path. Preserve every other security rule, parent origin, resource and cache policy. Do not use wildcards, broader script sources or a fallback document to bridge the releases. Keep this template as private deployment metadata.
4. Upload the new immutable script with the content type and cache metadata above, then create, review and execute a uniquely named **UPDATE** change set for the transition template. Wait for the stack update and CloudFront propagation; check that the document response permits both exact hashes and that both scripts are accessible with the expected bytes. Leave the old `index.html` in place until this transition is ready. Inspect stack/change-set status after an ambiguous execution result instead of repeating the action.
5. Upload the new `index.html` last, with `Cache-Control: no-store`. Verify the existing parent against the new renderer before replacing the parent service. PP-I02's child accepts both the original v1 sample and the v2 bridge, so test v1 compatibility as well as v2 playback, music, capture, teardown and retry from the authorized live parent. Keep normal application rollout and its release gate separate from this verification service.
6. After those checks pass, create and review a second **UPDATE** change set using the new build's unmodified final `cloudformation.json`. It removes the old hash, path and cache behavior from public access while leaving the old S3 object available for rollback. Wait for stack completion and CloudFront convergence before running the final production verifier below. The verifier intentionally requires the exact single-build headers and will reject the temporary two-hash policy.

For rollback, restore a compatible previous parent service first: an older parent can use the backward-compatible new child, but a parent requiring v2 or PP-I03's added commands cannot use a child lacking them. If the final renderer policy has already removed the old bundle, reapply the reviewed two-hash transition and wait for propagation. Restore the saved old `index.html`, verify it with the old parent, then restore the saved old final CloudFormation template and verify against that matching artifact after convergence. Existing tabs running the newer parent may need a reload. Keep the previous and current immutable bundles until the rollback window closes. See the [PP-I03 release procedure](isolated-renderer-release.md) before changing normal application services or release gates.

A mismatched document/script policy fails closed; there is no fallback to unrestricted application rendering. Never remove the sandbox or broaden CSP to recover from a mismatched deployment. Upload only runtime HTML and script files; the manifests, audits and templates stay private.

Once the final CloudFront policy has converged, verify against the **matching production build**. Replace the illustrative hostname with the stack's `RendererOrigin` output:

```powershell
$env:MAGE_RENDERER_VERIFY_ORIGIN = 'https://d123example.cloudfront.net'
npm run renderer:verify:production
Remove-Item Env:MAGE_RENDERER_VERIFY_ORIGIN
```

Also run the browser isolation checks from the actual deployed parent: headers alone do not prove iframe behavior or successful WebGL. The production parent allowlist contains only `https://mage.peterbucci.com`; do not add localhost or wildcards to the production artifact just to make a local check connect. The main custom-rendering release gate stays off until the PP-I02/PP-I03 integration and release checks pass. This hosting change does not connect the normal app players to the renderer.

### Traffic and costs

Rendering happens in the visitor's browser. Hosting charges come from CloudFront data transfer, requests and the request-validation function, plus S3 storage and requests. S3 versioning also retains prior file versions for rollback. No renderer compute instance, domain registration, Route 53 zone or custom certificate is needed for this plan.

The PP-I04 local bundle is about 17.70 MB, including about 665 KB of embedded compiler-worker code, before transfer compression. At that size, a conservative decimal 1 TB budget corresponds to roughly 56,000 complete downloads; budgeting around 50,000 leaves room for other requests and estimation differences. The worker runs on the visitor's device and adds no server compute service. The bundle is shared across scenes and has an immutable URL, allowing browser caching when supported. Builds, cache eviction and browser cache partitioning affect actual repeat downloads.

The pay-as-you-go 1 TB allowance discussed for this plan is **account-wide**, not reserved for this distribution and not a hard spending cap. It does not stop delivery at 1 TB. Verify the account's plan and current [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/) and [S3 pricing](https://aws.amazon.com/s3/pricing/); monitor billed usage and set billing notifications appropriate to the account. This deployment template does not create a budget, spending cutoff or usage monitor.

## Limits and required browser checks

### Local verification recorded October 3, 2026

The Codex in-app Chromium browser rendered the known torus sample under the real
standalone HTTP response policy at `http://localhost:5181`, embedded from
`http://127.0.0.1:5178`. The child boot guard confirmed that its cookie and local
storage getters, and access to the parent document, throw `SecurityError`.
The parent fixture separately confirmed its access to the child document throws
`SecurityError`. These checks run in the actual pages, not an automation DOM proxy.

Stop removed the iframe; the parent contained no canvas. A missing renderer
document timed out to the safe retry state and removed the iframe with no parent
fallback. Direct renderer navigation displayed “Open this player from MAGE” and
did not start the sample. Real header/route/integrity verification passed for the
same built artifact. The main application build remains separate and unchanged.

Validation passed: 75 focused renderer/protocol/host/boundary tests, six hosting
tests, TypeScript, ESLint, the standalone build and the main application build.
The existing engine eval and size warnings remain. Local HTTPS and additional
browser engines have a documented test setup but were not exercised here.
Production CloudFront response checks subsequently passed as recorded above;
production-parent sample and lifecycle checks also passed as recorded above.
Do not treat these fixed-sample checks as PP-I03's arbitrary-code release approval.

The provider-address follow-up passed 34 host tests and seven hosting tests,
TypeScript, ESLint, and the production renderer build for
`https://mage.peterbucci.com`. The production bundle and generated template were
checked against their manifest, and live local HTTP verification still passed
using the separate local artifact. AWS CLI template validation was denied by the
development profile; the operator's console session subsequently created and
executed the reviewed change set successfully.

### Remaining guarantees and limits

This separates the account-bearing page from shader execution. It is not a guarantee against GPU hangs, browser defects or all CPU denial of service. Render budgets and removal/timeout handling reduce the impact; browser process allocation and GPU scheduling remain browser-controlled. A separate registrable site encourages site isolation but does not guarantee a dedicated GPU process.

Iframe sandbox flags block parent navigation, popups, downloads, forms and same-origin access. They do not completely ban a child from navigating its **own** frame in every browser. The embedding page's strict `frame-src`, child-load monitoring and disposal are additional checks, not a claim of a universal network or resource sandbox. Browser verification must cover self-navigation/redirect attempts, lost child documents, direct navigation, denied requests, cookie/storage access and parent DOM access. Never send auth tokens, private account data or arbitrary fetch URLs into this renderer. The retained v1 protocol accepts only the fixed sample and disposal commands; v2 adds the bounded playback bridge above.

The HTTP verifier checks actual response policies, immutable integrity, no cookies, method rejection and route rejection. The Node tests cover exact origins, manifest tampering, local HTTP behavior and generated CloudFront behavior. The historical checks above cover the deployed sample and PP-I02 bridge. The [PP-I03 record](isolated-renderer-release.md) separately tracks adversarial probes and normal application integration. Neither fixture success nor a local test enables public custom execution; production verification and the supported-browser matrix remain release conditions.

References: [CSP external script hashes and evaluation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src), [CloudFront response headers policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-response-headers-policies.html), [private S3 origins with OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html).

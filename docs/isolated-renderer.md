# Isolated renderer (PP-I01 / PP-I02)

PP-I01 provides a separately built, hosted player and a fixed-sample check. PP-I02 adds a versioned playback bridge and a local music/control check. Neither story enables Advanced mode or changes the public custom-rendering gate. Routing every normal player and verifying the release gate remain PP-I03. The deployed CloudFront/player-check sample remains the previously verified PP-I01 build until a coordinated bridge deployment.

## PP-I02 playback bridge

Open `http://127.0.0.1:5178/scripts/isolated-playback-check.html` with the local renderer on `http://localhost:5181`. Start the player, use **Play test rhythm** or select a local audio file, then switch scenes, pause/resume, seek, toggle simulated beat, choose Original/Selective response, drag, zoom, and capture a frame. The fixture uses the exported `createIsolatedPlayer` boundary. It is not a production custom-code authoring surface.

- Protocol v2 uses a fresh session, monotonic request IDs, and a new generation for each scene. The child chooses v1 fixed-sample or v2 playback once from the first authorized bootstrap. The parent transfers a private MessagePort to the exact iframe window. The sole `targetOrigin='*'` is this payload-free opaque-origin bootstrap; the child checks the exact parent source and allowed origin. Window messages are not accepted as playback replies.
- Load data is bounded and validated with the shared submission/resource policy in both parent and child. Template source is resolved from the immutable library inside the child. No bearer tokens, cookies, profile objects, file contents, media addresses, or fetch instructions appear in protocol messages. Unknown fields and command types are rejected.
- Parent Web Audio owns decoding, transport, volume, seek, and analysis. The same session survives scene replacement. A source is at most 64 MiB; URL fetches omit credentials/referrers and reject redirects. The worklet receives parent audio; only numeric levels, up to 16 hits, the legacy FFT64 bin-2 amplitude, and bounded clocks reach the renderer. Real playing audio takes precedence over simulated beats.
- Inputs are coalesced at roughly 30 Hz, retaining intervening hits. Limits are 90 commands/s, 45 child replies/s, 4 loads/s and 2 captures/s. Resize, pointer and zoom have one pending value each. Diagnostics are fixed codes, displayed as text. There is one current scene load, one capture, and one parent image decode. Stale work cannot complete a newer generation.
- The engine patch provides external audio and an external visual clock. Authored animation speed and saved time are preserved; interpolation stops after 250 ms without new clock input. Legacy and mapped music response, pointer deformation, left-drag orbit and optional wheel zoom stay inside the renderer. Touch camera gestures and browser Ctrl/Meta-wheel zoom remain outside these controls.
- Render ceilings come from `getRenderBudget(profile)`, never submitted data. Scene/effect validation runs before loading. This bridge conservatively renders at DPR 1, with full/preview pixel, edge, FPS and raymarch ceilings. Size updates cannot raise those ceilings. Zoom stays within 0.4–2.5 times the authored camera distance.
- Captures are requested, limited to the shared preview pixel/edge ceiling and 1 MiB, and transferred as PNG/JPEG/WebP bytes. The parent checks the request/generation, MIME signature, encoded dimensions, decoded dimensions and requested size before returning a Blob. URLs, HTML, SVG, unexpected formats and unsolicited captures are rejected. Timeouts/disposal reject pending captures and release frame/port/timer resources; an in-flight browser image decode may finish later and its bitmap is closed.
- Startup has a parent-observed 15-second timeout; active foreground progress has a 10-second timeout. Completed-frame progress is throttled to twice per second. Intentional pause/background suspension does not produce false progress failures. Failures remove the frame, stop sampling and pause parent audio, with a typed callback for PP-R01 integration. A claimed frame/heartbeat is only a liveness signal, not proof of safe source.

PP-I03 must apply availability checks, revocation, recovery leases and retry rules around this adapter on every normal app entry point. There must be no parent-side custom-source fallback. The local fixture does not enable the public arbitrary-code release gate. This story does not claim that source limits prevent infinite loops, that JavaScript can cancel a GPU hang, or that a receiver can prevent structured-clone allocation before delivery. A hostile child can defeat its own engine limits or lie about progress; the browser sandbox, separate site, parent teardown and later release-gate verification remain necessary.

### Local regression checks

```powershell
npx vitest run src/modules/player/isolation src/isolated-renderer src/modules/player/infrastructure/engineExternalAudio.test.ts src/modules/player/infrastructure/engineClock.test.ts
npm run renderer:build
npm run renderer:serve
npm run renderer:verify
```

The local server retains a verified build in memory; restart it after rebuilding. Parent and child must both contain protocol v2 before using the music check. The original v1 sample and dedicated live `/player-check/` service continue to work independently.

Browser verification on October 3, 2026 used Chromium with the real response-header sandbox and CSP on the local cross-site pair. Verified visible rendering, real parent Web Audio from a generated WAV, music time continuing across a scene switch (0.2 to 0.4 seconds), pause preservation across a switch (0.6 seconds), resume/seek, both response modes, simulated beats, pointer/zoom interaction, a decoded PNG preview, and removal of the iframe on Stop. Scene replacement uses a new canvas after disposing the old engine so delayed WebGL context loss cannot stop the new scene. Production v2 deployment and the full multi-browser/public-source release checks remain ahead.

## Hosting boundary

This implementation requires the renderer to use a different **registrable domain** from MAGE in production. MAGE is hosted at `https://mage.peterbucci.com`; the renderer will use the HTTPS hostname assigned by CloudFront, such as `https://d123example.cloudfront.net`. That example hostname is illustrative, not a provisioned resource. A sibling such as `https://player.peterbucci.com` does not meet this story's chosen separate-site boundary. The iframe sandbox remains the core access restriction; the separate site adds browser isolation where supported.

The selected hosting plan needs no additional domain purchase, Route 53 zone, DNS changes or custom ACM certificate. CloudFront supplies the hostname and certificate. MAGE's existing Coolify/frontend/backend deployment stays in place; CloudFront and its private S3 bucket host only the separate renderer files.

Only `src/isolated-renderer/main.ts`, its child implementation, the small shared protocol, fixed render-budget policy and the engine are bundled. The build rejects other workspace modules and emits one classic IIFE with all engine assets embedded. It does not load the app's Vite configuration, public directory or environment files. No API client, account session, auth code, telemetry or service worker is included. The allowed parent origins are an explicit build input, not a URL parameter or message field.

Each build's `hosting-manifest.json` is the source of its response headers and generated CloudFormation policies. Local output lives in `dist-isolated-renderer/`; `renderer:build:production` uses `dist-isolated-renderer-production/` so the two do not overwrite each other:

- Response-header `sandbox allow-scripts` creates an opaque origin even when somebody navigates directly to the renderer. The parent iframe also uses only `allow-scripts`.
- CSP defaults to no resources. It allows the exact immutable script hash with SRI and a fixed stylesheet hash. There is no broad `self`, remote script, inline-script or worker allowance. Only the renderer permits `unsafe-eval`, which the existing Shader Park compiler requires.
- Embedded `data:`/`blob:` images support engine skyboxes; external images, requests, frames, workers, media, objects, fonts and form submission are denied. The parent controls the exact allowed frame source as well.
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

Open `http://127.0.0.1:5178/scripts/isolated-renderer-check.html`. Start the sample, stop it, and try the unavailable-player case. A failed host must leave a retryable error with no main-page engine fallback. This developer fixture is not bundled into the main application.

The renderer build defaults to allowing parent origins `http://127.0.0.1:5178` and `http://localhost:5178`. The parent host deliberately permits only the local cross-site pair `127.0.0.1:5178` → `localhost:5181`, using matching HTTP or HTTPS. Changing ports requires changing that host rule and the developer fixture's frame policy as well as setting `MAGE_RENDERER_PARENT_ORIGINS` before building, `MAGE_RENDERER_PORT` before serving and the matching `VITE_ISOLATED_RENDERER_URL`. Wildcards, credentials, paths and query strings are rejected as parent origins.

### Optional HTTPS parity check

For an HTTPS test, use an existing locally trusted development certificate covering **both** `127.0.0.1` and `localhost`. Store its key outside tracked files (for example `.local/certs/`). A tool such as `mkcert` can prepare one, but installing a local certificate authority is a separate machine setup step; these scripts do not install trust or bypass certificate verification.

Stop the HTTP development servers before reusing their ports. In the renderer terminal:

```powershell
$env:MAGE_RENDERER_PARENT_ORIGINS = 'https://127.0.0.1:5178,https://localhost:5178'
$env:MAGE_RENDERER_TLS_CERT = 'C:\path\to\local-cert.pem'
$env:MAGE_RENDERER_TLS_KEY = 'C:\path\to\local-key.pem'
npm run renderer:build
npm run renderer:serve
```

In the app terminal:

```powershell
$env:MAGE_PARENT_TLS_CERT = 'C:\path\to\local-cert.pem'
$env:MAGE_PARENT_TLS_KEY = 'C:\path\to\local-key.pem'
$env:VITE_ISOLATED_RENDERER_URL = 'https://localhost:5181/index.html'
npx vite --config deployment/isolated-renderer/local-https.vite.config.mjs
```

Then open `https://127.0.0.1:5178/scripts/isolated-renderer-check.html`. The companion configuration changes only the local HTTPS server and developer fixture's frame policy. For command-line verification, set `MAGE_RENDERER_VERIFY_ORIGIN=https://localhost:5181` and supply the local CA to Node via `NODE_EXTRA_CA_CERTS` if it is not already trusted; never disable TLS verification. Clear these session environment variables before returning to the default HTTP workflow.

## Live parent verification page

`npm run player-check:build` builds a separate, fixed-sample parent page into
`dist-player-check/`. Its module allowlist admits only the test UI, parent-boundary
check, renderer host and protocol; it cannot import the MAGE engine, account code
or API clients. The production parent and CloudFront URL are fixed at build time.
The page refuses to start outside `https://mage.peterbucci.com`.

The dedicated `deployment/isolated-renderer/Dockerfile.player-check` serves this
artifact at `/player-check/`, using `nginx.player-check.conf`. Deploy it as a
separate Coolify application with repository root `/`, container port `80`, and
domain `https://mage.peterbucci.com/player-check`. Preserve the path prefix.
Coolify generates a StripPrefix middleware for a domain containing a path. For
this service, disable read-only labels, remove that middleware's definition and
router reference, and restrict both routers to this rule:

```text
Host(`mage.peterbucci.com`) && (Path(`/player-check`) || PathPrefix(`/player-check/`))
```

Keep HTTPS and port 80 routing. If using Caddy instead, use `handle` rather than `handle_path` and omit
the generated SPA `try_files` fallback. Do not apply these labels to the main app.
Only that prefix routes to this container; the existing MAGE frontend/backend
resources and versions remain unchanged. This is a verification service, not the
renderer host or a replacement for normal app players.

The page has external integrity-checked assets, no arbitrary renderer address or
shader input, no API requests, `no-store` and `noindex` responses, and a CSP which
permits frames only from the deployed CloudFront origin. Missing files return
404 rather than the application's SPA fallback. The parent has no response
sandbox and does not permit `unsafe-eval` or inline styles/scripts.

After deployment, open `https://mage.peterbucci.com/player-check/`: start the
sample, confirm the rendered image and parent-access check, stop it, then test
the unavailable player and retry. Successful child startup also requires its
cookie, local-storage and parent-document access checks to throw `SecurityError`.
The fixed-sample protocol does not exercise child-initiated network requests or
self-navigation; do not describe those as browser-tested by this page.

### Live verification recorded October 3, 2026

The page is deployed at **https://mage.peterbucci.com/player-check/** through
Coolify application `mage-player-check` (`u8rnherfuj07qyl0tbc5c8y0`), pinned to
feature-branch commit `304a8be83ce4c238e8ec228190ad1dd42b5abbe6`. Deployment
`zt41epxqm8dsmkmeo2kntkyh` finished successfully. The source branch was pushed for
this deployment but has not been merged into main.

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

Deployment sequence:

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

Each child release must update the generated edge allowlist/header policies and upload the corresponding HTML/script together. Keep the previous artifact and immutable script for rollback. During propagation, a mismatched script hash should fail closed; there is intentionally no fallback to unrestricted application rendering. Rollback restores the earlier CloudFormation artifact and its matching `index.html`; never loosen CSP to resolve a mismatched deployment.

Once CloudFront is ready, verify against the **matching production build**. Replace the illustrative hostname with the stack's `RendererOrigin` output:

```powershell
$env:MAGE_RENDERER_VERIFY_ORIGIN = 'https://d123example.cloudfront.net'
npm run renderer:verify:production
Remove-Item Env:MAGE_RENDERER_VERIFY_ORIGIN
```

Also run the browser isolation checks from the actual deployed parent: headers alone do not prove iframe behavior or successful WebGL. The production parent allowlist contains only `https://mage.peterbucci.com`; do not add localhost or wildcards to the production artifact just to make a local check connect. The main custom-rendering release gate stays off until the PP-I02/PP-I03 integration and release checks pass. This hosting change does not connect the normal app players to the renderer.

### Traffic and costs

Rendering happens in the visitor's browser. Hosting charges come from CloudFront data transfer, requests and the request-validation function, plus S3 storage and requests. S3 versioning also retains prior file versions for rollback. No renderer compute instance, domain registration, Route 53 zone or custom certificate is needed for this plan.

The measured local bundle is about 16.95 MB, excluding any transfer compression. At that size, a conservative decimal 1 TB budget corresponds to roughly 59,000 complete downloads; budgeting around 50,000 leaves room for other requests and estimation differences. The bundle is shared across scenes and has an immutable URL, allowing browser caching when supported. Builds, cache eviction and browser cache partitioning affect actual repeat downloads.

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

Iframe sandbox flags block parent navigation, popups, downloads, forms and same-origin access. They do not completely ban a child from navigating its **own** frame in every browser. The embedding page's strict `frame-src`, child-load monitoring and disposal are additional checks, not a claim of a universal network or resource sandbox. Browser verification must cover self-navigation/redirect attempts, lost child documents, direct navigation, denied requests, cookie/storage access and parent DOM access. Never send auth tokens, private account data or arbitrary fetch URLs into this renderer. PP-I01's protocol accepts only the fixed sample and disposal commands.

The HTTP verifier checks actual response policies, immutable integrity, no cookies, method rejection and route rejection. The Node tests cover exact origins, manifest tampering, local HTTP behavior and generated CloudFront behavior. The recorded browser checks cover the fixed sample, DOM/storage boundary, teardown and recovery. Hosting and the production-parent sample are deployed and verified; broader custom-code and browser-engine checks remain part of the integration/release work. Neither the fixture nor its successful result enables arbitrary custom execution in normal players.

References: [CSP external script hashes and evaluation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src), [CloudFront response headers policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-response-headers-policies.html), [private S3 origins with OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html).

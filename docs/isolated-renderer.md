# Isolated renderer (PP-I01)

PP-I01 provides a separately built, hosted player and a developer check that runs a fixed sample. It does **not** enable Advanced mode, accept user source through its message protocol, move production players to iframes, or relax the global custom-rendering gate. The audio/control bridge is PP-I02; routing every custom entry point and release verification is PP-I03.

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

Only the two runtime files were uploaded, with the content types and cache metadata specified below. The production HTTP verifier passed against the assigned HTTPS origin, checking response policies, bundle integrity, no credentialed responses, and rejected routes/query strings/methods. Additional live checks confirmed correct MIME types, lengths, caching and HSTS, plus HTTP 403 for unencrypted viewing and direct S3 object access. Direct navigation in Chromium displayed “Open this player from MAGE.” Production-parent embedded sample, isolation and lifecycle checks remain pending; the normal application players are not connected by this deployment.

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
production-parent embedded browser checks remain pending. Do not treat this
local record as PP-I03's arbitrary-code release approval.

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

The HTTP verifier checks actual response policies, immutable integrity, no cookies, method rejection and route rejection. The Node tests cover exact origins, manifest tampering, local HTTP behavior and generated CloudFront behavior. Browser checks cover the remaining browser-enforced boundaries and successful sample rendering. Hosting is deployed and its HTTPS responses verified; production-parent embedded browser verification remains outstanding before this story can be closed.

References: [CSP external script hashes and evaluation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src), [CloudFront response headers policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-response-headers-policies.html), [private S3 origins with OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html).

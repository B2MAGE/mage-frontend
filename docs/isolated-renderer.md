# Isolated renderer (PP-I01)

PP-I01 provides a separately built, hosted player and a developer check that runs a fixed sample. It does **not** enable Advanced mode, accept user source through its message protocol, move production players to iframes, or relax the global custom-rendering gate. The audio/control bridge is PP-I02; routing every custom entry point and release verification is PP-I03.

## Hosting boundary

The renderer must use a different **registrable domain** from MAGE in production. For example, an app at `https://app.example.com` needs a renderer on another site such as `https://player.example-renderer.net`; `https://renderer.example.com` is not sufficient. Domains in this document are illustrative, not provisioned resources.

Only `src/isolated-renderer/main.ts`, its child implementation, the small shared protocol, fixed render-budget policy and the engine are bundled. The build rejects other workspace modules and emits one classic IIFE with all engine assets embedded. It does not load the app's Vite configuration, public directory or environment files. No API client, account session, auth code, telemetry or service worker is included. The allowed parent origins are an explicit build input, not a URL parameter or message field.

`dist-isolated-renderer/hosting-manifest.json` is the source of the local server's response headers and the production CloudFormation policies:

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

## AWS handoff — not deployed yet

This implementation prepares deployment artifacts; it does not create or change AWS resources. The generated CloudFormation configuration has local structural tests, but has **not** been validated by the AWS service or deployed. The next external step is to choose a dedicated renderer domain on another registrable site, then supply its validated **ACM certificate in `us-east-1`** and configure DNS. The owner also needs to approve the new CloudFront distribution and private S3 bucket in the intended AWS account.

Build for the actual parent origin (production builds have no default and reject loopback/HTTP):

```powershell
$env:MAGE_RENDERER_PARENT_ORIGINS = 'https://app.example.com'
npm run renderer:build -- --production
```

This generates `dist-isolated-renderer/cloudformation.json` using the **same** immutable script hash and security headers as the local build. The deployment has two parameters: `RendererDomainName` and `CertificateArn`. Review a CloudFormation change set before creating the stack. No AWS credentials belong in any renderer build input.

The template creates:

- A versioned, encrypted private S3 bucket with public access blocked and no website endpoint.
- A CloudFront origin access control that always signs requests. The bucket grants read-only access only to that distribution and denies non-TLS access.
- Exact-path viewer-request validation, HTTPS-only viewing, an immutable current bundle behavior, an uncached document behavior, and response-header policies that override origin headers. Cookies, authorization and query strings are not forwarded to S3.
- No `/api` origin, custom error-to-index redirect, app files, account cookies, analytics or request logging configuration.

After reviewing and applying the stack, upload **only** `index.html` and the exact `assets/renderer-<hash>.js` named by the manifest. Set HTML content type to `text/html; charset=utf-8` with `Cache-Control: no-store`, and the script to `text/javascript; charset=utf-8` with `Cache-Control: public, max-age=31536000, immutable`. Do not upload the whole build folder: the manifest, module audit and CloudFormation template are deployment metadata, not public resources. Add the renderer DNS record pointing to the distribution's reported domain. The stack outputs bucket name, distribution ID and renderer origin.

Each child release must update the generated edge allowlist/header policies and upload the corresponding HTML/script together. Keep the previous artifact and immutable script for rollback. During propagation, a mismatched script hash should fail closed; there is intentionally no fallback to unrestricted application rendering. Rollback restores the earlier CloudFormation artifact and its matching `index.html`; never loosen CSP to resolve a mismatched deployment.

Once DNS and CloudFront are ready, set `MAGE_RENDERER_VERIFY_ORIGIN` to the new HTTPS origin and run `renderer:verify` against the **matching production build**. Also run the browser isolation checks from the actual deployed parent: headers alone do not prove iframe behavior or successful WebGL. The main custom-rendering release gate stays off until the PP-I02/PP-I03 integration and release checks pass.

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
browser engines have a documented test setup but were not exercised here;
production DNS, CloudFront headers and the deployed browser checks are still
pending. Do not treat this local record as PP-I03's arbitrary-code release approval.

### Remaining guarantees and limits

This separates the account-bearing page from shader execution. It is not a guarantee against GPU hangs, browser defects or all CPU denial of service. Render budgets and removal/timeout handling reduce the impact; browser process allocation and GPU scheduling remain browser-controlled. A separate registrable site encourages site isolation but does not guarantee a dedicated GPU process.

Iframe sandbox flags block parent navigation, popups, downloads, forms and same-origin access. They do not completely ban a child from navigating its **own** frame in every browser. The embedding page's strict `frame-src`, child-load monitoring and disposal are additional checks, not a claim of a universal network or resource sandbox. Browser verification must cover self-navigation/redirect attempts, lost child documents, direct navigation, denied requests, cookie/storage access and parent DOM access. Never send auth tokens, private account data or arbitrary fetch URLs into this renderer. PP-I01's protocol accepts only the fixed sample and disposal commands.

The HTTP verifier checks actual response policies, immutable integrity, no cookies, method rejection and route rejection. The Node tests cover exact origins, manifest tampering, local HTTP behavior and generated CloudFront behavior. Browser checks cover the remaining browser-enforced boundaries and successful sample rendering. Production deployment and production-browser verification remain outstanding until the AWS handoff is completed.

References: [CSP external script hashes and evaluation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src), [CloudFront response headers policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-response-headers-policies.html), [private S3 origins with OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html).

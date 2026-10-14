# Frontend Deployment

For full frontend plus backend deployment instructions, including plain Docker and Coolify, see the versioned [full-stack deployment guide](https://github.com/B2MAGE/mage-backend/blob/main/docs/full-stack-deployment.md).

The guide was merged into backend `main` by [backend PR #144](https://github.com/B2MAGE/mage-backend/pull/144). Source merges do not deploy services or transfer a developer's local scene database.

This repository is designed to be deployed with a same-origin routing setup.

## Supported Production Model

The intended production contract is:

- the frontend is served from the public app origin
- `/api/*` is routed to the backend by the reverse proxy
- browser requests do not call a second public API origin directly

This keeps deployment aligned with the current auth flow and avoids introducing CORS requirements into the supported path.

The one exception is scene thumbnail uploads: when the create scene flow has a thumbnail to persist, the browser uploads that generated image directly to the configured object-storage provider using a presigned `PUT` URL issued by the backend.

## Container Notes

The frontend repo includes:

- a production `Dockerfile`
- an nginx config with SPA fallback

The frontend nginx owns the retired `/player-check` prefix and returns 410 instead
of an SPA fallback. There is no check-service image to build or deploy. See
[removing an existing retirement service](test-tools-cleanup.md#deployment-retirement).

SPA fallback is required because the app uses `BrowserRouter`, so direct loads of routes like `/login` and `/register` must return `index.html`.

## Reverse Proxy Expectations

At the public edge:

- `/` and client routes should go to the frontend container
- `/api/*` should go to the backend container
- direct thumbnail uploads should go from the browser to the configured object-storage provider, not through the frontend or backend containers

Example:

```text
https://mage.example.com/        -> frontend
https://mage.example.com/api/*   -> backend
```

## Separate Renderer Hosting (PP-I01)

MAGE remains at `https://mage.peterbucci.com` on its existing deployment. The
isolated renderer uses a separate CloudFront-assigned HTTPS address, such as
`https://d123example.cloudfront.net`, backed by a private S3 bucket. That hostname
is illustrative; use the deployment's `RendererOrigin` output. No new domain,
Route 53 zone, DNS change or custom ACM certificate is required. CloudFront
provides the certificate and controls its default viewer TLS policy.

Follow [isolated renderer](isolated-renderer.md) for the separate production
build, template validation, CloudFormation change-set review, two-file upload
and verification steps. The renderer is a restricted static site: do not reuse
the app container's SPA fallback, proxy its execution through `/api`, or publish
deployment metadata with its HTML and hashed script. Production allows only the
parent origin `https://mage.peterbucci.com`.

The separate renderer and normal app integration are deployed; the approved custom-playback rollout is recorded in [the release record](isolated-renderer-release.md). CloudFront/S3 usage charges remain separate from the existing server. Manual verification tools run locally only; the retired verification service is not part of this deployment.

## Local Development

Use the [README startup sequence](../README.md#getting-started): backend with
MinIO, `npm run dev` on `http://127.0.0.1:5178`, and `npm run renderer:serve` on
the opposite loopback hostname at port 5181. Vite proxies `/api` to
`http://localhost:8080`. Thumbnail storage CORS and password-reset links must
use that same frontend origin. `npm run verify` checks the checkout without
publishing an app or renderer.

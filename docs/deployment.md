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

Its production deployment and browser verification must be completed before the
later PP-I03 release gate can enable custom scenes. PP-I01's developer check does
not yet replace the app's normal scene players; that connection remains in the
following integration stories. CloudFront/S3 usage charges are separate from the
existing server, and any account-wide transfer allowance is not a spending cap.

## Local Development

None of this changes local development:

- `npm run dev` still uses the Vite `/api` proxy
- local auth flows still target `http://localhost:8080` through that proxy
- local thumbnail uploads require the active provider CORS rules to allow your local frontend origin, such as `http://localhost:5173`

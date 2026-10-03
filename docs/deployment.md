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

## Local Development

The separately hosted PP-I01 renderer has its own build, local server and AWS
deployment artifact. Follow [isolated renderer](isolated-renderer.md); never serve
its custom execution on the application origin or proxy it through `/api`.
Its production deployment and browser verification must be completed before the
later PP-I03 release gate can enable custom scenes.

None of this changes local development:

- `npm run dev` still uses the Vite `/api` proxy
- local auth flows still target `http://localhost:8080` through that proxy
- local thumbnail uploads require the active provider CORS rules to allow your local frontend origin, such as `http://localhost:5173`

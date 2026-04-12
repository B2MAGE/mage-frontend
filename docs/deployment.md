# Frontend Deployment

This repository is designed to be deployed with a same-origin routing setup.

## Supported Production Model

The intended production contract is:

- the frontend is served from the public app origin
- `/api/*` is routed to the backend by the reverse proxy
- browser requests do not call a second public API origin directly

This keeps deployment aligned with the current auth flow and avoids introducing CORS requirements into the supported path.

The one exception is preset thumbnail uploads: when a user selects a thumbnail in the create preset flow, the browser uploads that file directly to the configured object-storage provider using a presigned `PUT` URL issued by the backend.

## Build-Time API Configuration

The frontend builds API URLs through `buildApiUrl()` in `src/lib/api.ts`.

For the supported deployment path:
- leaving `VITE_API_BASE_URL` unset works because requests default to `/api/*`
- setting `VITE_API_BASE_URL=/api` at build time also works if you want the deployment configuration to be explicit
- no extra frontend env var is required for thumbnail delivery because the backend persists the final public `thumbnailRef` URL

## Container Notes

The frontend repo includes:
- a production `Dockerfile`
- an nginx config with SPA fallback
- a `postinstall` hook that reapplies local `patch-package` patches during `npm install` and `npm ci`

SPA fallback is required because the app uses `BrowserRouter`, so direct loads of routes like `/login` and `/register` must return `index.html`.

The Shader Park production compatibility fix is expected to come from that checked-in patching step, not from disabling Vite optimizations. Production builds should continue to use the normal `vite build` minification and tree-shaking behavior.

For container builds, the `patches/` directory must be copied into the image before `npm ci` runs. If `npm ci` runs before `patches/` is present, `patch-package` will not apply the Shader Park fix and the deployed bundle can regress to runtime errors such as `input is not defined`.

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

None of this changes local development:

- `npm run dev` still uses the Vite `/api` proxy
- local auth flows still target `http://localhost:8080` through that proxy
- local thumbnail uploads require the active provider CORS rules to allow your local frontend origin, such as `http://localhost:5173`

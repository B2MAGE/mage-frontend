# Frontend Deployment

This repository is designed to be deployed with a same-origin routing setup.

## Supported Production Model

The intended production contract is:

- the frontend is served from the public app origin
- `/api/*` is routed to the backend by the reverse proxy
- browser requests do not call a second public API origin directly

This keeps deployment aligned with the current auth flow and avoids introducing CORS requirements into the supported path.

## Build-Time API Configuration

The frontend builds API URLs through `buildApiUrl()` in `src/lib/api.ts`.

For the supported deployment path:
- leaving `VITE_API_BASE_URL` unset works because requests default to `/api/*`
- setting `VITE_API_BASE_URL=/api` at build time also works if you want the deployment configuration to be explicit

## Container Notes

The frontend repo includes:
- a production `Dockerfile`
- an nginx config with SPA fallback
- a `postinstall` hook that reapplies local `patch-package` patches during `npm install` and `npm ci`

SPA fallback is required because the app uses `BrowserRouter`, so direct loads of routes like `/login` and `/register` must return `index.html`.

The Shader Park production compatibility fix is expected to come from that checked-in patching step, not from disabling Vite optimizations. Production builds should continue to use the normal `vite build` minification and tree-shaking behavior.

## Reverse Proxy Expectations

At the public edge:

- `/` and client routes should go to the frontend container
- `/api/*` should go to the backend container

Example:

```text
https://mage.example.com/        -> frontend
https://mage.example.com/api/*   -> backend
```

## Local Development

None of this changes local development:

- `npm run dev` still uses the Vite `/api` proxy
- local auth flows still target `http://localhost:8080` through that proxy
- no deployment-only configuration is required for standard local work

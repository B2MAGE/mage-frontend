# Frontend Deployment

This repository is designed to be deployed with a same-origin routing setup.

## Supported Production Model

The intended production contract is:

- the frontend is served from the public app origin
- `/api/*` is routed to the backend by the reverse proxy
- browser requests do not call a second public API origin directly

This keeps deployment aligned with the current auth flow and avoids introducing CORS requirements into the supported path.

The one exception is scene thumbnail uploads: when a user selects a thumbnail in the create scene flow, the browser uploads that file directly to the configured object-storage provider using a presigned `PUT` URL issued by the backend.

## Container Notes

The frontend repo includes:

- a production `Dockerfile`
- an nginx config with SPA fallback
- a `postinstall` hook that reapplies local `patch-package` patches during `npm install` and `npm ci`

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

None of this changes local development:

- `npm run dev` still uses the Vite `/api` proxy
- local auth flows still target `http://localhost:8080` through that proxy
- local thumbnail uploads require the active provider CORS rules to allow your local frontend origin, such as `http://localhost:5173`

# MAGE Frontend

Frontend for the MAGE project, built with React, TypeScript, and Vite.

Right now this app contains the first real account-management flows for the platform: registration and login pages backed by the Spring Boot authentication API plus a shared frontend auth session.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Local backend configuration

For local development, the Vite dev server proxies these backend routes to `http://localhost:8080`:

- `POST /auth/register`
- `POST /auth/login`
- `GET /users/me`
- `/presets/*`

With the proxy in place, the frontend can keep using same-origin requests such as `/auth/login` while the backend runs separately on port `8080`.

No frontend environment variables are required for this local proxy-based setup.

To run the backend locally, start the backend stack from the `mage-backend` repository with:

```bash
docker compose up --build
```

The backend quick-start and local run details are documented in `mage-backend/docs/getting-started.md`.

`VITE_API_BASE_URL` is still supported for deployed or intentionally cross-origin setups. When it is set, the frontend sends requests directly to that origin instead of using the local Vite proxy:

```text
${VITE_API_BASE_URL}/auth/register
${VITE_API_BASE_URL}/auth/login
${VITE_API_BASE_URL}/users/me
```

Leave `VITE_API_BASE_URL` unset for normal localhost development so the proxy handles auth and current-user requests.

## Routing

The app uses `react-router-dom` with `BrowserRouter` for clean client-side URLs.

Available routes:

- `/`
- `/register`
- `/login`

Note: direct loads of nested routes in production require the host to rewrite unknown paths back to `index.html`.

## Registration page

The registration flow lives at `/register` and currently supports:

- display name, email, and password inputs
- client-side validation before submission
- loading and disabled submit state during the request
- success confirmation after a successful registration
- backend validation and conflict error messaging in the UI
- responsive layout for desktop and mobile

Additional implementation notes are in `docs/registration-page.md`.

## Login page

The login flow lives at `/login` and currently supports:

- email and password inputs
- client-side validation before submission
- loading and disabled submit state during the request
- storing the returned `accessToken` in shared frontend auth state
- restoring the authenticated user on refresh through `GET /users/me`
- backend validation and invalid-credential error messaging in the UI
- logout from the shared app shell
- responsive layout for desktop and mobile

The page submits credentials to `POST /auth/login`, persists the returned `accessToken`, and uses `GET /users/me` during app bootstrap when a stored token exists. Authenticated frontend requests can reuse the stored bearer token through the shared auth helper.

Additional implementation notes are in `docs/login-page.md`.

## Scripts

- `npm run dev` starts the local development server
- `npm run build` creates a production build
- `npm run preview` previews the production build locally
- `npm run lint` runs ESLint
- `npm run test` runs the frontend test suite with Vitest

## Current status

- Landing page for the MAGE platform
- Registration page connected to the backend registration endpoint
- Login page connected to the backend login endpoint
- Shared frontend auth session with token persistence, bootstrap restore, and logout
- Header navigation between pages without full page reloads
- Live demo link: `https://bsiscoe.github.io/MAGE/`

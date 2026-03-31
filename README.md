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

The registration and login pages submit to:

- `POST /auth/register`
- `POST /auth/login`

If `VITE_API_BASE_URL` is set, the frontend posts to:

```text
${VITE_API_BASE_URL}/auth/register
${VITE_API_BASE_URL}/auth/login
```

If `VITE_API_BASE_URL` is not set, the pages fall back to same-origin `/auth/register` and `/auth/login`.

For local development with the backend running on port `8080`, create a `.env.local` file:

```bash
VITE_API_BASE_URL=http://localhost:8080
```

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

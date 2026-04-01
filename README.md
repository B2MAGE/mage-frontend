# MAGE Frontend

Frontend for the MAGE project, built with React, TypeScript, and Vite.

Right now this app contains the first real account flow for the platform: a user registration page backed by the Spring Boot authentication API.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Local backend configuration

The registration page submits to `POST /auth/register`.

If `VITE_API_BASE_URL` is set, the frontend posts to:

```text
${VITE_API_BASE_URL}/auth/register
```

If `VITE_API_BASE_URL` is not set, the page falls back to same-origin `/auth/register`.

For local development with the backend running on port `8080`, create a `.env.local` file:

```bash
VITE_API_BASE_URL=http://localhost:8080
```

## Routing

The app uses `react-router-dom` with `BrowserRouter` for clean client-side URLs.

Available routes:

- `/`
- `/presets`
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

## Presets page

The presets page lives at `/presets` and supports:

- browsing all presets as a responsive card grid
- filtering presets by tag using a horizontal tag pill bar
- skeleton loading states while data is fetched
- empty state messaging when no presets match the current filter
- error state with retry for failed API requests
- responsive layout for desktop and mobile

## Scripts

- `npm run dev` starts the local development server
- `npm run build` creates a production build
- `npm run preview` previews the production build locally
- `npm run lint` runs ESLint
- `npm run test` runs the frontend test suite with Vitest

## Current status

- Landing page for the MAGE platform
- Registration page connected to the backend registration endpoint
- Presets page with tag-based filtering
- Placeholder login route
- Header navigation between pages without full page reloads
- Live demo link: `https://bsiscoe.github.io/MAGE/`

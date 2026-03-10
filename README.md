# MAGE Frontend

Frontend for the MAGE project, built with React, TypeScript, and Vite.

Right now this app is a simple frontend shell with placeholder pages while the broader platform is still in development.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Routing

The app uses `react-router-dom` with `BrowserRouter` for clean client-side URLs.

Available placeholder routes:

- `/`
- `/login`
- `/dashboard`
- `/presets`

Note: direct loads of nested routes in production require the host to rewrite unknown paths back to `index.html`.

## Scripts

- `npm run dev` starts the local development server
- `npm run build` creates a production build
- `npm run preview` previews the production build locally
- `npm run lint` runs ESLint

## Current status

- Landing page for the MAGE platform
- Placeholder routes for login, dashboard, and presets
- Header navigation between pages without full page reloads
- Live demo link: `https://bsiscoe.github.io/MAGE/`

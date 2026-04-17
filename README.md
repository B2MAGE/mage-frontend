# MAGE Frontend

The MAGE frontend is the React application for browsing, creating, and playing MAGE scenes in the browser. It provides account flows, scene management screens, the reusable in-app MAGE player, and the scene editor used to author scene data for the engine.

## Overview

This repository contains the client-side application for the MAGE platform. It is built with React, TypeScript, and Vite, and integrates with:

- the MAGE backend API for authentication and scene persistence
- the published `@notrac/mage` engine package for scene playback and scene preview

The current app includes:

- guest and authenticated account flows
- a reusable browser-based MAGE player
- scene listing and scene detail pages
- a multi-section create scene editor with direct-to-object-storage thumbnail uploads
- shared auth session restore and protected routes

## Tech Stack

- React 19
- TypeScript
- Vite
- React Router 7
- Vitest + Testing Library
- ESLint
- Published MAGE engine package via `@notrac/mage`

## Repository Structure

```text
mage-frontend/
|- docs/              Additional implementation notes
|- public/            Static assets served by Vite
|- src/
|  |- auth/           Shared auth session and account context
|  |- components/     Reusable UI and player components
|  |- lib/            Scene editor helpers, API helpers, engine adapter
|  |- pages/          Route-level screens
|  `- test/           Shared test setup
|- .env.example
|- package.json
`- vite.config.ts
```

## Prerequisites

Before running the frontend locally, make sure you have:

- a recent Node.js and npm installation
- the backend API running locally if you want full auth and scene flows

## Getting Started

1. Install frontend dependencies:

   ```bash
   npm install
   ```

2. Start the backend on `http://localhost:8080`.

3. Start the frontend dev server:

   ```bash
   npm run dev
   ```

4. Open:

   ```text
   http://localhost:5173
   ```

## Configuration

The frontend supports one optional environment variable:

```bash
VITE_API_BASE_URL=
```

Behavior:

- if `VITE_API_BASE_URL` is unset, the frontend uses the local Vite proxy and sends requests to `/api/*`
- if `VITE_API_BASE_URL` is set, requests are sent directly to that origin
- for same-origin production deployments, leaving it unset or building with `VITE_API_BASE_URL=/api` both work

For local development, the Vite dev server proxies `/api` to:

```text
http://localhost:8080
```

That proxy is configured in [vite.config.ts](./vite.config.ts).

## Deployment

See [docs/deployment.md](./docs/deployment.md) for the deployment contract and the Coolify-oriented production notes.

## Available Scripts

- `npm run dev` starts the Vite development server
- `npm run build` creates a production build
- `npm run preview` serves the production build locally
- `npm run lint` runs ESLint
- `npm run test` runs the Vitest suite

## Application Routes

| Route            | Access        | Purpose                                               |
| ---------------- | ------------- | ----------------------------------------------------- |
| `/`              | Public        | Guest landing page or signed-in scene discovery home |
| `/scenes`       | Public        | Scene discovery with optional tag filter             |
| `/register`      | Guest-only    | Account registration                                  |
| `/login`         | Guest-only    | Account sign-in                                       |
| `/my-scenes`    | Authenticated | User scene library                                   |
| `/scenes/:id`   | Public route  | Scene detail/player page                             |
| `/create-scene` | Public route  | Scene editor and live preview                        |
| `/settings`      | Authenticated | Account settings                                      |

## Documentation

Additional project notes live in `docs/`:

- [docs/README.md](./docs/README.md)
- [docs/create-scene-page.md](./docs/create-scene-page.md)
- [docs/deployment.md](./docs/deployment.md)
- [docs/engine-integration.md](./docs/engine-integration.md)
- [docs/login-page.md](./docs/login-page.md)
- [docs/player-component.md](./docs/player-component.md)
- [docs/registration-page.md](./docs/registration-page.md)

# MAGE Frontend

The MAGE frontend is the React application for browsing, creating, and playing MAGE scenes in the browser. It provides account flows, preset management screens, the reusable in-app MAGE player, and the preset editor used to author scene data for the engine.

## Overview

This repository contains the client-side application for the MAGE platform. It is built with React, TypeScript, and Vite, and integrates with:

- the MAGE backend API for authentication and preset persistence
- the bundled local MAGE engine package for scene playback and preset preview

The current app includes:

- guest and authenticated account flows
- a reusable browser-based MAGE player
- preset listing and preset detail pages
- a multi-section create preset editor
- shared auth session restore and protected routes

## Tech Stack

- React 19
- TypeScript
- Vite
- React Router 7
- Vitest + Testing Library
- ESLint
- Local MAGE engine package via `../mage-engine/mage-1.0.0.tgz`

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
|  |- test/           Shared test setup
|  `- types/          Local type declarations
|- .env.example
|- package.json
`- vite.config.ts
```

## Prerequisites

Before running the frontend locally, make sure you have:

- a recent Node.js and npm installation
- the backend API running locally if you want full auth and preset flows

The engine package used by the frontend is vendored inside this repository under `vendor/mage-engine/` so the app can build in CI and deployment environments without depending on a sibling workspace checkout.

`npm install` and `npm ci` also reapply the checked-in `patch-package` patches during `postinstall`. That is currently required for the Shader Park production compatibility fix.

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

The supported production strategy is same-origin deployment:

- the frontend is served from the public app origin
- `/api/*` is routed to the backend by the reverse proxy
- browser auth traffic stays on one HTTPS origin
- direct loads of client routes such as `/login` and `/register` require SPA fallback to `index.html`

See [docs/deployment.md](./docs/deployment.md) for the deployment contract and the Coolify-oriented production notes.

## Available Scripts

- `npm run dev` starts the Vite development server
- `npm run build` creates a production build
- `npm run preview` serves the production build locally
- `npm run lint` runs ESLint
- `npm run test` runs the Vitest suite

## Application Routes

| Route | Access | Purpose |
| --- | --- | --- |
| `/` | Public | Landing page with embedded MAGE preview |
| `/register` | Guest-only | Account registration |
| `/login` | Guest-only | Account sign-in |
| `/my-presets` | Authenticated | User preset library |
| `/presets/:id` | Public route | Preset detail/player page |
| `/create-preset` | Public route | Preset editor and live preview |
| `/settings` | Authenticated | Account settings |

Notes:

- authenticated routes redirect through shared session restore
- direct loads of nested routes in production require host rewrites back to `index.html`
- preset creation depends on authenticated backend access when persisting data

## Current Frontend Areas

### Authentication

- registration page with client-side validation
- login page with bearer-token storage
- session restore through `GET /api/users/me`
- guest-only and protected route wrappers
- account settings page with basic profile details

### MAGE Playback

- reusable `MagePlayer` React component
- homepage preview powered by the shared player wrapper
- preset detail page playback
- create preset live preview

### Preset Flows

- user preset listing
- preset detail screen
- create preset editor with scene, camera, motion, effects, pass-order, and advanced sections
- structured scene data authoring for the MAGE engine

## Engine Integration Notes

The frontend currently consumes the MAGE engine as a local package dependency:

```json
"mage": "file:vendor/mage-engine/mage-1.0.0.tgz"
```

There is one important implementation detail in the frontend today:

- the package root export is not used directly
- `@mage/engine` is aliased to `node_modules/mage/js/mage-lib.js`
- `shader-park-core` is aliased to its ESM bundle and patched locally through `patch-package`
- this keeps the frontend working with the current packaged engine layout

If the engine package export surface changes, check:

- [vite.config.ts](./vite.config.ts)
- [tsconfig.app.json](./tsconfig.app.json)
- [src/lib/magePlayerAdapter.ts](./src/lib/magePlayerAdapter.ts)
- [patches/shader-park-core+0.2.8.patch](./patches/shader-park-core+0.2.8.patch)

## Documentation

Additional project notes live in `docs/`:

- [docs/README.md](./docs/README.md)
- [docs/create-preset-page.md](./docs/create-preset-page.md)
- [docs/deployment.md](./docs/deployment.md)
- [docs/engine-integration.md](./docs/engine-integration.md)
- [docs/login-page.md](./docs/login-page.md)
- [docs/player-component.md](./docs/player-component.md)
- [docs/registration-page.md](./docs/registration-page.md)

## Development Notes

- the frontend API helper automatically namespaces requests under `/api`
- the create preset editor is tied to the current engine preset shape
- production builds use normal Vite optimization behavior; Shader Park compatibility is handled by the checked-in `patch-package` patch rather than by disabling minification or tree-shaking
- the engine package currently emits build warnings related to missing runtime assets and large bundle size

## Status

This repository is an active application repo, not a generated starter. The codebase is already wired to real auth flows, real preset routes, and the local MAGE engine package, and should be treated as the main browser client for ongoing frontend product work.

# MAGE Frontend

The MAGE frontend is the React application for browsing, creating, and playing MAGE scenes in the browser. It provides account flows, scene management screens, the reusable in-app MAGE player, and the scene editor used to author scene data for the engine.

## Overview

This repository contains the client-side application for the MAGE platform. It is built with React, TypeScript, and Vite, and integrates with:

- the MAGE backend API for authentication and scene persistence
- the maintained [B2MAGE engine fork](https://github.com/B2MAGE/mage-engine), installed under the `@notrac/mage` import alias, for scene playback and preview

The current app includes:

- guest and authenticated account flows
- a reusable browser-based MAGE player
- a persistent frontend theme system with multiple selectable themes
- paged Explore scene summaries and scene detail pages
- a multi-section create scene editor with direct-to-object-storage thumbnail uploads
- shared auth session restore and protected routes

## Tech Stack

- React 19
- TypeScript
- Vite
- React Router 7
- Vitest + Testing Library
- ESLint
- Versioned B2MAGE engine release package via the `@notrac/mage` import alias

## Repository Structure

Runtime and feature code lives under `app/`, `modules/`, and `shared/`, with `theme/` remaining as an intentional dedicated boundary for theming.

```text
mage-frontend/
|- docs/              Additional implementation notes
|- public/            Static assets served by Vite
|- src/
|  |- app/            App-wide composition, layout shell, and route wiring
|  |- modules/        Vertical feature slices and their public entrypoints
|  |- shared/         Cross-cutting UI, utilities, and test helpers
|  `- theme/          Dedicated theming boundary, provider, tokens, and theme CSS
|- .env.example
|- package.json
`- vite.config.ts
```

## Prerequisites

- Node.js 22.13 or newer in the Node 22 line (or Node 24+) and npm 10+.
- Git and network access to npm and the pinned B2MAGE engine release on GitHub.
- Docker Desktop/Engine with Compose for the backend, PostgreSQL and MinIO.
  Java 21 is needed only if running backend Maven commands outside Docker.

## Getting Started

Use these three terminals. Normal startup preserves existing accounts and scenes;
it does not reset the database or object storage.

1. In a current [backend checkout](https://github.com/B2MAGE/mage-backend), copy
   `.env.example` to `.env` **once** if `.env` does not exist, then start the stack:

   ```sh
   docker compose -f docker-compose.yml -f docker-compose.local.yml -f docker-compose.minio.yml up --build
   ```

   Wait for `http://localhost:8080/ready` to return 200. The MinIO override is
   required for thumbnails. Its example values work locally without AWS credentials.

2. In this frontend checkout, install the exact locked dependencies and start the app:

   ```bash
   npm ci
   npm run dev
   ```

3. In a second terminal in the **same frontend checkout**, start the renderer:

   ```bash
   npm run renderer:serve
   ```

   This builds the isolated renderer before serving it. Restart this command after
   renderer/compiler changes; Vite handles ordinary frontend edits automatically.

4. Open:

   ```text
   http://127.0.0.1:5178
   ```

The app uses port 5178 and the renderer uses the opposite loopback hostname on
5181. Those addresses are part of the isolation policy. `npm run dev` fails if
5178 is occupied instead of silently starting a player that cannot connect.
Stop only your previous development server before restarting it.

The engine is installed from a versioned release; no engine clone, dependency patch
or global Vite install is needed. See [engine maintenance](docs/engine-package.md)
when intentionally changing engine source.

Manual browser diagnostics are optional and separate from ordinary startup.
Use [the local diagnostic workflow](docs/test-tools-cleanup.md) for a targeted
player investigation; normal development does not serve check pages or canaries.

## Configuration

The frontend supports optional environment variables:

```bash
VITE_API_BASE_URL=
VITE_HOME_FEATURED_SCENE_ID=
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

VITE_HOME_FEATURED_SCENE_ID selects a real scene for the homepage feature. If unset, the newest available scene is featured. See [Pulse local review](docs/pulse-layout-review.md) for the seeded mockup review setup.

## Deployment

See [docs/deployment.md](./docs/deployment.md) for the deployment contract and the Coolify-oriented production notes.

## Verification

After `npm ci`, the normal contributor check is:

```sh
npm run verify
```

It runs lint, application tests, tooling/security tests, the production app build
and the local renderer build. No running backend, credentials or browser is needed.
It builds artifacts without deploying anything. Original and Selective are both
covered by the retained audio tests.

| Command | When to use it |
| --- | --- |
| `npm test` | All application and tooling tests, without lint/build. |
| `npm run test:unit -- <test-file>` | Focused application Vitest checks. |
| `npm run test:tooling` | Diagnostic type checks, Node build/hosting/contract tests, and compiler-worker/recovery harness tests. |
| `npm run contracts:check -- ../mage-backend` | Compare all seven shared contract copies after editing either repository. |
| `npm run auth:verify -- http://localhost:8080` | Real registration/login/API verification; creates a disposable account. See [auth verification](docs/auth-verification.md). |

`npm run build` builds the app; `npm run renderer:build` builds the local isolated
renderer. `npm run renderer:verify` checks a running local renderer against that
build. Production renderer commands and required origin values are documented in
[renderer deployment](docs/isolated-renderer.md). `npm run preview` only previews
the built app; it is not a replacement for the local app/renderer development pair.

The automatic checks do not prove WebGL output or physical-device behavior. Use
the normal app to review playback, both music modes, editing, capture and saving
when changing those features.

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

Cross-cutting project notes live in `docs/`:

- [docs/README.md](./docs/README.md)
- [docs/frontend-architecture.md](./docs/frontend-architecture.md)
- [docs/deployment.md](./docs/deployment.md)

Use [docs/README.md](./docs/README.md) as the main index for cross-cutting frontend documentation.
Feature-specific behavior and public contracts now live in the owning module READMEs under
`src/modules/<feature>/README.md`.

Engine source, package provenance and upgrade checks are documented in
[engine package maintenance](docs/engine-package.md). Installation consumes a built,
versioned release from the fork; it does not patch or rebuild dependency files.

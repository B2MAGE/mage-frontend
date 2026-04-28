# Frontend Architecture

This document describes the current frontend structure and boundary rules.

## Top-Level Source Layout

The frontend now uses this structure for runtime and feature code:

```text
src/
  app/
  modules/
  shared/
  theme/
```

## Choosing A Home

When adding new frontend code:

- put it in `app/` when it composes the application as a whole, such as providers, routes, bootstrap wiring, or app-shell handoff
- put it in `modules/<feature>/` when one feature or route surface clearly owns the behavior
- put it in `shared/` only when the code is genuinely cross-cutting across multiple modules or is framework-level plumbing
- keep engine/runtime infrastructure inside the owning boundary instead of scattering it through route code; today that means `@modules/player` for engine integration and `@theme` for theme runtime behavior
- treat `src/theme/` as the one intentional top-level boundary outside `modules/`

## Ownership Rules

### `app/`

Use `app/` for application-wide composition:

- provider composition
- route composition
- bootstrap-level wiring

`app/` should not become a dumping ground for feature logic.

`app/` may depend on modules, shared helpers, and theme/runtime boundaries. Feature modules should not depend on `app/`.

### `modules/`

Use `modules/` for vertical feature slices. A module should eventually own:

- route-facing components
- feature-specific UI
- feature data access
- internal selectors/helpers
- feature tests and fixtures

Tests should follow the same ownership rule as production code:

- keep module-specific specs next to the owning module instead of in generic top-level test buckets
- split large integration-style specs into smaller files grouped by module behavior
- add module-local `test-fixtures.ts` or `test-fixtures.tsx` builders when a feature needs richer sample data
- keep `src/shared/test/` limited to true cross-cutting helpers such as shared auth/session or HTTP response setup

Examples of current modules include `auth`, `discovery`, `home`, `my-scenes`, `player`, `scene-detail`, `scene-editor`, and `settings`.

The `src/theme/` directory is a dedicated boundary with the same public-API expectations, even though it intentionally remains top-level instead of living under `modules/`.

Each module should define a lightweight contract:

- `index.ts` exposes the supported public API
- `README.md` explains the public API, internal responsibilities, and integration rules
- route-facing components stay thin and delegate real behavior to module-local helpers/hooks
- internal files are private by default unless exported from the module entrypoint

### `shared/`

Use `shared/` only for cross-cutting concerns that are genuinely reused across multiple modules. Typical examples are:

- UI primitives
- generic formatting or storage helpers
- app-wide style foundations
- cross-cutting test utilities

If code is mostly owned by one feature, it should stay with that feature.

Shared code should not depend on `app/` or feature-module internals.

## Current State

Route-facing surfaces now live behind module entrypoints:

- `auth`
- `discovery`
- `home`
- `my-scenes`
- `player`
- `scene-detail`
- `scene-editor`
- `settings`

Cross-cutting runtime behavior lives in `app/`, reusable foundations live in `shared/`, and theming remains in the dedicated `theme/` boundary.

## Dependency Direction

Allowed dependency flow is:

- `app/` -> `@modules/*`, `@shared/*`, `@theme`
- `modules/` -> `@shared/*`, `@theme`, and other modules' public entrypoints
- `shared/` -> other shared utilities only
- `theme/` -> theme-owned files and shared foundations, but not feature modules or app wiring

## Import Conventions

Cross-top-level imports should use aliases instead of parent-relative paths.

- `@app` for application wiring and composition
- `@modules/<module-name>` for module public APIs
- `@shared/*` for cross-cutting shared code
- `@auth` as the stable auth module alias
- `@theme` for the dedicated theme boundary

Within a top-level area, short relative imports are still fine for local implementation details.

Module internals are private by default. If a module needs to be consumed elsewhere, expose it from that module's `index.ts` and import it through `@modules/<module-name>`. Deep imports such as `@modules/player/internal/foo` should be treated as boundary violations.

The same rule applies to docs: contributors should be able to discover the public contract from the module entrypoint or layer README instead of opening implementation files first.

## Boundary Checklist

When adding a new module or reshaping an existing boundary:

1. choose the owning module before moving files
2. move the route-facing entrypoint first and keep it thin
3. add or update the module `index.ts` and `README.md`
4. keep internal helpers private until another area truly needs them
5. extract only real cross-cutting primitives into `shared/`
6. rewire imports to aliases instead of deep relative paths
7. update the architecture docs if the public boundary or infrastructure story changed

## Source Layout Rule

Future changes should extend `app/`, `modules/`, `shared/`, or the dedicated `theme/` boundary rather than introducing new top-level source folders.

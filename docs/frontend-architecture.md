# Frontend Architecture

This document describes the initial modular-monolith direction for the frontend.

## Top-Level Source Layout

The frontend is moving toward this structure:

```text
src/
  app/
  modules/
  shared/
```

## Ownership Rules

### `app/`

Use `app/` for application-wide composition:

- provider composition
- route composition
- bootstrap-level wiring

`app/` should not become a dumping ground for feature logic.

### `modules/`

Use `modules/` for vertical feature slices. A module should eventually own:

- route-facing components
- feature-specific UI
- feature data access
- internal selectors/helpers
- feature tests and fixtures

Examples of target modules include `player`, `scene-detail`, `scene-editor`, `discovery`, `my-scenes`, `auth`, `settings`, and `theme`.

The current `src/theme/` directory is already treated as a dedicated module boundary with its own public API, even though the broader module migration is still in progress.

### `shared/`

Use `shared/` only for cross-cutting concerns that are genuinely reused across multiple modules. Typical examples are:

- UI primitives
- generic formatting or storage helpers
- app-wide style foundations
- cross-cutting test utilities

If code is mostly owned by one feature, it should stay with that feature.

## Current State

The repo is still in a hybrid state, but several route-facing surfaces now live behind module entrypoints:

- `auth`
- `discovery`
- `my-scenes`
- `player`
- `scene-detail`
- `scene-editor`
- `settings`

Existing `pages/`, `components/`, and `lib/` directories still exist for surfaces that have not been migrated yet. Issue `#83` established the skeleton and app-level composition move; later stories migrate one surface at a time instead of through a single rewrite.

## Import Conventions

Cross-top-level imports should use aliases instead of parent-relative paths.

- `@app` for application wiring and composition
- `@modules/<module-name>` for module public APIs
- `@shared/*` for cross-cutting shared code
- `@auth` as the stable auth module alias
- `@components`, `@lib`, `@pages`, and `@theme` for the current hybrid directories during migration

Within a top-level area, short relative imports are still fine for local implementation details.

Module internals are private by default. If a module needs to be consumed elsewhere, expose it from that module's `index.ts` and import it through `@modules/<module-name>`. Deep imports such as `@modules/player/internal/foo` should be treated as boundary violations.

## Near-Term Refactor Sequence

The intended sequence is:

1. establish `app/`, `modules/`, and `shared/`
2. move app-wide composition out of `App.tsx`
3. formalize module entrypoints and boundaries
4. migrate major surfaces into vertical slices over time

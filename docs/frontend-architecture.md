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

### `shared/`

Use `shared/` only for cross-cutting concerns that are genuinely reused across multiple modules. Typical examples are:

- UI primitives
- generic formatting or storage helpers
- app-wide style foundations
- cross-cutting test utilities

If code is mostly owned by one feature, it should stay with that feature.

## Current State

The repo is still in a hybrid state. Existing `pages/`, `components/`, and `lib/` directories remain in use while the modular-monolith structure is introduced. Issue `#83` establishes the skeleton and app-level composition move. Later stories will migrate feature code into modules incrementally rather than through a single rewrite.

## Near-Term Refactor Sequence

The intended sequence is:

1. establish `app/`, `modules/`, and `shared/`
2. move app-wide composition out of `App.tsx`
3. formalize module entrypoints and boundaries
4. migrate major surfaces into vertical slices over time

# My Scenes Module

This directory is the frontend-owned boundary for the authenticated `/my-scenes` surface.

## Public API

Import route-facing my-scenes behavior through `@modules/my-scenes`.

Exports:

- `MyScenesPage`

## Internal Responsibilities

- `MyScenesPage.tsx`
  Route-facing React boundary for the authenticated scene-library experience.
- `loaders.ts`
  Ownership-scene loading, DTO normalization, and sample-scene creation requests.
- `selectors.ts`
  Sorting, filtering, pagination, and selection-derived board state.
- `fixtures.ts`
  Sample-scene payloads used by the temporary empty-state seeding helper.
- `ui/`
  My-scenes-owned toolbar, table, and pagination behavior.

## Integration Rules

1. Route wiring and tests outside this module should import `MyScenesPage` from `@modules/my-scenes`.
2. Ownership list behavior, filters, and empty/loading/error states stay in this module instead of generic shared folders.
3. Shared table and pagination primitives belong in `@shared/ui`; this module owns the scene-specific behavior layered on top of them.

## Route Surface

### `/my-scenes`

Access:

- authenticated-only

Request flow:

- `GET /api/users/:userId/scenes`
- `POST /api/scenes` for the temporary demo-seeding helper

Requests go through `authenticatedFetch()`, so the page depends on a valid restored auth session.

User-facing behavior:

- waits for auth session restoration before loading scenes
- redirects guests to `/login`
- shows dedicated restoring, loading, empty, and error states
- supports sorting, status filtering, pagination, and row selection locally in the browser
- prunes invalid selections when the loaded scene set changes
- offers a temporary empty-state action to create sample scenes for the current account

Current limitations:

- edit, delete, and bulk actions are not wired yet
- visibility status, engagement counts, and some library metadata are frontend-derived placeholders
- sample-scene seeding is a temporary helper and not a permanent product action

## Tests

Coverage lives in the colocated my-scenes specs under `src/modules/my-scenes/`.

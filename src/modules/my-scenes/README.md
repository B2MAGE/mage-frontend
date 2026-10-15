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
  Owner-scene loading and DTO normalization, using analytics returned by the backend.
- `selectors.ts`
  Sorting, filtering, pagination, and selection-derived board state.
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

- `GET /api/users/:userId/scenes`, restricted to the signed-in owner.

Requests go through `authenticatedFetch()`, so the page depends on a valid restored auth session.
The list includes `engagement.views`, `engagement.comments` (including replies), and
`engagement.likesRatio` (the backend's rounded percentage, zero without votes).
The page displays these values directly; it does not request comment threads for each
scene or calculate its own vote ratio.

User-facing behavior:

- waits for auth session restoration before loading scenes
- redirects guests to `/login`
- shows dedicated restoring, loading, empty, and error states
- supports sorting, status filtering, pagination, and row selection locally in the browser
- prunes invalid selections when the loaded scene set changes
- links to scene previews and editing; the empty state links to Create scene

Current limitations:

- delete and bulk actions are not wired yet
- visibility status is currently shown as Published; visibility management is separate work
- the Updated sort currently uses the scene creation timestamp

## Tests

Coverage lives in the colocated my-scenes specs under `src/modules/my-scenes/`.
It verifies a single owner-list request, populated and zero analytics, authenticated
loading and retry states, and local sorting without additional requests.

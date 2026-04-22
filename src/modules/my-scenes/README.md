# My Scenes Module

This directory is the dedicated frontend-owned boundary for the `/my-scenes` ownership surface.

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
2. Ownership list behavior, filters, and empty/loading/error states stay in this module instead of generic `pages/`, `components/`, or `lib/` folders.
3. Shared table/pagination primitives belong in `@shared/ui`; this module owns the scene-specific behavior layered on top of them.

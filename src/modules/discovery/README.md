# Discovery Module

This directory is the dedicated frontend-owned boundary for scene discovery.

## Public API

Import route-facing discovery behavior through `@modules/discovery`.

Exports:

- `ScenesPage`

## Internal Responsibilities

- `ScenesPage.tsx`
  Route-facing React boundary for the `/scenes` discovery surface.
- `loaders.ts`
  Discovery-owned scene and tag request handling.
- `selectors.ts`
  Tag-filter selection helpers derived from the current route query string.
- `ui/`
  Discovery-owned cards, filter rails, and loading/empty/error presentation.

## Integration Rules

1. Route wiring and homepage-authenticated discovery handoff should import `ScenesPage` from `@modules/discovery`.
2. Discovery cards, filters, and list states stay owned by this module instead of generic `components/` folders.
3. Shared primitives such as chips and scroll rails should be imported from `@shared/ui`.

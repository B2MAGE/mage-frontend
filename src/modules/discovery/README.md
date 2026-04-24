# Discovery Module

This directory is the frontend-owned boundary for scene discovery.

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
2. Discovery cards, filters, and list states stay owned by this module instead of generic shared folders.
3. Shared primitives such as chips and scroll rails should be imported from `@shared/ui`.

## Route Surface

### `/scenes`

Access:

- public

Request flow:

- `GET /api/scenes`
- `GET /api/scenes?tag=<tag>`
- `GET /api/tags?attachedOnly=true`

User-facing behavior:

- reads the active tag from the `?tag=` query string
- keeps the selected tag in the URL so filtered discovery is linkable
- shows loading, empty, and error states for scene loading
- treats tag loading separately from scene loading so tag failures do not block scene results
- lets the user click the active tag again to force a reload

Current limitations:

- discovery supports only a single active tag filter at a time
- there is no search box, sort control, or pagination yet
- tag loading failures degrade to an empty filter list instead of a visible tag-specific error

## Tests

Coverage lives in the colocated discovery specs under `src/modules/discovery/`.

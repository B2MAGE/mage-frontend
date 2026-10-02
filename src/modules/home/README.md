# Home Module

This directory is the dedicated frontend-owned boundary for the `/` homepage surface.

## Public API

Import route-facing homepage behavior through `@modules/home`.

Exports:

- `HomePage`

## Internal Responsibilities

- `HomePage.tsx`
  Route-facing React boundary for the guest homepage hero and the authenticated handoff into discovery.

## Integration Rules

1. Route wiring should import `HomePage` from `@modules/home`.
2. Authenticated homepage behavior may hand off into discovery, but that orchestration still belongs to this module.
3. Guest hero copy and preview-player embedding should stay here instead of being pushed into `app/`.

## Pulse recent-scene filters

- Load `GET /api/tags?attachedOnly=true` once per visit, separately from scene requests.
- Show **All** plus up to four tags ranked by `sceneCount` descending, then name alphabetically and ID for stable ties.
- Keep the backend's canonical tag name when requesting filtered scenes; display casing is only CSS.
- Tag selection and scene retries do not reload or reshuffle the available pills.
- Missing, failed, or empty tag responses leave **All** available without blocking recent scenes.
- The `/scenes` page continues to show every attached tag; this four-tag limit is homepage-only.

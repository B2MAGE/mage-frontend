# Scene Detail Module

This directory is the dedicated frontend-owned boundary for the scene detail experience.

## Public API

Import route-facing scene detail behavior through `@modules/scene-detail`.

Exports:

- `SceneDetailPage`

## Internal Responsibilities

- `SceneDetailPage.tsx`
  Route-facing React boundary for the `/scenes/:id` experience.
- `loaders.ts`
  Scene detail request handling, DTO normalization entrypoints, and recommendation loading orchestration.
- `dto.ts`
  Backend payload normalization for scene detail and recommendation list responses.
- `viewModels.ts`
  Production-facing scene detail view-model builders derived from fetched scene data.
- `recommendations.ts`
  Recommendation grouping, filter helpers, and selection logic for the sidebar rail.
- `fixtures.ts`
  Placeholder/sample content builders for description and comments so lorem ipsum content stays out of production transforms.
- `ui/`
  Scene-detail-owned presentation for description, comments, voting, recommendations, and playlist sidebar behavior.

## Integration Rules

1. Route wiring should import `SceneDetailPage` from `@modules/scene-detail`.
2. Feature code outside this module should not import `ui/*`, `loaders.ts`, or internal builders directly.
3. Placeholder comments, creator notes, and description copy stay in `fixtures.ts`, not in DTO or loader code.
4. Recommendation filtering, description rendering, comments, and playlist-sidebar state stay owned by this module.

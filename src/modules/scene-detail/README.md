# Scene Detail Module

This directory is the frontend-owned boundary for the scene detail experience.

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
- `sceneDetail.css`
  Pulse Watch layout, including the desktop rail and mobile ordering from the supplied mockup.
- `ui/`
  Scene-detail-owned presentation for description, comments, voting, recommendations, and playlist sidebar behavior.

## Integration Rules

1. Route wiring should import `SceneDetailPage` from `@modules/scene-detail`.
2. Feature code outside this module should not import `ui/*`, `loaders.ts`, or internal builders directly.
3. Missing backend fields should render clear empty states, not generated prose.
4. Recommendation filtering, description rendering, comments, and playlist-sidebar state stay owned by this module.

## Route Surface

### `/scenes/:id`

Access:

- public route
- signed-in sessions enhance detail loading through `authenticatedFetch()`

Request flow:

- `GET /api/scenes/:id`
- `POST /api/scenes/:id/views`
- `PUT /api/scenes/:id/vote`
- `DELETE /api/scenes/:id/vote`
- `POST /api/scenes/:id/save`
- `DELETE /api/scenes/:id/save`
- `GET /api/scenes`
- `GET /api/scenes?tag=<tag>` for recommendation loading

User-facing behavior:

- validates the `:id` route param and shows a dedicated invalid-id state when it cannot be parsed
- shows explicit restoring, loading, not-found, auth-required, and unavailable states
- embeds the shared `MagePlayer` with route-owned playlist state
- preserves scene metadata and thumbnails when an explicit availability status withholds scene source; the player handles fresh availability checks and the compact playback notice
- refreshes withheld source through `onAvailabilityRestored`, ignoring stale responses after navigation or authentication changes
- mounts operator controls below the description; the player module checks authorization and owns the management interface
- resets description expansion and recommendation filter state when the scene changes
- shows the fetched creator name without fabricated subscriber counts; owners can edit their scene
- renders engagement counts and current-user vote/save state from the scene detail response
- lets the user filter the four-card recommendation rail by creator or scene tag
- supports top/newest comment ordering, comments, replies, and persisted votes
- opens the playlist in the desktop rail or an accessible, Escape-dismissable mobile dialog

Current limitations:

- follow remains visibly disabled because the backend does not provide creator following
- Share copies the actual scene URL; clipboard failures show a useful message
- recommendation ranking is heuristic and frontend-owned

## Tests

Coverage lives in the colocated scene-detail specs under `src/modules/scene-detail/`.

# Pulse mockup review

The supplied HTML mockups are implemented as the MAGE Pulse theme. Shared color tokens and navigation live under theme and app; page styles live with each feature. Classic Blue remains selectable.

## Start locally

Use the [current README startup sequence](../README.md#getting-started), including
the renderer, and open `http://127.0.0.1:5178`. Ordinary startup preserves data.
For optional reproducible demo scenes, use the backend's
[current demo fixtures](https://github.com/B2MAGE/mage-backend/blob/main/scripts/demo/README.md).
Set `VITE_HOME_FEATURED_SCENE_ID` only to a scene that exists in that database.

The October 2 review used an older isolated seed and disposable account. That
historical seed is not required for current setup or evidence of today's data.

## Review routes

| Route | Mockup behavior |
| --- | --- |
| / | Real featured scene and eight most recent scenes. Welcome panel only for guests; it can be dismissed. |
| /scenes | Thumbnail discovery grid and working tag filters. Browse all featured and See all scenes both lead here. |
| /scenes/1 | Watch the featured scene, playlist, engagement, comments and related scenes. |
| /create-scene | Signed-in scene editor with live preview and separate workflow steps. |
| /login | Sign in, recovery link and registration navigation. |
| /register | Name, email and password registration. |
| /forgot-password | Privacy-preserving recovery confirmation. |
| /reset-password | Token-based password reset and invalid-link state. |
| /settings | Appearance, profile and password panels. |
| /my-scenes | Owner's published scenes, filtering, pagination and Edit links. |
| /@handle | Public creator identity and searchable, sortable, paginated scenes. |
| /profile | Signed-in shortcut to the account's public handle or profile settings. |
| /scenes/:id/edit | Owner-only editing through the shared scene studio. |
| /about | Product introduction with shared, engine-rendered brand artwork. |

The scene editor's Edit links preserve ownership checks. Local audio is selected from the user's device; fixture scenes do not claim to contain the mockup's sample audio tracks. Follow remains unavailable because the backend has no creator-follow feature. Draft filtering returns an honest empty state because saved drafts are not supported by the backend. The editor's saved-playlist selector is explicitly unavailable; local audio queues in the player still work.

Thumbnail capture preserves the current live preview aspect ratio. If a thumbnail was captured before this correction, use Capture Again to replace the old square image. New captures and stored PNGs retain the complete frame.

## Verification

Run `npm run verify`. During the original migration the real local API was also
checked through browser registration/login, recovery, guest/authenticated home,
save toggling, library filtering, scene creation/editing and MinIO uploads. Those
dated checks are historical; review affected layouts again when changing the UI.

## Integration Acceptance — October 2, 2026

The reconstructed frontend stack passed all 549 tests, lint, and the production
build. The backend stack passed all 341 tests, including PostgreSQL integration
coverage. Merge results were compared with the tested source trees.

The integrated layout refresh and its documented behavior are accepted as the
delivered baseline. Future visual, responsive, accessibility, or state regressions
should be recorded as focused follow-up issues.

The My Scenes library keeps the complete management table on wide screens,
switches to uniform compact rows on medium screens, and uses stacked scene
cards on phones. Both themes use the same responsive structure, page frame,
state panels, and mobile actions.

The accepted homepage scope uses recent scenes for For You and newest ordering
for Featured/Recommended discovery fallbacks. The Watch/editor scope supports
local audio queues; server-saved playlists and creator following are not delivered
by this layout refresh. Preserve these boundaries when recording issue completion.

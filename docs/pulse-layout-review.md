# Pulse mockup review

The supplied HTML mockups are implemented as the MAGE Pulse theme. Shared color tokens and navigation live under theme and app; page styles live with each feature. Classic Blue remains selectable.

## Start locally

1. From the sibling mage-backend repository, run scripts/start-pulse-local.ps1 as documented in its docs/pulse-local-review.md. This preserves the original database and seeds a dedicated local volume.
2. Set VITE_HOME_FEATURED_SCENE_ID=1 in this repository's .env.local for the fresh seed. Leave VITE_API_BASE_URL unset to use the development proxy.
3. Run npm install, then npm run dev -- --host 127.0.0.1. Open http://127.0.0.1:5173.

Demo account: ari@pulse.local / PulseDemo2026!. These are disposable local fixture credentials, not production credentials.

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

Run npm test, npm run lint and npm run build. During this migration the real local API was also checked through browser registration/login, recovery, guest/authenticated homepage, save toggling, library pagination/filter recovery, scene creation/editing and public MinIO thumbnail uploads. Desktop and mobile layouts are compared with the original HTML mockups.

## Integration Acceptance — October 2, 2026

The reconstructed frontend stack passed all 549 tests, lint, and the production
build. The backend stack passed all 341 tests, including PostgreSQL integration
coverage. Merge results were compared with the tested source trees.

The integrated layout refresh and its documented behavior are accepted as the
delivered baseline. Future visual, responsive, accessibility, or state regressions
should be recorded as focused follow-up issues.

The accepted My Scenes mobile treatment keeps the scene-management table
horizontally scrollable (minimum 940px in Pulse and 960px in Classic) while the
toolbars and pagination wrap separately.

The accepted homepage scope uses recent scenes for For You and newest ordering
for Featured/Recommended discovery fallbacks. The Watch/editor scope supports
local audio queues; server-saved playlists and creator following are not delivered
by this layout refresh. Preserve these boundaries when recording issue completion.

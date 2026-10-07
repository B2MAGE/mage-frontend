# Cross-route UI regression matrix

This matrix covers the shared-page consistency audit completed for UI-10 on
October 7, 2026. Authentication pages are intentionally excluded. The scene
editor is checked for its shared shell and chrome; its editing workspace keeps
its purpose-built full-height layout.

## Viewport and theme sweep

Every route below was checked in MAGE Pulse and Classic Blue at 390, 430, 700,
960, 1280, and 1440 pixels wide. The automated browser sweep checks document
overflow, interactive controls outside the viewport, the shared page-frame
bounds, and visible leaf text below 10 pixels.

| Surface | Routes | Responsive expectation |
| --- | --- | --- |
| Shared shell | All routes below | Header, account menu, footer, gutters, and focus rings remain visible and usable. |
| Home and information | `/`, `/about` | Shared wide frame, compact mobile spacing, and no excess space below navigation. |
| Discovery | `/scenes` | Shared wide frame; the tag rail may scroll inside its own container without widening the page. |
| Personal library | `/my-scenes` | Full data table above 1100px, uniform compact rows from 641–1100px, and uniform stacked cards at 640px and below. Mobile selection controls sit fully inside each thumbnail. |
| Watch | `/scenes/29` | Contained desktop player and intentional edge-to-edge mobile player without document overflow. |
| Scene editor shell | `/create-scene`, `/scenes/29/edit` | Shared navigation and readable 10px minimum helper text around the purpose-built studio. Narrow player controls use two complete rows; collapsible labels and chevrons stay centered together. Classic Blue defines the full studio surface palette. |
| Profile and settings | `/@aririvera`, `/settings`, `/profile` | Shared frame and responsive controls; `/profile` resolves to the signed-in public profile. |
| Moderation | `/moderation`, `/moderation/playback`, `/moderation/moderators` | Shared form frame; all three mobile section tabs fit the row. |
| Redirects | `/settings/moderators`, unknown paths | Legacy moderator settings resolves to moderation; unknown paths resolve to home. |

The sweep passed without document-level horizontal overflow, clipped visible
controls, or visible non-auth text below 10px after the fixes in UI-10.

## State and interaction checks

| Area | Loading | Empty or error | Keyboard and overlays |
| --- | --- | --- | --- |
| Shared protected routes | Route-specific loading region uses the destination page frame. | Redirects retain the requested destination after session restoration. | Header controls have visible focus rings in both themes. |
| My Scenes | Loading skeleton uses the shared wide page frame. | Empty, filtered-empty, missing-session, and retry states use `PageState`; actions use shared buttons. | Filters, sort, library region, selection controls, Open, Edit, and pagination remain in the tab order. |
| Discovery, profile, settings, moderation, and watch | Existing focused route tests cover loading and unavailable data. | Existing focused route tests cover missing data, permission failures, and retry behavior. | The mobile account menu stays inside the viewport and closes with Escape. |

## Intentional layout exceptions

- Authentication and password recovery routes keep their narrow auth shell and
  are outside this story.
- The scene editor workspace keeps its full-height studio layout while reusing
  the shared application chrome.
- The watch player uses a deliberate edge-to-edge treatment below 1080px. Its
  page frame still supplies the correct gutter for all content below the player.
- Horizontally scrollable tag filters are local scrollers and must not widen the
  document.

## Focused automated checks

Run the My Scenes, scene detail, layout, settings, and moderation test files,
then run the full lint and production build. The My Scenes state tests assert
that loading, empty, and error states keep the shared page frame and state/button
primitives introduced by this audit.

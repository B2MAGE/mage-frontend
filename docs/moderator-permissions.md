# Scene moderator permissions (PP-R05)

R05 separates permission to manage individual scenes from permission to administer MAGE. It does not enable custom rendering or change the renderer's availability and isolation checks.

## Capabilities

| Account | Disable/re-enable individual scenes | Manage moderators and their permission audit | Manage the global custom-rendering control |
| --- | --- | --- | --- |
| Regular user | No | No | No |
| Scene moderator | Yes | No | No |
| Explicitly configured administrator | Yes | Yes | Yes, subject to the existing release gate |

The frontend obtains these capabilities from the authenticated `/api/admin/capabilities` endpoint. They are presentation hints, never authority: the backend checks authorization again on every private lookup and mutation. Capabilities are not taken from an old login response or written into browser storage.

Administrator access is explicitly configured with `MAGE_ADMIN_USER_IDS`; R05 does not expose an API or screen that can promote users into administrators. Existing `MAGE_OPERATOR_USER_IDS` entries migrate into scene-moderator permissions only. The backend migration is one-time, so a later restart cannot undo a moderator revocation. See the backend moderator-permissions runbook for the bootstrap, migration and administrator recovery procedure before deploying.

## Administrator workflow

1. Open the account menu's **Moderation** area, then **Moderator access** (`/moderation/moderators`). Administrators and moderators can enter the area; only administrators see moderator management and custom shader playback. Settings also links to the area, and the old `/settings/moderators` address redirects to the new location.
2. Search for an existing account using its exact user ID, handle or email. Check the displayed account identity and current permission before making a change.
3. Enter the reason and review the proposed grant or revocation, then explicitly confirm it.
4. A successful response updates the account's status and the private permission audit. A stale revision requires a fresh review before another change; the original request ID makes an uncertain retry safe to repeat.
5. A moderator uses the **Manage this scene** shield beside Follow or Edit scene to block or unblock that scene. This modal never reads or changes global custom shader playback. Administrators manage that separate control at **Moderation → Custom shaders** (`/moderation/playback`).

Administrator accounts are identified separately in the account lookup. Their powers cannot be removed by toggling a moderator grant. Removing or recovering administrator access is an explicit server-configuration operation rather than a last-administrator action in this UI.

Private account results, reasons and audit records are cleared when the signed-in identity changes or access is denied. Regular users and moderators cannot retrieve the account lookup or permission audit through direct API calls. A moderator's existing login session loses scene-management authority on subsequent requests after its database permission is revoked, without restarting any backend instance.

## API contract

All paths below use the authenticated API client and are served with `Cache-Control: no-store`.

- `GET /api/admin/capabilities`: `canModerateScenes`, `canManageModerators`, `canManageCustomRendering`.
- `GET /api/admin/moderators/users?query=...`: exact bounded lookup returning `{ users, nextCursor }`. Each private result includes `userId`, `displayName`, `handle`, `email`, `sceneModerator`, `isAdministrator` and `revision`.
- `PUT /api/admin/moderators/users/{id}`: `{ enabled, expectedRevision, requestId, reason }`. The UUID request ID identifies one operation; it must not be reused for a changed target, state, revision or reason.
- `GET /api/admin/moderators/audit?beforeId=...&limit=...`: private cursor-based history of administrator, target, previous/new permission, revision, reason and time. The page size is bounded at 50.

The existing scene-control and global-rendering endpoints retain their paths. A scene-moderator grant does not allow account management, private moderator audit access, owner repair access, or global-rendering changes.

## Local verification

October 3, 2026: the combined frontend moderation/settings/routing/scene-control run passed 80 tests. Two additional management-page regressions passed afterward as part of its final 18-test suite, covering an account change while permission verification is pending and empty account search results. TypeScript, ESLint and the production frontend build passed. The backend full suite passed 619 tests; endpoint-local strict JSON validation was then added and verified with 37 focused tests, including PostgreSQL concurrency and malformed request cases. The final packaged backend includes that validation.

Browser review used the real management page with page-local sample accounts and responses, making no backend permission changes. Grant/removal confirmations, keyboard controls, status/history and removal of private data on a role change worked at desktop and 390-pixel mobile widths in both themes. Screenshots are under `.local/deployment-evidence/pp-r05-*.jpg` and `pp-r05-preview-desktop.png`. The original theme and viewport were restored.

The local API on port 8080 now runs the R05 backend image `mage-backend:pp-r05-e02684a`; V20 migration completed, the one-time empty allowlist import completed, and all 25 scene IDs were preserved. The previous backend container is stopped as `mage-pulse-backend-before-r05`, and a pre-migration database backup is retained under the backend's ignored `.local/pp-r05-runtime/` directory. Custom rendering remains disabled. No administrator or moderator was assigned: the real app at `/settings/moderators` correctly denies the existing ordinary account until an administrator is explicitly selected. Production has not been changed by the R05 work.

# Scene availability (PP-R03)

Public availability is a playback permission, separate from local crash history and Pause all scenes. Local Retry, owner repair source, template labels, and cached documents cannot override it.

## Playback lifecycle

- Saved scenes use the host-supplied numeric ID. New drafts and imports use the global custom-rendering permission. IDs and trust flags inside submitted JSON are never authority.
- `MagePlayer`, hover previews, and direct `createMagePlayer` callers share one in-memory store. Creation awaits a fresh check before loading the engine module or executing source. Saved IDs must be bound at creation and loading; a different ID requires a new controller.
- Polling runs every 10 seconds, with at most 100 IDs per batch and two scene requests plus one global request concurrently. A cycle has a 5-second deadline, including stalled response bodies. No permission is persisted or inferred from list/detail data.
- Permission expires 20 seconds after the request **started**. Missing, malformed, mismatched, failed, offline, or stale status fails closed. Focus, visibility, and page restoration revoke permission before rechecking. Hidden pages release their renderers.
- Denial disposes the renderer and revokes retained local retry grants. Pending creation, audio, hover, and capture work cannot deliver late results into a disabled or replaced scene. Captures require a fresh check and discard results after source replacement or disposal.
- Re-enable allows a new renderer without clearing remembered failures, editor fields, or playlists. Home and detail refetch withheld source while checking route and authentication-session identity.
- Owners can fetch `/scenes/{id}/repair` after ownership verification. Its `playable: false` response supplies editor fields only. The preview keeps the saved ID and the same server guard.

The sole exception is fixed, deeply frozen platform brand artwork. Its explicit adapter capability accepts only that exact bundled object, never a clone, saved scene, or submitted document. The engine receives a separate copy.

## Operator walkthrough

1. Sign in as an operator already allowlisted on the backend and open a scene detail page. **Manage playback availability** appears beneath the description only after server authorization. Guests and ordinary owners receive no management controls.
2. Enter a reason and choose **Disable scene**. The UI waits for confirmation, refreshes the private audit, and invalidates local playback immediately. Other foreground pages observe the change on their next poll.
3. In another foreground window, confirm the player stops while metadata, thumbnail, comments, and navigation remain. There is no Retry button that bypasses policy.
4. Re-enable with a reason. A locally failed scene still requires its deliberate Retry. Editor changes and playlist entries remain intact.
5. The disclosure also contains the global switch and private reason/operator/time audit. A 401/403 removes controls. A 409 refreshes release-gate status. **Refresh status** picks up another operator's changes. Pending actions cannot be submitted twice.
6. Global disable covers saved scenes, drafts, imports, hover previews, and captures. Enabling remains unavailable until backend isolation release checks are approved. Never change that gate merely to try the UI.

Mutations conservatively revoke all local permissions, so unrelated previews may briefly pause after a scene-specific change. Public messages never expose operator reasons. An uncertain mutation response triggers a fresh check rather than implying success. Old-account requests cannot sign out a newer session or restore private operator state.

## Verification and timing

`sceneAvailability.test.ts` covers batching, freshness, invalid responses, deadlines, lifecycle changes, and late replies. `engineAdapter.availability.test.ts` combines the real store with a mocked transport/engine: disposal occurs at 10 seconds after a disable, or 15 seconds when the following poll stalls. The 20-second freshness limit is the final backstop. This meets the 30-second foreground bound under normal event-loop scheduling.

`MagePlayer.availability.test.tsx` covers source restoration, capture races, retained playlists, and server disablement during an interrupted retry. Editor, discovery, normalization, operator, and auth integration tests cover their respective boundaries. Existing unrelated player suites explicitly grant permission using a scoped fixture; availability tests exercise denied states and the real store.

For a browser check, open `/scripts/scene-availability-browser-check.html` on the development server. It runs the real player/engine with a fixed bundled template and page-local simulated status responses. Click **Disable fixture scene** and keep the page focused; the button changes the simulated server state without immediately invalidating the store. PASS requires the original canvas to be removed, its WebGL context to be lost, and the unavailable panel to appear within 30 seconds. This never changes the running backend or release approval. The October 3, 2026 local check passed at **5,363 ms**. The frontend regression run passed **1,116 tests in 98 files**, lint, and production build. The build retains the existing engine eval/large-chunk warnings.

## Remaining release dependency

PP-I02/PP-I03 still need to connect and enforce the isolated renderer. This change guards the current adapter; it does **not** supply isolation or make parent-process execution safe. A blocked main thread cannot run a timer. Keep custom rendering release-gated off until isolation and its end-to-end checks are complete. Carry the same freshness, revocation, identity, and capture guards into the iframe bridge and rerun the operator walkthrough then.

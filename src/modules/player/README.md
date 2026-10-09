# Player Module

This directory is the frontend-owned boundary for scene playback.

See [live scene settings](../../../docs/player-live-settings.md) for #236's audited
camera, motion, scale and effect updates that preserve the current player, plus
the settings that still require a complete scene load.

See [scene availability](../../../docs/scene-availability.md) for PP-R03's polling bounds, operator workflow, and remaining isolation release dependency.
See [render budgets](../../../docs/render-budgets.md) for PP-V02's shared validation policy, preview profiles, and runtime ceilings.
See [isolated renderer](../../../docs/isolated-renderer.md) for the separate host,
playback bridge, application adapter and AWS deployment procedure. PP-I03 routes
normal players through that boundary. The [release record](../../../docs/isolated-renderer-release.md)
distinguishes local integration results from production approval; public custom
rendering remains release-gated off until verification is complete.

## Public API

Import player behavior through `@modules/player`.

Exports:

- `MagePlayer`
- `MagePlayerProps`
- `createMagePlayer()`
- `createIsolatedPlayer()` (lower-level transport for controlled fixtures; normal app surfaces use the guarded `createMagePlayer` facade)
- `sceneRecovery` / `sceneRecoveryKey()` (shared recovery guard for all render surfaces)
- `sceneAvailabilityStore` / `useSceneAvailability()` (fresh server permission, independent of local recovery)
- `SceneAvailabilityAdminControls` (server-authorized block/unblock dialog for one scene)
- `fetchCustomControl()` / `updateCustomControl()` / `CustomRenderingControl` (shared API for the administrator-only custom shader tool in the moderation area)
- `listSceneTemplates()` (immutable picker metadata, without executable source)
- `parseSceneDocument()` / `hasSceneDocumentMarkers()` / `SceneContractError` (strict document validation; marker-bearing input must never fall back to raw scene data)
- `validateSceneDocument()` / `validateSceneForPlayback()` / `parseSceneImport()` / `SceneValidationError` (bounded policy validation before normalization or renderer creation)
- `getRenderBudget()` / `boundCaptureSize()` / `RenderProfile` (host-owned full/preview limits shared with the isolated renderer)
- `SceneDocument`, `TemplateSceneDocument`, `CustomSceneDocument`, `SceneTemplate`
- `MagePlayerController`
- `MageSceneBlob`
- `MagePlayerPlaybackState`
- `MagePlayerAudioState`
- `MagePlayerPlaylistTrack`
- `buildScenePlaylistTrack()`
- `formatPlaylistTrackName()`
- `mergePlaylistTrackCollections()`
- `readPlaylistTrackDisplayName()`
- `readPlaylistTrackMetaLine()`
- `readPlaylistTrackSummaryName()`
- `revokePlaylistTrackSource()`
- `revokePlaylistTrackSources()`
- `shufflePlaylistTracks()`

## Internal Responsibilities

- `MagePlayer.tsx`
  Shared React boundary for embedding the player in homepage, scene detail, and editor preview surfaces.
- `playlist.ts`
  Frontend-owned playlist types and helper functions used by the player module and consuming feature modules.
- `useMagePlayerPlaylist.ts`
  Internal playlist state orchestration for the shared player UI.
- `infrastructure/engineAdapter.ts`
  Guarded public facade: submitted scenes use the isolated controller; only the exact fixed platform brand artwork can use its private in-page engine path.
- `infrastructure/isolatedController.ts`
  `MagePlayerController` adapter applying validation, fresh availability, recovery leases, audio settings and capture/retry rules around the bridge.
- `isolation/`
  Parent-owned audio/input, fixed renderer configuration, versioned private-port transport and validated raster capture. Executable renderer code lives in `src/isolated-renderer/`.

## Component Surface

`MagePlayer` accepts:

- `sceneBlob`
- `sceneKey?` (stable scene identity; pass a route scene ID when available)
- `recoverySceneBlob?` (original document before host-added preview defaults; identity only)
- `posterUrl?` (static thumbnail shown while recovery blocks playback)
- `onAvailabilityRestored?` (refetch withheld saved source after fresh permission; retain route/session identity)
- `ariaLabel?`
- `className?`
- `initialPlayback?`
- `renderProfile?` (`full` by default; compact artwork and hover previews use `preview`)

Optional route-level playlist props:

- `playlistTracks?`
- `selectedTrackId?`
- `repeatEnabled?`
- `shuffleEnabled?`
- `onPlaylistChange?`
- `onRequestPlaylistOpen?`
- `onSelectedTrackChange?`
- `onTrackDurationChange?`

The adapter accepts versioned template/custom documents described in
[`contracts/scenes`](../../../contracts/scenes/README.md). Template documents are validated
before any engine load and resolved inside the child from the immutable platform library. The source never
comes from the submitted document. All 16 existing shader presets have a version 1 entry.

For compatibility, the adapter also accepts raw custom scene blobs that satisfy the shared
submission policy: `visualizer.shader` is required, and only documented scene fields are allowed.
Renderer settings, audio URLs, external assets, unknown keys, and out-of-range values are rejected.
Load playlist audio through the explicit host audio API, never through scene data.
Legacy blobs and explicit custom documents remain **untrusted**, even when their source matches
a template. All submitted scene kinds take the isolated path; classification does not authorize parent compilation.
Documents with any version/kind/template markers cannot fall back to legacy loading when invalid.

## Runtime Behavior

- `sceneBlob={null}` or `undefined` shows the empty state
- original scene data is validated before the renderer is created; `initialSceneBlob` is required when using `createMagePlayer()` directly
- engine pixel dimensions, DPR, frame rate, raymarch steps, effects, and captures are bounded without changing the saved document
- the current scene is applied when both the player and a valid `sceneBlob` are available
- changes only to saved audio-response settings apply live, preserving the song, position, volume, and playlist; changing `sceneKey` always loads the new scene, even for identical documents
- native editor controls/shortcuts stay disabled; full players support left-button drag rotation, canvas-local mouse/press reactions, and wheel-to-zoom over the canvas
- wheel zoom uses limits relative to the scene's authored camera distance (0.4–2.5 times the distance, respecting the near clip plane); these limits reset on scene load, not on hover changes
- shaders without their own pointer response receive a bounded live-material deformation, leaving saved scene data untouched
- `simulatedBeat={{ enabled, bpm }}` provides a silent editor-only rhythm at 60–180 BPM; actual playing music takes priority, and preview tempo is not saved
- About/home artwork keeps rotation and mouse reactions but leaves wheel scrolling alone; thumbnail hover previews stay noninteractive (`createMagePlayer` defaults to `mouseInteractions: false` and `mouseWheelZoom: false`)
- Ctrl/Meta+wheel and touch gestures remain browser-owned, and scrolling outside the player canvas is unchanged
- `initialPlayback="paused"` freezes the scene until the user presses `Play`
- `initialPlayback="playing"` keeps the scene running and shows a `Pause` control instead
- invalid scene data produces a recoverable error overlay instead of crashing the page
- initial/replacement documents always take the validated scene-load path; an audio-response-only update uses the numeric bridge without restarting the song
- the iframe, port, audio and pending work are disposed on unmount
- failed or interrupted revisions stay static until deliberate retry; safe mode disables automatic rendering across the site
- Stop and recovery controls remain outside the renderer; editor and playlist state survives replacing it

See [`docs/scene-recovery.md`](../../../docs/scene-recovery.md) for marker lifetime,
cross-tab behavior, failure signals, storage bounds, and execution-isolation limits.

Audio and playlist notes:

- `Add` opens a device file picker and appends selected files as playlist tracks
- local device tracks become playlist entries with generated ids and blob-backed source paths
- the shared play/pause button drives both scene playback state and the currently loaded audio track
- scrubbing and volume controls activate after an audio track is loaded
- route-owned playlist panels, such as the scene-detail sidebar, stay outside the shared player

Current route defaults:

- `HomePage` starts its hero preview in `playing`
- `SceneDetailPage` starts the main watch player in `playing`
- `CreateScenePage` starts the editor preview in `playing`

## Integration Rules

1. Feature modules should import from `@modules/player`, not from `@notrac/mage` or `infrastructure/engineAdapter.ts`.
2. Treat the engine adapter as infrastructure. The exact pinned B2MAGE engine release is the supported contract; engine behavior and browser/runtime quirks stay behind that layer. See [package maintenance](../../../docs/engine-package.md) for source and release ownership.
3. Full playback surfaces should embed `MagePlayer` and pass raw backend `sceneData` objects as `sceneBlob`. Controls-free previews may use `createMagePlayer()` with an HTML container and `initialSceneBlob` through this public module boundary, must share renderer instances where practical, await asynchronous `loadSceneBlob()`, and dispose their controller when no preview consumers remain. Bind saved IDs at creation/loading; never use the fixture-level transport to bypass permission or recovery.
4. Route-owned playlist editing UI may keep its own state, but shared playlist types and helpers come from this module.

The controller also exposes authored audio settings, temporary viewer overrides, scene capabilities,
diagnostics, and timestamped events. Use `setAudioResponseSettings()` for authored preview settings and
`setAudioResponseOverride()` for temporary viewer changes. An override never modifies saved scene data.
See `docs/audio-response.md` for the full contract and `scenePlaybackIdentity()` for the shared rule
that distinguishes a configuration update from a scene reload.

## Template authoring handoff

PP-B01 provides the contract, code-free catalog metadata, and playback resolution. PP-B03 connects
the existing editor to template selection and preserves template ID/version and bounded data
during editing and saving. New scenes default to a template; existing custom scenes remain custom
and remain editable/exportable when playback is disabled or unavailable. Previewing
valid custom edits requires fresh permission and the separate renderer; repair access
does not grant execution permission.
Do not run template documents through the legacy editor's `sanitizeSceneData` helpers: those
helpers add engine fields and would make a template document invalid. Source edits must create
a custom document, never alter the trusted registry or retain a template classification.

Template shader snapshots and version 1 engine defaults are private under `templates/`.
Changing source or defaults requires a new template version; old saved scenes must retain
their old ID/version resolution. The shared JSON catalog pins source fingerprints for regression
checks but is not a mechanism for approving submitted source.

## Isolated playback (PP-I02 / PP-I03)

`createIsolatedPlayer` composes the parent-owned audio session with a bounded,
versioned MessagePort bridge. Scene code is resolved and compiled only by the
separate renderer. It supports scene switching without replacing the audio session,
play/pause/reset/seek/volume, simulated beats, response mappings in scene settings,
resize, numeric pointer/orbit/optional wheel zoom, validated raster capture and bounded
live response settings/capability queries.
The local integration page is `/scripts/isolated-playback-check.html`, available only through `npm run manual-checks:dev`. Normal application servers retire all manual check paths; see [test tools](../../../docs/test-tools-cleanup.md).

This lower-level API does not itself authorize saved or custom content. Normal
players use `isolatedController.ts` through `createMagePlayer()` with the existing
availability/recovery/release guards. Do not bypass those guards or fall back to
in-page custom execution. The renderer URL and parent frame policy are fixed;
unconfigured sites fail closed. See `docs/isolated-renderer.md` for protocol limits
and `docs/isolated-renderer-release.md` for child-first deployment, parent-first
rollback and browser verification still required before public custom execution.

## Tests

Coverage lives in the colocated player specs under `src/modules/player/`.

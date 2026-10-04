export { MagePlayer } from './MagePlayer'
export { MagePlayerLoading } from './MagePlayerLoading'
export { createMagePlayer } from './infrastructure/engineAdapter'
export { createIsolatedPlayer } from './isolation/isolatedPlayer'
export type { IsolatedPlayer, IsolatedPlayerOptions } from './isolation/isolatedPlayer'
export { scenePlaybackIdentity } from './scenePlaybackIdentity'
export { sceneRecovery, sceneRecoveryKey } from './recovery/sceneRecovery'
export { listSceneTemplates } from './templates/templateRegistry'
export type { SceneTemplate } from './templates/templateRegistry'
export { hasSceneDocumentMarkers, parseSceneDocument, SceneContractError } from './templates/sceneContract'
export type { SceneDocument, TemplateSceneDocument, CustomSceneDocument } from './templates/sceneContract'
export { SceneValidationError, validateSceneDocument, validateSceneForPlayback, parseSceneImport, assertSceneRequestBudget, SCENE_POLICY, SCENE_LIMITS, SCENE_RUNTIME_CEILINGS } from './policy/sceneValidation'
export { getRenderBudget, boundCaptureSize } from './policy/renderBudget'
export type { RenderBudget, RenderProfile } from './policy/renderBudget'
export type { MageSceneKey } from './scenePlaybackIdentity'
export type { AudioResponseConfig, SceneAudioResponseMode } from '@shared/lib'
export {
  buildScenePlaylistTrack,
  formatPlaylistTrackName,
  mergePlaylistTrackCollections,
  readPlaylistTrackDisplayName,
  readPlaylistTrackMetaLine,
  readPlaylistTrackSummaryName,
  revokePlaylistTrackSource,
  revokePlaylistTrackSources,
  shufflePlaylistTracks,
} from './playlist'
export type { MagePlayerProps, MagePlayerAudioResponseCapabilitiesSnapshot } from './MagePlayer'
export type { MagePlayerPlaylistTrack } from './playlist'
export type {
  MagePlayerAudioState,
  MageAudioResponseState,
  MageAudioResponseCapabilities,
  MageAudioResponseDiagnostics,
  MageAudioResponseEvent,
  MageEngineDiagnostics,
  MagePlayerController,
  MagePlayerPlaybackState,
  MageSceneBlob,
} from './infrastructure/engineAdapter'

export { SceneAvailabilityAdminControls } from './availability/admin/SceneAvailabilityAdminControls'
export { BRAND_SCENE } from './templates/platformBrandScene'
export { useSceneAvailability } from './availability/useSceneAvailability'
export { availabilityTarget, availabilityStatusTarget } from './availability/availabilityTarget'
export { sceneAvailabilityStore } from './availability/sceneAvailability'
export { fetchCustomControl, updateCustomControl, isOperatorAccessDenied, OperatorRequestError } from './availability/admin/adminApi'
export type { CustomRenderingControl } from './availability/admin/adminApi'

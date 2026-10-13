export { MagePlayer } from './MagePlayer'
export { MagePlayerLoading } from './MagePlayerLoading'
export { createMagePlayer } from './infrastructure/engineAdapter'
export { createIsolatedPlayer } from './isolation/isolatedPlayer'
export type { IsolatedPlayer, IsolatedPlayerOptions } from './isolation/isolatedPlayer'
export { scenePlaybackIdentity } from './scenePlaybackIdentity'
export { sceneRecovery, sceneRecoveryKey } from './recovery/sceneRecovery'
export { listSceneTemplates, listSelectableSceneTemplates } from './templates/templateRegistry'
export { readTemplateShaderSource, createCustomSceneFromTemplate } from './templates/templateSource'
export { resolveSceneForPlayback } from './templates/resolveScene'
export type { SceneTemplate } from './templates/templateRegistry'
export { hasSceneDocumentMarkers, parseSceneDocument, SceneContractError } from './templates/sceneContract'
export { SCENE_PARAMETER_RULES, SCENE_SETTING_RULES } from './templates/sceneDefinitions'
export type { SceneDocument, PlayableSceneDocument, TemplateSceneDocument, CustomSceneDocument, BuilderSceneDocument, BuilderObject,
  BuilderOperation, BuilderVector, BuilderBinding, BuilderModifier, BuilderArrangement, BuilderMotion,
  BuilderFrame, BuilderMaterial, BuilderGroup, BuilderComposition, BuilderRenderSettings, TemplateId } from './templates/sceneContract'
export { builderCompositionRoots, builderCompositionNodes, validateBuilderComposition } from './templates/builderComposition'
export type { BuilderCompositionNode } from './templates/builderComposition'
export { BUILDER_OPERATIONS, BUILDER_SHAPES, BUILDER_LIMITS, BUILDER_TRANSFORMS, BUILDER_MATERIAL,
  BUILDER_GROUP_TRANSFORMS, BUILDER_GROUP_BLEND, BUILDER_GROUP_RANGES, BUILDER_RENDER_SETTINGS,
  BUILDER_MODIFIERS, BUILDER_ARRANGEMENTS, BUILDER_SPIN, builderOperationFields,
  createBuilderOperation, createBuilderModifier, createBuilderArrangement, createBuilderMotion,
  BUILDER_BINDING_RULES, BUILDER_BINDING_LIMIT, BUILDER_BINDING_RANGES, createBuilderBinding } from './templates/builderDefinitions'
export type { BuilderShape, BuilderDimension, BuilderGroupTarget } from './templates/builderDefinitions'
export type { BuilderDriver, BuilderDriverExpression, BuilderDriverSource, BuilderDriverTarget } from './templates/sceneContract'
export { BUILDER_DRIVER_LIMITS, builderDriverTargetRange, builderDriverResultRange, validateBuilderDriverExpression } from './templates/builderDrivers'
export { builderColorChannels, builderColorHex } from './templates/builderColor'
export type { BuilderColor, BuilderDistanceModifier } from './templates/sceneContract'
export { SceneValidationError, validateSceneDocument, validateSceneForStorage, validateSceneForPlayback, parseSceneImport, assertSceneRequestBudget, assertSceneDocumentBudget, SCENE_POLICY, SCENE_LIMITS, SCENE_RUNTIME_CEILINGS } from './policy/sceneValidation'
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
export type { MagePlayerProps, MagePlayerAudioResponseCapabilitiesSnapshot, MagePlayerPlaybackStatus } from './MagePlayer'
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

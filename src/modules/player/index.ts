export { MagePlayer } from './MagePlayer'
export { MagePlayerLoading } from './MagePlayerLoading'
export { createMagePlayer } from './infrastructure/engineAdapter'
export { scenePlaybackIdentity } from './scenePlaybackIdentity'
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

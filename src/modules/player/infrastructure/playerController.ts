import type { MAGEEngineAPI } from '@notrac/mage'
import type { AudioResponseConfig, SceneAudioResponseMode } from '@shared/lib'
import type { RenderProfile } from '../policy/renderBudget'

export type MageSceneBlob = Record<string, unknown>

export type MagePlayerPlaybackState = 'paused' | 'playing'

export type MageEngineDiagnostics = Readonly<{
  size: number | null
  pointerDown: number | null
  currPointerDown: number | null
  currAudio: number | null
}>

export type MageAudioResponseCapabilities = ReturnType<MAGEEngineAPI['getAudioResponseCapabilities']>
export type MageAudioResponseDiagnostics = ReturnType<MAGEEngineAPI['getAudioResponseDiagnostics']>
export type MageAudioResponseEvent = ReturnType<MAGEEngineAPI['getAudioResponseEvents']>[number]
export type MageAudioResponseState = {
  savedMode: SceneAudioResponseMode
  savedConfig: AudioResponseConfig | null
  override: AudioResponseConfig | null
  effectiveMode: SceneAudioResponseMode
  effectiveConfig: AudioResponseConfig | null
}

export type MagePlayerAudioState = {
  currentTime: number
  duration: number
  hasSource: boolean
  isLoaded: boolean
  sourcePath: string | null
  volume: number
}

export type MagePlayerCaptureFrameOptions = {
  height?: number
  quality?: number
  type?: string
  width?: number
}

export type MageSceneLoadOptions = {
  sceneKey?: string | number
  /** Original saved/editor document before host-side preview defaults. Identity only. */
  recoverySceneBlob?: MageSceneBlob
}

export type MagePlayerController = {
  captureFramePreview?: (
    options?: MagePlayerCaptureFrameOptions,
  ) => Promise<string | null>
  clearAudio: () => MagePlayerAudioState
  dispose: () => void
  getAudioState: () => MagePlayerAudioState
  getAudioResponseState: () => MageAudioResponseState
  getAudioResponseCapabilities: () => MageAudioResponseCapabilities | null
  getAudioResponseDiagnostics: () => MageAudioResponseDiagnostics | null
  getAudioResponseEvents: (afterId?: number) => MageAudioResponseEvent[]
  getPlaybackState: () => MagePlayerPlaybackState
  /** Identity of a stopped renderer, so a different permitted revision can get a fresh instance. */
  getStoppedRecoveryKey?: () => string | null
  getEngineDiagnostics?: () => MageEngineDiagnostics | null
  loadAudio: (options?: { sourceLabel?: string; sourcePath?: string }) => Promise<MagePlayerAudioState>
  loadSceneBlob: (sceneBlob: unknown, options?: MageSceneLoadOptions) => void | Promise<void>
  updateRecoveryIdentity?: (sceneBlob: unknown, options?: MageSceneLoadOptions) => void
  resetPlayback: () => MagePlayerPlaybackState
  seekAudio: (time: number) => MagePlayerAudioState
  setAudioVolume: (volume: number) => MagePlayerAudioState
  setAudioResponseSettings: (mode: SceneAudioResponseMode | undefined, config?: unknown) => MageAudioResponseState
  setAudioResponseOverride: (config: unknown | null) => MageAudioResponseState
  setPlaybackState: (playbackState: MagePlayerPlaybackState) => MagePlayerPlaybackState
  /** Suspend visuals while a replacement is checked, preserving parent audio and user playback intent. */
  setRenderingSuspended?: (suspended: boolean) => void
  setSyntheticPreview: (enabled: boolean, seed?: number, tempoScale?: number) => void
  stopRendering?: () => void
}

export class MagePlayerAdapterError extends Error {
  override cause: unknown

  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message)
    this.name = 'MagePlayerAdapterError'
    this.cause = options.cause
  }
}

export type MagePlayerOptions = {
  log?: boolean; pixelRatio?: number; mouseInteractions?: boolean; mouseWheelZoom?: boolean;
  sceneKey?: string | number; platformArtwork?: 'brand'; renderProfile?: RenderProfile; initialSceneBlob?: unknown;
  /** Cancels pending creation and disposes this player's resources on abort. */
  signal?: AbortSignal;
}

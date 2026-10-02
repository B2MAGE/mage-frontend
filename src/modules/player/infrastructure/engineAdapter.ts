import type { MAGEEngineAPI } from '@notrac/mage'
import { normalizeAudioResponseMode, normalizeAudioResponseConfig, type AudioResponseConfig, type SceneAudioResponseMode } from '@shared/lib'
import { attachViewerMouseInteractions, type ViewerMouseEngine } from './viewerMouseInteractions'

const SCENE_BLOB_KEYS = [
  'audio',
  'audioPath',
  'controls',
  'fx',
  'intent',
  'settings',
  'state',
  'visualizer',
] as const

const MIN_RUNNING_ENGINE_TIME = 1 / 60
const DEFAULT_ENGINE_CONTROLS = {
  active: false,
  integrated: false,
} as const
const GENERIC_RENDER_ERROR_MESSAGE = 'Scene data could not be rendered by the MAGE engine.'

type MageEngineBridge = {
  getEngineFields: ViewerMouseEngine['getEngineFields']
  setInputState: ViewerMouseEngine['setInputState']
  captureFramePreview?: MAGEEngineAPI['captureFramePreview']
  dispose: MAGEEngineAPI['dispose']
  getAudioDuration?: MAGEEngineAPI['getAudioDuration']
  getAudioTime?: MAGEEngineAPI['getAudioTime']
  getAudioVolume?: () => number
  getAudioResponseCapabilities?: MAGEEngineAPI['getAudioResponseCapabilities']
  getAudioResponseDiagnostics?: MAGEEngineAPI['getAudioResponseDiagnostics']
  getAudioResponseEvents?: MAGEEngineAPI['getAudioResponseEvents']
  getEngineTime?: MAGEEngineAPI['getEngineTime']
  isAudioLoaded?: MAGEEngineAPI['isAudioLoaded']
  loadAudio?: MAGEEngineAPI['loadAudio']
  pause: MAGEEngineAPI['pause']
  play: MAGEEngineAPI['play']
  loadPreset: (scene: unknown) => unknown
  seek?: MAGEEngineAPI['seek']
  setAudioVolume?: (volume: number) => number
  setAudioResponseMode?: (mode: SceneAudioResponseMode) => void
  setAudioResponseConfig?: MAGEEngineAPI['setAudioResponseConfig']
  setEngineTime?: (time: number) => boolean
  setSyntheticPreview: MAGEEngineAPI['setSyntheticPreview']
  start: MAGEEngineAPI['start']
  unloadAudio?: MAGEEngineAPI['unloadAudio']
}

type MageEngineModule = {
  initMAGE: (config: {
    autoStart?: boolean
    canvas: HTMLCanvasElement
    log?: boolean
    pixelRatio?: number
    withControls?: {
      active?: boolean
      integrated?: boolean
    }
  }) => MageEngineBridge
}

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
  getEngineDiagnostics?: () => MageEngineDiagnostics | null
  loadAudio: (options?: { sourceLabel?: string; sourcePath?: string }) => Promise<MagePlayerAudioState>
  loadSceneBlob: (sceneBlob: unknown) => void
  resetPlayback: () => MagePlayerPlaybackState
  seekAudio: (time: number) => MagePlayerAudioState
  setAudioVolume: (volume: number) => MagePlayerAudioState
  setAudioResponseSettings: (mode: SceneAudioResponseMode | undefined, config?: unknown) => MageAudioResponseState
  setAudioResponseOverride: (config: unknown | null) => MageAudioResponseState
  setPlaybackState: (playbackState: MagePlayerPlaybackState) => MagePlayerPlaybackState
  setSyntheticPreview: (enabled: boolean, seed?: number, tempoScale?: number) => void
}

export class MagePlayerAdapterError extends Error {
  override cause: unknown

  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message)
    this.name = 'MagePlayerAdapterError'
    this.cause = options.cause
  }
}

let mageEngineModulePromise: Promise<MageEngineModule> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMageSceneBlob(value: unknown): value is MageSceneBlob {
  if (!isRecord(value)) {
    return false
  }

  return SCENE_BLOB_KEYS.some((key) => Object.hasOwn(value, key))
}

function readErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.trim()

    if (!message) {
      return error.name !== 'Error' ? error.name : null
    }

    return error.name !== 'Error' && !message.startsWith(`${error.name}:`)
      ? `${error.name}: ${message}`
      : message
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  return null
}

function createSceneRenderError(cause?: unknown) {
  const details = readErrorDetails(cause)

  if (!details || details === GENERIC_RENDER_ERROR_MESSAGE) {
    return new MagePlayerAdapterError(GENERIC_RENDER_ERROR_MESSAGE, { cause })
  }

  return new MagePlayerAdapterError(`${GENERIC_RENDER_ERROR_MESSAGE} ${details}`, { cause })
}

function createAudioError(message: string, cause?: unknown) {
  return new MagePlayerAdapterError(message, { cause })
}

function loadSceneIntoEngine(engine: MageEngineBridge, sceneBlob: MageSceneBlob) {
  const loadedScene = engine.loadPreset(sceneBlob)

  if (!loadedScene) {
    throw createSceneRenderError()
  }
}

function readSceneAudioSource(sceneBlob: MageSceneBlob) {
  const audioPath = sceneBlob.audioPath

  if (typeof audioPath === 'string' && audioPath.trim()) {
    return audioPath.trim()
  }

  const audio = sceneBlob.audio

  if (typeof audio === 'string' && audio.trim()) {
    return audio.trim()
  }

  if (isRecord(audio)) {
    const audioSource = audio.path ?? audio.url

    if (typeof audioSource === 'string' && audioSource.trim()) {
      return audioSource.trim()
    }
  }

  return null
}

function clampAudioTime(engine: MageEngineBridge, time: number) {
  const normalizedTime = Number.isFinite(time) ? Math.max(time, 0) : 0

  if (typeof engine.getAudioDuration !== 'function') {
    return normalizedTime
  }

  const duration = engine.getAudioDuration()

  if (!Number.isFinite(duration) || duration <= 0) {
    return normalizedTime
  }

  return Math.min(normalizedTime, duration)
}

function clampAudioVolume(volume: number) {
  if (!Number.isFinite(volume)) {
    return 1
  }

  return Math.min(Math.max(volume, 0), 1)
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function primeEngineTime(engine: MageEngineBridge) {
  if (
    typeof engine.getEngineTime === 'function' &&
    typeof engine.setEngineTime === 'function' &&
    engine.getEngineTime() <= 0
  ) {
    engine.setEngineTime(MIN_RUNNING_ENGINE_TIME)
  }
}

function applyPlaybackState(
  engine: MageEngineBridge,
  playbackState: MagePlayerPlaybackState,
) {
  if (playbackState === 'paused') {
    engine.pause()
    return playbackState
  }

  // The published engine can stop immediately when it starts from exactly time 0.
  // Prime the engine just past zero before resuming so the scene can animate.
  primeEngineTime(engine)
  engine.play()
  return playbackState
}

async function loadMageEngineModule() {
  if (!mageEngineModulePromise) {
    // getEngineFields is exposed at runtime in 1.0.3 but omitted from its declarations.
    mageEngineModulePromise = (import('@notrac/mage') as unknown as Promise<MageEngineModule>).catch((error) => {
      mageEngineModulePromise = null
      throw error
    })
  }

  return mageEngineModulePromise
}

export async function createMagePlayer(
  canvas: HTMLCanvasElement,
  options: { log?: boolean; pixelRatio?: number; mouseInteractions?: boolean; mouseWheelZoom?: boolean } = {},
): Promise<MagePlayerController> {
  const { initMAGE } = await loadMageEngineModule()
  const engine = initMAGE({
    canvas,
    autoStart: false,
    log: options.log ?? false,
    ...(options.pixelRatio === undefined ? {} : { pixelRatio: options.pixelRatio }),
    withControls: DEFAULT_ENGINE_CONTROLS,
  })

  engine.start()
  let mouseInteractions: ReturnType<typeof attachViewerMouseInteractions> | null = null
  try {
    if (options.mouseInteractions) {
      mouseInteractions = attachViewerMouseInteractions(canvas, engine, { wheelZoom: options.mouseWheelZoom ?? false })
    }
  } catch (error) {
    engine.dispose()
    throw new MagePlayerAdapterError('Scene mouse interactions could not be initialized.', { cause: error })
  }
  let hasLoadedScene = false
  let currentSceneBlob: MageSceneBlob | null = null
  let hasAttachedAudio = false
  let currentAudioLabel: string | null = null
  let currentAudioTime = 0
  let currentAudioVolume = 1
  let trackedAudioStartedAtMs: number | null = null
  let playbackState: MagePlayerPlaybackState = 'playing'
  let savedMode: SceneAudioResponseMode = 'legacy'
  let savedConfig: AudioResponseConfig | null = null
  let responseOverride: AudioResponseConfig | null = null
  let appliedResponseMode: SceneAudioResponseMode = 'legacy'
  let appliedResponseConfig: string | null = null
  let audioLoadGeneration = 0

  function getAudioResponseState(): MageAudioResponseState {
    const effectiveMode = responseOverride ? 'mapped-v1' : savedMode
    return {
      savedMode,
      savedConfig: savedConfig ? normalizeAudioResponseConfig(savedConfig).config : null,
      override: responseOverride ? normalizeAudioResponseConfig(responseOverride).config : null,
      effectiveMode,
      effectiveConfig: effectiveMode === 'mapped-v1'
        ? normalizeAudioResponseConfig(responseOverride ?? savedConfig).config : null,
    }
  }

  function applyAudioResponse(force = false) {
    const response = getAudioResponseState()
    const modeChanged = force || response.effectiveMode !== appliedResponseMode
    const configKey = response.effectiveConfig ? JSON.stringify(response.effectiveConfig) : null
    // Re-selecting a mode tears down its analyzer. Live configuration edits
    // retain the audio clock and analysis history by changing only the config.
    if (modeChanged) engine.setAudioResponseMode?.(response.effectiveMode)
    if (response.effectiveMode === 'mapped-v1' && (modeChanged || configKey !== appliedResponseConfig)) {
      engine.setAudioResponseConfig?.(response.effectiveConfig)
    }
    appliedResponseMode = response.effectiveMode
    appliedResponseConfig = configKey
  }

  function readSavedAudioResponse(sceneBlob: MageSceneBlob) {
    savedMode = normalizeAudioResponseMode(sceneBlob.audioResponse)
    savedConfig = Object.hasOwn(sceneBlob, 'audioResponseConfig')
      ? normalizeAudioResponseConfig(sceneBlob.audioResponseConfig).config : null
  }

  function loadInteractiveSceneBlob(sceneBlob: MageSceneBlob) {
    mouseInteractions?.prepareSceneLoad()
    try {
      loadSceneIntoEngine(engine, sceneBlob)
      applyAudioResponse(true)
    } finally {
      mouseInteractions?.sceneLoaded()
    }
  }

  function getTrackedAudioDuration() {
    return typeof engine.getAudioDuration === 'function' ? clampAudioTime(engine, engine.getAudioDuration()) : 0
  }

  function syncTrackedAudioTime() {
    if (trackedAudioStartedAtMs === null) {
      return
    }

    const elapsedSeconds = Math.max((nowMs() - trackedAudioStartedAtMs) / 1000, 0)
    const duration = getTrackedAudioDuration()

    currentAudioTime =
      duration > 0 ? Math.min(currentAudioTime + elapsedSeconds, duration) : currentAudioTime + elapsedSeconds
    trackedAudioStartedAtMs = duration > 0 && currentAudioTime >= duration ? null : nowMs()
  }

  function setTrackedAudioTime(nextTime: number) {
    currentAudioTime =
      getTrackedAudioDuration() > 0 ? Math.min(clampAudioTime(engine, nextTime), getTrackedAudioDuration()) : Math.max(nextTime, 0)
  }

  function resumeTrackedAudioTime() {
    if (typeof engine.isAudioLoaded === 'function' && !engine.isAudioLoaded()) {
      trackedAudioStartedAtMs = null
      return
    }

    trackedAudioStartedAtMs = nowMs()
  }

  function pauseTrackedAudioTime() {
    syncTrackedAudioTime()
    trackedAudioStartedAtMs = null
  }

  function getAudioState(): MagePlayerAudioState {
    const sourcePath = hasAttachedAudio ? currentAudioLabel : null
    const isLoaded =
      hasAttachedAudio && typeof engine.isAudioLoaded === 'function' ? engine.isAudioLoaded() : false
    const duration = isLoaded ? getTrackedAudioDuration() : 0

    if (isLoaded) {
      syncTrackedAudioTime()
    } else {
      currentAudioTime = 0
      trackedAudioStartedAtMs = null
    }

    const volume =
      typeof engine.getAudioVolume === 'function'
        ? clampAudioVolume(engine.getAudioVolume())
        : currentAudioVolume

    currentAudioVolume = volume

    return {
      currentTime: duration > 0 ? Math.min(currentAudioTime, duration) : currentAudioTime,
      duration,
      hasSource: Boolean(sourcePath),
      isLoaded,
      sourcePath,
      volume,
    }
  }

  function setPlaybackState(nextPlaybackState: MagePlayerPlaybackState) {
    playbackState = nextPlaybackState

    if (!hasLoadedScene || !currentSceneBlob) {
      return playbackState
    }

    if (nextPlaybackState === 'paused') {
      playbackState = applyPlaybackState(engine, nextPlaybackState)
    } else if (hasAttachedAudio) {
      playbackState = applyPlaybackState(engine, nextPlaybackState)
    } else {
      primeEngineTime(engine)
      engine.start()
      playbackState = nextPlaybackState
    }

    if (nextPlaybackState === 'paused') {
      pauseTrackedAudioTime()
    } else {
      resumeTrackedAudioTime()
    }

    return playbackState
  }

  return {
    async captureFramePreview(options = {}) {
      if (!hasLoadedScene || !currentSceneBlob) {
        throw new MagePlayerAdapterError(
          'Load a scene before capturing a thumbnail.',
        )
      }

      if (typeof engine.captureFramePreview !== 'function') {
        throw new MagePlayerAdapterError(
          'This MAGE engine build does not support preview capture.',
        )
      }

      try {
        return await engine.captureFramePreview(options)
      } catch (error) {
        throw new MagePlayerAdapterError(
          'The live preview could not be captured.',
          { cause: error },
        )
      }
    },
    clearAudio() {
      audioLoadGeneration += 1
      if (typeof engine.unloadAudio === 'function') {
        engine.unloadAudio()
      }

      hasAttachedAudio = false
      currentAudioLabel = null
      currentAudioTime = 0
      trackedAudioStartedAtMs = null

      return {
        currentTime: 0,
        duration: 0,
        hasSource: false,
        isLoaded: false,
        sourcePath: null,
        volume: currentAudioVolume,
      }
    },
    getAudioState,
    getAudioResponseState,
    getAudioResponseCapabilities() {
      return engine.getAudioResponseCapabilities ? structuredClone(engine.getAudioResponseCapabilities()) : null
    },
    getAudioResponseDiagnostics() {
      return engine.getAudioResponseDiagnostics ? structuredClone(engine.getAudioResponseDiagnostics()) : null
    },
    getAudioResponseEvents(afterId) {
      return engine.getAudioResponseEvents ? structuredClone(engine.getAudioResponseEvents(afterId)) : []
    },
    getEngineDiagnostics() {
      if (!hasLoadedScene) return null
      try {
        const state: unknown = engine.getEngineFields()?.state
        if (!isRecord(state)) return null
        const measurement = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
        // Copy measurements rather than exposing the engine's mutable state.
        return {
          size: measurement(state.size),
          pointerDown: measurement(state.pointerDown),
          currPointerDown: measurement(state.currPointerDown),
          currAudio: measurement(state.currAudio),
        }
      } catch {
        return null
      }
    },
    setAudioResponseSettings(mode, config) {
      if (!currentSceneBlob) throw new MagePlayerAdapterError('Load a scene before changing its audio response.')
      const nextScene = { ...currentSceneBlob }
      if (mode === undefined) delete nextScene.audioResponse
      else nextScene.audioResponse = normalizeAudioResponseMode(mode)
      if (config === undefined) delete nextScene.audioResponseConfig
      else nextScene.audioResponseConfig = normalizeAudioResponseConfig(config).config
      currentSceneBlob = nextScene
      readSavedAudioResponse(nextScene)
      applyAudioResponse()
      return getAudioResponseState()
    },
    setAudioResponseOverride(config) {
      if (!currentSceneBlob) throw new MagePlayerAdapterError('Load a scene before changing its audio response.')
      responseOverride = config === null ? null : normalizeAudioResponseConfig(config).config
      applyAudioResponse()
      return getAudioResponseState()
    },
    getPlaybackState() {
      return playbackState
    },
    async loadAudio(options = {}) {
      if (!hasLoadedScene || !currentSceneBlob) {
        throw createAudioError('Load a scene before loading audio.')
      }

      const savedAudioSource = readSceneAudioSource(currentSceneBlob)
      const audioSource = options.sourcePath ?? savedAudioSource
      const audioLabel = options.sourceLabel ?? audioSource ?? null

      if (typeof engine.loadAudio !== 'function') {
        throw createAudioError('This MAGE engine build does not support audio loading.')
      }

      if (!audioSource) {
        throw createAudioError('Choose an audio file or save an audioPath on the scene.')
      }

      const loadGeneration = ++audioLoadGeneration
      function assertCurrentAudioLoad() {
        if (loadGeneration !== audioLoadGeneration) {
          throw createAudioError('Audio loading was superseded by a newer player action.')
        }
      }

      if (typeof engine.unloadAudio === 'function') {
        engine.unloadAudio()
      }

      try {
        hasAttachedAudio = false
        currentAudioLabel = audioLabel
        engine.loadAudio(audioSource)
      } catch (error) {
        throw createAudioError('Audio could not be loaded from the configured source.', error)
      }

      await new Promise<void>((resolve, reject) => {
        const startedAt = Date.now()

        function poll() {
          try {
            assertCurrentAudioLoad()
          } catch (error) {
            reject(error)
            return
          }
          if (typeof engine.isAudioLoaded === 'function' && engine.isAudioLoaded()) {
            resolve()
            return
          }

          if (Date.now() - startedAt >= 5000) {
            reject(createAudioError('Audio could not be loaded from the configured source.'))
            return
          }

          window.setTimeout(poll, 50)
        }

        poll()
      })
      assertCurrentAudioLoad()

      const audioTime =
        typeof engine.getEngineTime === 'function'
          ? clampAudioTime(engine, engine.getEngineTime())
          : 0

      if (typeof engine.seek === 'function') {
        engine.seek(audioTime)
      }

      hasAttachedAudio = true
      setTrackedAudioTime(audioTime)

      if (typeof engine.setAudioVolume === 'function') {
        currentAudioVolume = clampAudioVolume(engine.setAudioVolume(currentAudioVolume))
      }

      if (playbackState === 'paused') {
        pauseTrackedAudioTime()
        engine.pause()
      } else {
        resumeTrackedAudioTime()
        engine.play()
      }

      return getAudioState()
    },
    loadSceneBlob(sceneBlob) {
      if (!isMageSceneBlob(sceneBlob)) {
        throw new MagePlayerAdapterError('Scene data is missing required MAGE fields.')
      }
      audioLoadGeneration += 1

      try {
        if (typeof engine.unloadAudio === 'function') {
          engine.unloadAudio()
        }

        currentSceneBlob = { ...sceneBlob }
        readSavedAudioResponse(sceneBlob)
        responseOverride = null
        hasAttachedAudio = false
        currentAudioLabel = null
        currentAudioTime = 0
        trackedAudioStartedAtMs = null
        hasLoadedScene = true
        loadInteractiveSceneBlob(sceneBlob)
        playbackState = applyPlaybackState(engine, playbackState)
      } catch (error) {
        currentSceneBlob = null
        savedMode = 'legacy'
        savedConfig = null
        responseOverride = null
        hasAttachedAudio = false
        currentAudioLabel = null
        hasLoadedScene = false

        if (error instanceof MagePlayerAdapterError) {
          throw error
        }

        throw createSceneRenderError(error)
      }
    },
    resetPlayback() {
      if (!hasLoadedScene || !currentSceneBlob) {
        throw new MagePlayerAdapterError('Load a scene before resetting playback.')
      }

      playbackState = 'paused'
      currentAudioTime = 0
      trackedAudioStartedAtMs = null
      loadInteractiveSceneBlob(currentSceneBlob)

      if (typeof engine.seek === 'function') {
        engine.seek(0)
      }

      engine.start()
      engine.pause()
      return playbackState
    },
    seekAudio(time) {
      if (!hasLoadedScene || !currentSceneBlob) {
        throw new MagePlayerAdapterError('Load a scene before seeking audio.')
      }

      const nextTime = clampAudioTime(engine, time)

      if (typeof engine.seek === 'function') {
        engine.seek(nextTime)
      }

      setTrackedAudioTime(nextTime)

      if (playbackState === 'playing') {
        resumeTrackedAudioTime()
      } else {
        trackedAudioStartedAtMs = null
      }

      return getAudioState()
    },
    setAudioVolume(volume) {
      currentAudioVolume = clampAudioVolume(volume)

      if (typeof engine.setAudioVolume === 'function') {
        currentAudioVolume = clampAudioVolume(engine.setAudioVolume(currentAudioVolume))
      }

      return getAudioState()
    },
    setSyntheticPreview(enabled, seed, tempoScale) {
      if (tempoScale === undefined) {
        engine.setSyntheticPreview(enabled, seed)
      } else {
        engine.setSyntheticPreview(enabled, seed, tempoScale)
      }
    },
    setPlaybackState,
    dispose() {
      audioLoadGeneration += 1
      hasLoadedScene = false
      mouseInteractions?.dispose()
      engine.dispose()
    },
  }
}

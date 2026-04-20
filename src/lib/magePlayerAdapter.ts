import type { MAGEEngineAPI } from '@notrac/mage'

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
  dispose: MAGEEngineAPI['dispose']
  getAudioDuration?: MAGEEngineAPI['getAudioDuration']
  getAudioTime?: MAGEEngineAPI['getAudioTime']
  getAudioVolume?: () => number
  getEngineTime?: MAGEEngineAPI['getEngineTime']
  isAudioLoaded?: MAGEEngineAPI['isAudioLoaded']
  loadAudio?: MAGEEngineAPI['loadAudio']
  pause: MAGEEngineAPI['pause']
  play: MAGEEngineAPI['play']
  loadPreset: (scene: unknown) => unknown
  seek?: MAGEEngineAPI['seek']
  setAudioVolume?: (volume: number) => number
  setEngineTime?: (time: number) => boolean
  start: MAGEEngineAPI['start']
  unloadAudio?: MAGEEngineAPI['unloadAudio']
}

type MageEngineModule = {
  initMAGE: (config: {
    autoStart?: boolean
    canvas: HTMLCanvasElement
    log?: boolean
    withControls?: {
      active?: boolean
      integrated?: boolean
    }
  }) => MageEngineBridge
}

export type MageSceneBlob = Record<string, unknown>

export type MagePlayerPlaybackState = 'paused' | 'playing'

export type MagePlayerAudioState = {
  currentTime: number
  duration: number
  hasSource: boolean
  isLoaded: boolean
  sourcePath: string | null
  volume: number
}

export type MagePlayerController = {
  clearAudio: () => MagePlayerAudioState
  dispose: () => void
  getAudioState: () => MagePlayerAudioState
  getPlaybackState: () => MagePlayerPlaybackState
  loadAudio: (options?: { sourceLabel?: string; sourcePath?: string }) => Promise<MagePlayerAudioState>
  loadSceneBlob: (sceneBlob: unknown) => void
  resetPlayback: () => MagePlayerPlaybackState
  seekAudio: (time: number) => MagePlayerAudioState
  setAudioVolume: (volume: number) => MagePlayerAudioState
  setPlaybackState: (playbackState: MagePlayerPlaybackState) => MagePlayerPlaybackState
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
    mageEngineModulePromise = (import('@notrac/mage') as Promise<MageEngineModule>).catch((error) => {
      mageEngineModulePromise = null
      throw error
    })
  }

  return mageEngineModulePromise
}

export async function createMagePlayer(
  canvas: HTMLCanvasElement,
  options: { log?: boolean } = {},
): Promise<MagePlayerController> {
  const { initMAGE } = await loadMageEngineModule()
  const engine = initMAGE({
    canvas,
    autoStart: false,
    log: options.log ?? false,
    withControls: DEFAULT_ENGINE_CONTROLS,
  })

  engine.start()
  let hasLoadedScene = false
  let currentSceneBlob: MageSceneBlob | null = null
  let currentAudioLabel: string | null = null
  let currentAudioTime = 0
  let currentAudioVolume = 1
  let trackedAudioStartedAtMs: number | null = null
  let playbackState: MagePlayerPlaybackState = 'playing'

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
    const sourcePath = currentAudioLabel ?? (currentSceneBlob ? readSceneAudioSource(currentSceneBlob) : null)
    const isLoaded = typeof engine.isAudioLoaded === 'function' ? engine.isAudioLoaded() : false
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

    playbackState = applyPlaybackState(engine, nextPlaybackState)

    if (nextPlaybackState === 'paused') {
      pauseTrackedAudioTime()
    } else {
      resumeTrackedAudioTime()
    }

    return playbackState
  }

  return {
    clearAudio() {
      if (typeof engine.unloadAudio === 'function') {
        engine.unloadAudio()
      }

      currentAudioLabel = null
      currentAudioTime = 0
      trackedAudioStartedAtMs = null

      return getAudioState()
    },
    getAudioState,
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

      if (typeof engine.unloadAudio === 'function') {
        engine.unloadAudio()
      }

      try {
        currentAudioLabel = audioLabel
        engine.loadAudio(audioSource)
      } catch (error) {
        throw createAudioError('Audio could not be loaded from the configured source.', error)
      }

      await new Promise<void>((resolve, reject) => {
        const startedAt = Date.now()

        function poll() {
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

      const audioTime =
        typeof engine.getEngineTime === 'function'
          ? clampAudioTime(engine, engine.getEngineTime())
          : 0

      if (typeof engine.seek === 'function') {
        engine.seek(audioTime)
      }

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

      try {
        if (typeof engine.unloadAudio === 'function') {
          engine.unloadAudio()
        }

        currentSceneBlob = sceneBlob
        currentAudioLabel = null
        currentAudioTime = 0
        trackedAudioStartedAtMs = null
        hasLoadedScene = true
        loadSceneIntoEngine(engine, sceneBlob)
        playbackState = applyPlaybackState(engine, playbackState)
      } catch (error) {
        currentSceneBlob = null
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
      loadSceneIntoEngine(engine, currentSceneBlob)

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
    setPlaybackState,
    dispose() {
      engine.dispose()
    },
  }
}

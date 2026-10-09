import type { MAGEEngineAPI } from '@notrac/mage'
import { createIsolatedMageController } from './isolatedController'
import { MagePlayerAdapterError, type MageSceneBlob, type MagePlayerPlaybackState, type MagePlayerAudioState, type MagePlayerController, type MageAudioResponseState, type MagePlayerOptions } from './playerController'
export * from './playerController'
import { normalizeAudioResponseMode, normalizeAudioResponseConfig, type AudioResponseConfig, type SceneAudioResponseMode } from '@shared/lib'
import { attachViewerMouseInteractions, type ViewerMouseEngine } from './viewerMouseInteractions'
import { resolveSceneForPlayback } from '../templates/resolveScene'
import { sceneRecovery, sceneRecoveryKey } from '../recovery/sceneRecovery'
import { monitorSceneRendering, type RenderFailure } from '../recovery/renderRecoveryMonitor'
import { sceneAvailabilityStore } from '../availability/sceneAvailability'
import { availabilityTarget } from '../availability/availabilityTarget'
import { BRAND_SCENE } from '../templates/platformBrandScene'
import { SCENE_POLICY, validateSceneForPlayback } from '../policy/sceneValidation'
import { boundCaptureSize, getRenderBudget, type RenderBudget } from '../policy/renderBudget'
import { playerStartupCancelled, waitForPlayerStartup } from './playerStartup'

const SCENE_BLOB_KEYS = [
  'audioPath',
  'controls',
  'fx',
  'intent',
  'settings',
  'state',
  'visualizer',
] as const

const DEFAULT_ENGINE_CONTROLS = {
  active: false,
  integrated: false,
} as const
const GENERIC_RENDER_ERROR_MESSAGE = 'Scene data could not be rendered by the MAGE engine.'

type MageEngineBridge = Omit<MAGEEngineAPI, 'loadPreset'> & ViewerMouseEngine & {
  loadPreset: (scene: unknown) => unknown
}

type MageEngineModule = {
  initMAGE: (config: {
    autoStart?: boolean
    canvas: HTMLCanvasElement
    log?: boolean
    pixelRatio?: number
    renderBudget: RenderBudget
    withControls?: {
      active?: boolean
      integrated?: boolean
    }
  }) => MageEngineBridge
}

let mageEngineModulePromise: Promise<MageEngineModule> | null = null
let pageSuspended = false
let pageLifecycleGeneration = 0

// A route cleanup does not run reliably on document navigation. Also guard
// asynchronous player creation that resolves after the browser has left.
function onDocumentPageHide() {
  pageSuspended = true
  pageLifecycleGeneration += 1
}
function onDocumentPageShow() { pageSuspended = false }
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', onDocumentPageHide, { capture: true })
  window.addEventListener('pageshow', onDocumentPageShow, { capture: true })
  import.meta.hot?.dispose(() => {
    onDocumentPageHide()
    window.removeEventListener('pagehide', onDocumentPageHide, { capture: true })
    window.removeEventListener('pageshow', onDocumentPageShow, { capture: true })
  })
}

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
  // MAGE loads compact effects as patches. Materialize the policy's disabled
  // defaults only in this runtime payload, so sparse scenes cannot inherit
  // effects from the preceding scene and exceed the validated effect count.
  const fx = isRecord(sceneBlob.fx) ? sceneBlob.fx : {}
  const bloom = isRecord(fx.bloom) ? fx.bloom : {}
  const passes = isRecord(fx.passes) ? fx.passes : {}
  const loadedScene = engine.loadPreset({
    ...sceneBlob,
    fx: {
      ...fx,
      bloom: { enabled: SCENE_POLICY.defaults.optionalEffects, ...bloom },
      passes: {
        ...Object.fromEntries(SCENE_POLICY.optionalEffectFlags.map(flag => [flag, SCENE_POLICY.defaults.optionalEffects])),
        outputPass: SCENE_POLICY.defaults.outputPass,
        ...passes,
      },
    },
  })

  if (!loadedScene) {
    throw createSceneRenderError()
  }
}

function readSceneAudioSource(sceneBlob: MageSceneBlob) {
  const audioPath = sceneBlob.audioPath

  if (typeof audioPath === 'string' && audioPath.trim()) {
    return audioPath.trim()
  }

  return null
}

function clampAudioTime(engine: MageEngineBridge, time: number) {
  const normalizedTime = Number.isFinite(time) ? Math.max(time, 0) : 0
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

function applyPlaybackState(
  engine: MageEngineBridge,
  playbackState: MagePlayerPlaybackState,
) {
  if (playbackState === 'paused') {
    engine.pause()
    return playbackState
  }

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

/** Every user scene, including templates, crosses the isolated renderer boundary. */
export async function createMagePlayer(target: HTMLElement, options: MagePlayerOptions = {}): Promise<MagePlayerController> {
  if (options.signal?.aborted) throw playerStartupCancelled()
  if (pageSuspended) throw new MagePlayerAdapterError('Player creation was interrupted by page navigation.')
  if (options.platformArtwork === 'brand') {
    if (!(target instanceof HTMLCanvasElement) || options.sceneKey !== undefined
      || (options.initialSceneBlob !== undefined && options.initialSceneBlob !== BRAND_SCENE)) {
      throw new MagePlayerAdapterError('Only the built-in brand artwork may use the local renderer.')
    }
    return createBrandPlayer(target, options)
  }
  if (options.initialSceneBlob === undefined) throw new MagePlayerAdapterError('Supply a valid initial scene before creating a player.')
  validateSceneForPlayback(options.initialSceneBlob)
  return createIsolatedMageController(target, options)
}

async function createBrandPlayer(canvas: HTMLCanvasElement, options: MagePlayerOptions): Promise<MagePlayerController> {
  if (options.platformArtwork !== 'brand' || options.sceneKey !== undefined
    || (options.initialSceneBlob !== undefined && options.initialSceneBlob !== BRAND_SCENE)) {
    throw new MagePlayerAdapterError('Only the built-in brand artwork may use the local renderer.')
  }
  if (pageSuspended) throw new MagePlayerAdapterError('Player creation was interrupted by page navigation.')
  // All public surfaces supply their initial source before any graphics allocation.
  // Empty controllers can still be created, but every later load revalidates.
  if (options.initialSceneBlob !== undefined) validateSceneForPlayback(options.initialSceneBlob)
  if (options.platformArtwork === 'brand') validateSceneForPlayback(BRAND_SCENE)
  const creationGeneration = pageLifecycleGeneration
  const target = availabilityTarget(options.sceneKey, options.initialSceneBlob)
  const creationSceneKey = options.sceneKey
  const platformArtwork = options.platformArtwork === 'brand' && options.sceneKey === undefined
  let availabilityArmed = false
  let permissionRevoked = false
  let availabilitySuspended = false
  let availabilitySuspendedAt: number | null = null
  let availabilitySuspendedMs = 0
  let stopForAvailability = () => {}
  let updateAvailability = () => {
    const status = sceneAvailabilityStore.getSnapshot(target)
    if (!status.allowed && status.code !== 'CHECKING') permissionRevoked = true
  }
  const releaseAvailability = platformArtwork ? () => {} : sceneAvailabilityStore.subscribe(target, () => {
    if (availabilityArmed) updateAvailability()
  })
  function assertAvailability() {
    if (!platformArtwork && (permissionRevoked || !sceneAvailabilityStore.isAllowed(target))) {
      throw new MagePlayerAdapterError('Scene playback is unavailable. Check its current availability before trying again.')
    }
  }
  let engine: MageEngineBridge
  try {
    if (!platformArtwork && !(await sceneAvailabilityStore.check(target)).allowed) assertAvailability()
    availabilityArmed = true
    const { initMAGE } = await waitForPlayerStartup(loadMageEngineModule(), options.signal)
    if (options.signal?.aborted) throw playerStartupCancelled()
    assertAvailability()
    if (pageSuspended || creationGeneration !== pageLifecycleGeneration) {
      throw new MagePlayerAdapterError('Player creation was interrupted by page navigation.')
    }
    engine = initMAGE({
      canvas,
      autoStart: false,
      log: options.log ?? false,
      renderBudget: getRenderBudget(options.renderProfile),
      ...(options.pixelRatio === undefined ? {} : { pixelRatio: options.pixelRatio }),
      withControls: DEFAULT_ENGINE_CONTROLS,
    })
    try { engine.start() } catch (error) { engine.dispose(); throw error }
  } catch (error) {
    releaseAvailability()
    throw error
  }
  let mouseInteractions: ReturnType<typeof attachViewerMouseInteractions> | null = null
  try {
    if (options.mouseInteractions) {
      mouseInteractions = attachViewerMouseInteractions(canvas, engine, { wheelZoom: options.mouseWheelZoom ?? false })
    }
  } catch (error) {
    releaseAvailability()
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
  let sceneGeneration = 0
  let disposed = false
  let cleanlyDisposed = false
  let cleanupFailureRecorded = false
  let recoveryLease: ReturnType<typeof sceneRecovery.begin> = null
  let currentRecoveryKey: string | null = null
  let renderMonitor: ReturnType<typeof monitorSceneRendering> | null = null

  stopForAvailability = () => {
    if (currentRecoveryKey) sceneRecovery.revokeRetry(currentRecoveryKey)
    detachPageLifecycle()
    try { clearLeaseAfterDisposal() } catch { rememberFailedDisposal() }
  }

  updateAvailability = () => {
    if (disposed) return
    const status = sceneAvailabilityStore.getSnapshot(target)
    if (!status.allowed) {
      if (status.code !== 'CHECKING') {
        permissionRevoked = true
        stopForAvailability()
        return
      }
      if (availabilitySuspended) return
      availabilitySuspended = true
      availabilitySuspendedAt = Date.now()
      // Revalidation withdraws every in-flight capture, even if permission is
      // restored before it finishes. Keep decoded audio and the scene clock.
      sceneGeneration += 1
      pauseTrackedAudioTime()
      renderMonitor?.setPaused(true)
      try { engine.pause() } catch {
        permissionRevoked = true
        stopForAvailability()
      }
      return
    }
    if (!availabilitySuspended) return
    availabilitySuspended = false
    availabilitySuspendedMs += Math.max(0, Date.now() - (availabilitySuspendedAt ?? Date.now()))
    availabilitySuspendedAt = null
    if (!hasLoadedScene || playbackState === 'paused' || sceneRecovery.isSafeMode()
      || (currentRecoveryKey && sceneRecovery.getBlock(currentRecoveryKey))) return
    try {
      // start/play resume existing resources; never reload, reset, or seek.
      if (hasAttachedAudio) engine.play()
      else engine.start()
      renderMonitor?.setPaused(false)
      if (hasAttachedAudio) resumeTrackedAudioTime()
    } catch { failRendering('runtime') }
  }

  function detachPageLifecycle() {
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow, { capture: true })
  }

  function onAbort() {
    detachPageLifecycle()
    try { clearLeaseAfterDisposal() } catch { rememberFailedDisposal() }
  }

  function clearLeaseAfterDisposal() {
    disposeEngine()
    // A failed disposal keeps its marker even when dispose() is called again.
    if (cleanlyDisposed) {
      recoveryLease?.dispose()
      recoveryLease = null
    }
  }

  function onPageHide(event: PageTransitionEvent) {
    if (disposed) return
    try {
      clearLeaseAfterDisposal()
      detachPageLifecycle()
    } catch {
      // The unfinished marker must survive when GPU/resource cleanup fails.
      // A BFCache restoration keeps this same store alive; explicitly block
      // that revision before the host constructs its replacement renderer.
      window.removeEventListener('pagehide', onPageHide)
      if (!event.persisted) window.removeEventListener('pageshow', onPageShow, { capture: true })
    }
  }

  function onPageShow(event: PageTransitionEvent) {
    if (!event.persisted || !disposed || cleanlyDisposed) return
    detachPageLifecycle()
    rememberFailedDisposal()
  }

  function rememberFailedDisposal() {
    if (!currentRecoveryKey || cleanupFailureRecorded) return
    cleanupFailureRecorded = true
    const previousFailure = sceneRecovery.getAutomaticBlock(currentRecoveryKey)
    sceneRecovery.block(currentRecoveryKey, previousFailure?.reason ?? 'interrupted')
  }

  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow, { capture: true })
  options.signal?.addEventListener('abort', onAbort, { once: true })
  if (options.signal?.aborted) { onAbort(); throw playerStartupCancelled() }

  function disposeEngine() {
    if (disposed) return
    disposed = true
    options.signal?.removeEventListener('abort', onAbort)
    releaseAvailability()
    sceneGeneration += 1
    audioLoadGeneration += 1
    hasLoadedScene = false
    renderMonitor?.dispose()
    renderMonitor = null
    mouseInteractions?.dispose()
    engine.dispose()
    cleanlyDisposed = true
  }

  function failRendering(reason: RenderFailure | 'load' | 'stopped') {
    detachPageLifecycle()
    const failedLease = recoveryLease
    recoveryLease = null
    try {
      disposeEngine()
    } finally {
      // Known failures remain quarantined even if resource cleanup also fails.
      failedLease?.fail(reason)
    }
  }

  function assertUsable() {
    if (disposed || pageSuspended) throw new MagePlayerAdapterError('This preview has stopped. Retry to create a new player.')
  }

  function assertRenderingAllowed() {
    assertUsable()
    assertAvailability()
    if (sceneRecovery.isSafeMode() || (currentRecoveryKey && sceneRecovery.getBlock(currentRecoveryKey))) {
      throw new MagePlayerAdapterError('Automatic rendering is paused for this scene. Choose Retry to try it again.')
    }
  }

  function withoutAudioResponse(scene: MageSceneBlob) {
    const result = { ...scene }
    delete result.audioResponse
    delete result.audioResponseConfig
    return result
  }

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
    if (modeChanged) engine.setAudioResponseMode(response.effectiveMode)
    if (response.effectiveMode === 'mapped-v1' && (modeChanged || configKey !== appliedResponseConfig)) {
      engine.setAudioResponseConfig(response.effectiveConfig)
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
    return clampAudioTime(engine, engine.getAudioDuration())
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
    if (!engine.isAudioLoaded()) {
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
    const isLoaded = hasAttachedAudio && engine.isAudioLoaded()
    const duration = isLoaded ? getTrackedAudioDuration() : 0

    if (isLoaded) {
      syncTrackedAudioTime()
    } else {
      currentAudioTime = 0
      trackedAudioStartedAtMs = null
    }

    const volume = clampAudioVolume(engine.getAudioVolume())

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
    assertUsable()
    if (nextPlaybackState === 'playing') assertRenderingAllowed()
    playbackState = nextPlaybackState

    if (!hasLoadedScene || !currentSceneBlob) {
      return playbackState
    }

    if (nextPlaybackState === 'paused') {
      playbackState = applyPlaybackState(engine, nextPlaybackState)
    } else if (hasAttachedAudio) {
      playbackState = applyPlaybackState(engine, nextPlaybackState)
    } else {
      engine.start()
      playbackState = nextPlaybackState
    }
    renderMonitor?.setPaused(nextPlaybackState === 'paused')

    if (nextPlaybackState === 'paused') {
      pauseTrackedAudioTime()
    } else {
      resumeTrackedAudioTime()
    }

    return playbackState
  }

  return {
    async captureFramePreview(options = {}) {
      const captureGeneration = sceneGeneration
      assertRenderingAllowed()
      if (!hasLoadedScene || !currentSceneBlob) {
        throw new MagePlayerAdapterError(
          'Load a scene before capturing a thumbnail.',
        )
      }

      if (!platformArtwork) await sceneAvailabilityStore.check(target)
      assertRenderingAllowed()
      if (captureGeneration !== sceneGeneration) return null

      try {
        const dimensions = boundCaptureSize(options.width ?? canvas.width, options.height ?? canvas.height)
        const frame = await engine.captureFramePreview({ ...options, ...dimensions })
        assertRenderingAllowed()
        return captureGeneration === sceneGeneration ? frame : null
      } catch (error) {
        throw new MagePlayerAdapterError(
          'The live preview could not be captured.',
          { cause: error },
        )
      }
    },
    clearAudio() {
      audioLoadGeneration += 1
      if (!disposed) engine.unloadAudio()

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
      return structuredClone(engine.getAudioResponseCapabilities())
    },
    getAudioResponseDiagnostics() {
      return structuredClone(engine.getAudioResponseDiagnostics())
    },
    getAudioResponseEvents(afterId) {
      return structuredClone(engine.getAudioResponseEvents(afterId))
    },
    getEngineDiagnostics() {
      if (!hasLoadedScene) return null
      try {
        const state: unknown = engine.getEngineFields().state
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
      assertRenderingAllowed()
      if (!currentSceneBlob) throw new MagePlayerAdapterError('Load a scene before changing its audio response.')
      const nextScene = { ...currentSceneBlob }
      if (mode === undefined) delete nextScene.audioResponse
      else nextScene.audioResponse = mode
      if (config === undefined) delete nextScene.audioResponseConfig
      else nextScene.audioResponseConfig = config
      validateSceneForPlayback({ schemaVersion: 1, kind: 'custom', scene: nextScene })
      currentSceneBlob = nextScene
      readSavedAudioResponse(nextScene)
      applyAudioResponse()
      return getAudioResponseState()
    },
    setAudioResponseOverride(config) {
      assertRenderingAllowed()
      if (!currentSceneBlob) throw new MagePlayerAdapterError('Load a scene before changing its audio response.')
      responseOverride = config === null ? null : normalizeAudioResponseConfig(config).config
      applyAudioResponse()
      return getAudioResponseState()
    },
    getPlaybackState() {
      return playbackState
    },
    async loadAudio(options = {}) {
      assertRenderingAllowed()
      if (!hasLoadedScene || !currentSceneBlob) {
        throw createAudioError('Load a scene before loading audio.')
      }
      if (playbackState === 'playing') assertRenderingAllowed()

      const savedAudioSource = readSceneAudioSource(currentSceneBlob)
      const audioSource = options.sourcePath ?? savedAudioSource
      const audioLabel = options.sourceLabel ?? audioSource ?? null

      if (!audioSource) {
        throw createAudioError('Choose an audio file or save an audioPath on the scene.')
      }

      const loadGeneration = ++audioLoadGeneration
      function assertCurrentAudioLoad() {
        if (loadGeneration !== audioLoadGeneration) {
          throw createAudioError('Audio loading was superseded by a newer player action.')
        }
        assertUsable()
        if (!availabilitySuspended) assertRenderingAllowed()
      }

      engine.unloadAudio()

      try {
        hasAttachedAudio = false
        currentAudioLabel = audioLabel
        engine.loadAudio(audioSource)
      } catch (error) {
        throw createAudioError('Audio could not be loaded from the configured source.', error)
      }

      await new Promise<void>((resolve, reject) => {
        const startedAt = Date.now()
        const earlierSuspensionMs = availabilitySuspendedMs

        function poll() {
          try {
            assertCurrentAudioLoad()
          } catch (error) {
            reject(error)
            return
          }
          // Decoding only fills a buffer. It must not finish into seek/play
          // while permission is pending, nor time out during a file dialog.
          if (availabilitySuspended) {
            window.setTimeout(poll, 50)
            return
          }
          if (engine.isAudioLoaded()) {
            resolve()
            return
          }

          // Count active wait time, even when hidden-tab timers were throttled.
          if (Date.now() - startedAt - (availabilitySuspendedMs - earlierSuspensionMs) >= 5000) {
            reject(createAudioError('Audio could not be loaded from the configured source.'))
            return
          }

          window.setTimeout(poll, 50)
        }

        poll()
      })
      assertCurrentAudioLoad()
      assertRenderingAllowed()

      const audioTime = clampAudioTime(engine, engine.getEngineTime())

      engine.seek(audioTime)

      hasAttachedAudio = true
      setTrackedAudioTime(audioTime)

      currentAudioVolume = clampAudioVolume(engine.setAudioVolume(currentAudioVolume))

      if (playbackState === 'paused') {
        pauseTrackedAudioTime()
        engine.pause()
      } else {
        resumeTrackedAudioTime()
        engine.play()
      }

      return getAudioState()
    },
    loadSceneBlob(submittedScene, loadOptions = {}) {
      assertUsable()
      assertAvailability()
      const options = { sceneKey: creationSceneKey, ...loadOptions }
      if (availabilityTarget(options.sceneKey, submittedScene) !== target
        || (platformArtwork && (submittedScene !== BRAND_SCENE || options.sceneKey !== undefined))) {
        throw new MagePlayerAdapterError('Create a separate player to load this scene.')
      }
      const recoverySource = Object.hasOwn(options, 'recoverySceneBlob') ? options.recoverySceneBlob : submittedScene
      const key = sceneRecoveryKey(recoverySource, options.sceneKey)
      let sceneBlob: MageSceneBlob
      try {
        // Validate template documents before touching the current engine/audio.
        // Only the resolver can supply executable source for a template.
        const validated = validateSceneForPlayback(platformArtwork ? BRAND_SCENE : submittedScene)
        sceneBlob = resolveSceneForPlayback(validated).engineScene
        validateSceneForPlayback({ schemaVersion: 1, kind: 'custom', scene: sceneBlob })
      } catch (error) {
        if (key) sceneRecovery.block(key, 'load')
        throw createSceneRenderError(error)
      }
      if (!isMageSceneBlob(sceneBlob)) {
        if (key) sceneRecovery.block(key, 'load')
        throw new MagePlayerAdapterError('Scene data is missing required MAGE fields.')
      }
      if (!key) throw new MagePlayerAdapterError('Scene data cannot be safely identified for playback.')
      // The shared guard is authoritative even for callers without recovery UI.
      // begin() consumes a deliberate retry grant once and never bypasses the
      // validation above. The marker is written before executing any source.
      const nextLease = sceneRecovery.begin(key)
      if (!nextLease) throw new MagePlayerAdapterError('Automatic rendering is paused for this scene. Choose Retry to try it again.')
      audioLoadGeneration += 1
      sceneGeneration += 1

      try {
        if (recoveryLease) {
          // pause() synchronously cancels MAGE's frame loop. Only then is the
          // previous scene's active marker safe to remove during replacement.
          engine.pause()
          renderMonitor?.dispose()
          renderMonitor = null
          recoveryLease.dispose()
        }
        recoveryLease = nextLease
        currentRecoveryKey = key
        renderMonitor = monitorSceneRendering({
          canvas,
          subscribe: engine.subscribeRenderLifecycle.bind(engine),
          onFailure: failRendering,
        })
        assertUsable()
        renderMonitor.setPaused(playbackState === 'paused')
        engine.unloadAudio()

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
        // The render lifecycle may synchronously fail on the first frame.
        assertUsable()
      } catch (error) {
        currentSceneBlob = null
        savedMode = 'legacy'
        savedConfig = null
        responseOverride = null
        hasAttachedAudio = false
        currentAudioLabel = null
        hasLoadedScene = false
        if (!disposed) {
          if (recoveryLease !== nextLease) nextLease.fail('load')
          failRendering('load')
        }

        if (error instanceof MagePlayerAdapterError) {
          throw error
        }

        throw createSceneRenderError(error)
      }
    },
    updateRecoveryIdentity(submittedScene, loadOptions = {}) {
      assertUsable()
      assertAvailability()
      const options = { sceneKey: creationSceneKey, ...loadOptions }
      if (availabilityTarget(options.sceneKey, submittedScene) !== target || platformArtwork) throw new MagePlayerAdapterError('Create a separate player to load this scene.')
      const nextScene = resolveSceneForPlayback(validateSceneForPlayback(submittedScene)).engineScene
      const recoverySource = Object.hasOwn(options, 'recoverySceneBlob') ? options.recoverySceneBlob : submittedScene
      const nextKey = sceneRecoveryKey(recoverySource, options.sceneKey)
      if (!currentSceneBlob || !recoveryLease || !nextKey) throw new MagePlayerAdapterError('Load a valid scene before updating its recovery identity.')
      if (sceneRecoveryKey(withoutAudioResponse(nextScene)) !== sceneRecoveryKey(withoutAudioResponse(currentSceneBlob))) {
        throw new MagePlayerAdapterError('Changed scene content requires a complete scene load.')
      }
      if (nextKey === currentRecoveryKey) return
      const nextLease = sceneRecovery.begin(nextKey)
      if (!nextLease) {
        disposeEngine()
        recoveryLease.dispose()
        recoveryLease = null
        throw new MagePlayerAdapterError('Automatic rendering is paused for this scene. Choose Retry to try it again.')
      }
      // Only response settings changed, and the caller has applied them in
      // this same task. Transfer ownership without restarting the music.
      const previousLease = recoveryLease
      recoveryLease = nextLease
      currentRecoveryKey = nextKey
      previousLease.dispose()
    },
    resetPlayback() {
      assertUsable()
      if (!hasLoadedScene || !currentSceneBlob) {
        throw new MagePlayerAdapterError('Load a scene before resetting playback.')
      }
      assertRenderingAllowed()

      playbackState = 'paused'
      currentAudioTime = 0
      trackedAudioStartedAtMs = null
      // Reset recompiles the currently guarded scene. Keep its active marker
      // until disposal and quarantine a reset-time compile failure too.
      try {
        loadInteractiveSceneBlob(currentSceneBlob)
      } catch (error) {
        failRendering('load')
        throw createSceneRenderError(error)
      }
      engine.seek(0)

      engine.start()
      engine.pause()
      renderMonitor?.setPaused(true)
      return playbackState
    },
    seekAudio(time) {
      assertRenderingAllowed()
      if (!hasLoadedScene || !currentSceneBlob) {
        throw new MagePlayerAdapterError('Load a scene before seeking audio.')
      }

      const nextTime = clampAudioTime(engine, time)

      engine.seek(nextTime)

      setTrackedAudioTime(nextTime)

      if (playbackState === 'playing') {
        resumeTrackedAudioTime()
      } else {
        trackedAudioStartedAtMs = null
      }

      return getAudioState()
    },
    setAudioVolume(volume) {
      assertRenderingAllowed()
      currentAudioVolume = clampAudioVolume(volume)

      currentAudioVolume = clampAudioVolume(engine.setAudioVolume(currentAudioVolume))

      return getAudioState()
    },
    setSyntheticPreview(enabled, seed, tempoScale) {
      assertRenderingAllowed()
      if (tempoScale === undefined) {
        engine.setSyntheticPreview(enabled, seed)
      } else {
        engine.setSyntheticPreview(enabled, seed, tempoScale)
      }
    },
    setPlaybackState,
    stopRendering() {
      if (!disposed) failRendering('stopped')
    },
    dispose() {
      detachPageLifecycle()
      try {
        clearLeaseAfterDisposal()
      } catch (error) {
        rememberFailedDisposal()
        throw error
      }
      // A prior pagehide attempt may already have failed. Public cleanup can
      // now detach its restore listener only after recording that failure.
      if (disposed && !cleanlyDisposed) rememberFailedDisposal()
    },
  }
}

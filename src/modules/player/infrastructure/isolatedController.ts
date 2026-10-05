import { normalizeAudioResponseConfig, normalizeAudioResponseMode, type AudioResponseConfig, type SceneAudioResponseMode } from '@shared/lib'
import { sceneAvailabilityStore, type SceneAvailabilityTarget } from '../availability/sceneAvailability'
import { availabilityTarget } from '../availability/availabilityTarget'
import { createIsolatedPlayer, type IsolatedPlayer } from '../isolation/isolatedPlayer'
import { getIsolatedRendererUrl } from '../isolation/rendererConfig'
import { boundCaptureSize } from '../policy/renderBudget'
import { validateSceneForPlayback } from '../policy/sceneValidation'
import { sceneRecovery, sceneRecoveryKey, type RecoveryLease, type RecoveryReason } from '../recovery/sceneRecovery'
import { resolveSceneForPlayback } from '../templates/resolveScene'
import { MagePlayerAdapterError, type MageAudioResponseState, type MagePlayerAudioState, type MagePlayerController, type MagePlayerOptions, type MagePlayerPlaybackState, type MageSceneBlob } from './playerController'
import { playerStartupCancelled, waitForPlayerStartup } from './playerStartup'

const changed = () => new MagePlayerAdapterError('The scene changed before playback was ready.')
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const volume = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1

function responseSource(scene: MageSceneBlob) {
  return resolveSceneForPlayback(scene).engineScene
}

function withoutResponse(scene: MageSceneBlob) {
  const copy = { ...responseSource(scene) }
  delete copy.audioResponse
  delete copy.audioResponseConfig
  return copy
}

function changedResponse(scene: MageSceneBlob, mode: SceneAudioResponseMode | undefined, config: unknown) {
  const copy = structuredClone(scene)
  const source = copy.kind === 'template' ? copy.settings : copy.scene
  if (!record(source)) throw new MagePlayerAdapterError('The scene response settings are unavailable.')
  if (mode === undefined) delete source.audioResponse
  else source.audioResponse = mode
  if (config === undefined) delete source.audioResponseConfig
  else source.audioResponseConfig = config
  return validateSceneForPlayback(copy) as unknown as MageSceneBlob
}

function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new MagePlayerAdapterError('The preview image could not be read.'))
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new MagePlayerAdapterError('The preview image could not be read.'))
    reader.readAsDataURL(blob)
  })
}

/** Availability and recovery stay in the parent; submitted source never reaches its engine. */
export async function createIsolatedMageController(container: HTMLElement, options: MagePlayerOptions): Promise<MagePlayerController> {
  if (options.signal?.aborted) throw playerStartupCancelled()
  if (options.initialSceneBlob === undefined) throw new MagePlayerAdapterError('Supply a valid initial scene before creating a player.')
  const initial = validateSceneForPlayback(options.initialSceneBlob)
  let target: SceneAvailabilityTarget = availabilityTarget(options.sceneKey, initial)
  let sceneKey = options.sceneKey
  let disposed = false, cleanlyDisposed = false, suspended = false, denied = false
  let viewSuspended = false
  let sceneGeneration = 0, captureGeneration = 0, audioGeneration = 0
  let transportGeneration = 0
  let lastSceneStartedAt = -Infinity
  let queuedScene: { timer: ReturnType<typeof setTimeout>; reject(error: Error): void } | null = null
  let currentScene: MageSceneBlob | null = null
  let currentRecoveryKey: string | null = null
  let lease: RecoveryLease | null = null
  const retiringLeases = new Set<RecoveryLease>()
  const permissionWaiters = new Map<'scene' | 'audio', { resolve(): void; reject(error: Error): void }>()
  let bridge: IsolatedPlayer | null = null
  let releaseAvailability = () => {}
  let releaseRecovery = () => {}
  let playback: MagePlayerPlaybackState = 'playing'
  let loaded = false
  let capturing = false
  let audioLabel: string | null = null
  let savedMode: SceneAudioResponseMode = 'legacy'
  let savedConfig: AudioResponseConfig | null = null
  let override: AudioResponseConfig | null = null

  function releaseRetired() {
    for (const retired of retiringLeases) retired.dispose()
    retiringLeases.clear()
  }

  function cancelQueuedScene() {
    if (!queuedScene) return
    clearTimeout(queuedScene.timer)
    queuedScene.reject(changed())
    queuedScene = null
  }

  function waitForSceneSlot() {
    const wait = Math.max(0, 350 - (performance.now() - lastSceneStartedAt))
    if (wait === 0) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      queuedScene = { reject, timer: setTimeout(() => { queuedScene = null; resolve() }, wait) }
    })
  }

  function disposeResources() {
    if (disposed) return
    disposed = true
    loaded = false
    sceneGeneration++
    captureGeneration++
    audioGeneration++
    transportGeneration++
    cancelQueuedScene()
    for (const pending of permissionWaiters.values()) pending.reject(new MagePlayerAdapterError('This preview has stopped.'))
    permissionWaiters.clear()
    releaseAvailability()
    releaseRecovery()
    options.signal?.removeEventListener('abort', onAbort)
    window.removeEventListener('pagehide', onPageHide)
    bridge?.dispose()
    cleanlyDisposed = true
  }

  function dispose() {
    try { disposeResources() } finally {
      if (cleanlyDisposed) { lease?.dispose(); lease = null; releaseRetired() }
      else if (currentRecoveryKey) sceneRecovery.block(currentRecoveryKey, sceneRecovery.getAutomaticBlock(currentRecoveryKey)?.reason ?? 'interrupted')
    }
  }

  function fail(reason: RecoveryReason) {
    if (disposed) return
    const failed = lease
    lease = null
    try { disposeResources() } finally {
      failed?.fail(reason)
      if (cleanlyDisposed) releaseRetired()
      else if (currentRecoveryKey) sceneRecovery.block(currentRecoveryKey, reason)
    }
  }

  function onPageHide() { dispose() }
  function onAbort() {
    try { dispose() } catch { /* The existing cleanup marker records failed disposal. */ }
  }

  function assertUsable() {
    if (disposed) throw new MagePlayerAdapterError('This preview has stopped. Retry to create a new player.')
  }

  function assertAllowed() {
    assertUsable()
    if (denied || suspended || !sceneAvailabilityStore.isAllowed(target)) throw new MagePlayerAdapterError('Scene playback is unavailable. Check its current availability before trying again.')
    if (sceneRecovery.isSafeMode() || (currentRecoveryKey && sceneRecovery.getBlock(currentRecoveryKey))) {
      throw new MagePlayerAdapterError('Automatic rendering is paused for this scene. Choose Retry to try it again.')
    }
  }

  function resume() {
    if (!bridge || !loaded || suspended || viewSuspended) return
    bridge.setRenderingSuspended(false)
    if (playback !== 'playing') return
    const generation = ++transportGeneration
    void bridge.play().catch(error => {
      if (disposed || generation !== transportGeneration) return
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        playback = 'paused'
        bridge?.pause()
      } else fail('runtime')
    })
  }

  function pause() {
    transportGeneration++
    bridge?.pause()
  }

  function suspendRendering() {
    transportGeneration++
    bridge?.setRenderingSuspended(true)
  }

  async function waitForPermission(kind: 'scene' | 'audio') {
    assertUsable()
    const status = sceneAvailabilityStore.getSnapshot(target)
    if (!status.allowed && status.code === 'CHECKING') {
      // At most one scene completion and one audio completion may wait. Hidden
      // tabs retain decoded audio; the availability store bounds visible checks.
      permissionWaiters.get(kind)?.reject(changed())
      await new Promise<void>((resolve, reject) => permissionWaiters.set(kind, { resolve, reject }))
    }
    assertAllowed()
  }

  function updateAvailability() {
    if (disposed) return
    const status = sceneAvailabilityStore.getSnapshot(target)
    if (!status.allowed) {
      captureGeneration++
      if (status.code !== 'CHECKING') {
        denied = true
        if (currentRecoveryKey) sceneRecovery.revokeRetry(currentRecoveryKey)
        dispose()
      } else if (!suspended) {
        suspended = true
        try { suspendRendering() } catch { fail('runtime') }
      }
      return
    }
    for (const pending of permissionWaiters.values()) pending.resolve()
    permissionWaiters.clear()
    if (!suspended) return
    suspended = false
    if (sceneRecovery.isSafeMode() || (currentRecoveryKey && sceneRecovery.getBlock(currentRecoveryKey))) return
    resume()
  }

  function watch(next: SceneAvailabilityTarget) {
    releaseAvailability()
    target = next
    releaseAvailability = sceneAvailabilityStore.subscribe(target, updateAvailability)
  }

  options.signal?.addEventListener('abort', onAbort, { once: true })
  window.addEventListener('pagehide', onPageHide)
  watch(target)
  releaseRecovery = sceneRecovery.subscribe(() => {
    if (!disposed && (sceneRecovery.isSafeMode() || (currentRecoveryKey && sceneRecovery.getBlock(currentRecoveryKey)))) dispose()
  })
  try {
    if (options.signal?.aborted) throw playerStartupCancelled()
    await waitForPlayerStartup(sceneAvailabilityStore.check(target), options.signal)
    updateAvailability()
    assertAllowed()
    bridge = createIsolatedPlayer({
      container, rendererUrl: getIsolatedRendererUrl(), profile: options.renderProfile,
      wheelZoom: options.mouseWheelZoom === true,
      pointerInteractions: options.mouseInteractions === true,
      onFailure: fail,
      onHealthy() {
        if (disposed || !loaded || suspended || viewSuspended || denied || playback !== 'playing') return
        if (!sceneAvailabilityStore.isAllowed(target) || sceneRecovery.isSafeMode()) return
        // Only this active retry can retire its original warning. The lease
        // keeps its unfinished-render marker and rejects a newer failure.
        lease?.confirmHealthy()
      },
      onStatus: status => { if (status === 'disposed' && !disposed) dispose() },
    })
    // A synchronous observer may cancel while the bridge constructor is running.
    if (disposed || options.signal?.aborted) {
      bridge.dispose()
      if (options.signal?.aborted) throw playerStartupCancelled()
    }
    await waitForPlayerStartup(bridge.ready, options.signal)
    assertAllowed()
  } catch (error) {
    dispose()
    throw options.signal?.aborted ? playerStartupCancelled() : error
  }

  function getAudioState(): MagePlayerAudioState {
    const state = bridge!.getAudioState()
    return { currentTime: state.time, duration: state.duration, isLoaded: state.loaded, hasSource: audioLabel !== null,
      sourcePath: audioLabel, volume: state.volume }
  }

  function getAudioResponseState(): MageAudioResponseState {
    const mode = override ? 'mapped-v1' : savedMode
    return { savedMode, savedConfig: savedConfig ? normalizeAudioResponseConfig(savedConfig).config : null,
      override: override ? normalizeAudioResponseConfig(override).config : null, effectiveMode: mode,
      effectiveConfig: mode === 'mapped-v1' ? normalizeAudioResponseConfig(override ?? savedConfig).config : null }
  }

  function readResponse(scene: MageSceneBlob) {
    const source = responseSource(scene)
    savedMode = normalizeAudioResponseMode(source.audioResponse)
    savedConfig = Object.hasOwn(source, 'audioResponseConfig') ? normalizeAudioResponseConfig(source.audioResponseConfig).config : null
  }

  function applyResponse() {
    const response = getAudioResponseState()
    bridge!.setAudioResponse(response.effectiveMode, response.effectiveConfig ?? undefined)
  }

  return {
    async loadSceneBlob(submitted, loadOptions = {}) {
      assertUsable()
      const next = validateSceneForPlayback(submitted) as unknown as MageSceneBlob
      const nextSceneKey = Object.hasOwn(loadOptions, 'sceneKey') ? loadOptions.sceneKey : sceneKey
      const nextTarget = availabilityTarget(nextSceneKey, next)
      const recoverySource = Object.hasOwn(loadOptions, 'recoverySceneBlob') ? loadOptions.recoverySceneBlob : submitted
      const key = sceneRecoveryKey(recoverySource, nextSceneKey)
      if (!key) throw new MagePlayerAdapterError('Scene data cannot be safely identified for playback.')
      const generation = ++sceneGeneration
      cancelQueuedScene()
      permissionWaiters.get('scene')?.reject(changed())
      permissionWaiters.delete('scene')
      captureGeneration++
      loaded = false
      suspendRendering()
      if (nextTarget !== target) { suspended = true; watch(nextTarget) }
      await sceneAvailabilityStore.check(nextTarget)
      assertUsable()
      if (generation !== sceneGeneration || target !== nextTarget) throw changed()
      updateAvailability()
      suspended = false
      assertAllowed()
      // Slider drags and rapid draft changes keep only their latest source.
      // The protocol's four-load limit remains a hard boundary, not UI pacing.
      await waitForSceneSlot()
      assertUsable()
      if (generation !== sceneGeneration) throw changed()
      await waitForPermission('scene')
      if (generation !== sceneGeneration) throw changed()
      const nextLease = sceneRecovery.begin(key)
      if (!nextLease) throw new MagePlayerAdapterError('Automatic rendering is paused for this scene. Choose Retry to try it again.')
      if (lease) retiringLeases.add(lease)
      lease = nextLease
      currentRecoveryKey = key
      sceneKey = nextSceneKey
      currentScene = next
      readResponse(next)
      override = null
      try {
        lastSceneStartedAt = performance.now()
        await bridge!.loadScene(next, options.renderProfile)
        assertUsable()
        if (generation !== sceneGeneration) throw changed()
        await waitForPermission('scene')
        if (generation !== sceneGeneration) throw changed()
        loaded = true
        releaseRetired()
        resume()
      } catch (error) {
        if (!disposed && generation === sceneGeneration) fail('load')
        throw error
      }
    },
    updateRecoveryIdentity(submitted, loadOptions = {}) {
      assertAllowed()
      if (!currentScene || !lease || !loaded) throw new MagePlayerAdapterError('Load a scene before updating its recovery identity.')
      const next = validateSceneForPlayback(submitted) as unknown as MageSceneBlob
      const nextKey = Object.hasOwn(loadOptions, 'sceneKey') ? loadOptions.sceneKey : sceneKey
      if (availabilityTarget(nextKey, next) !== target || sceneRecoveryKey(withoutResponse(next)) !== sceneRecoveryKey(withoutResponse(currentScene))) {
        throw new MagePlayerAdapterError('Changed scene content requires a complete scene load.')
      }
      const key = sceneRecoveryKey(Object.hasOwn(loadOptions, 'recoverySceneBlob') ? loadOptions.recoverySceneBlob : submitted, nextKey)
      if (!key) throw new MagePlayerAdapterError('Scene data cannot be safely identified for playback.')
      if (key === currentRecoveryKey) return
      const nextLease = sceneRecovery.begin(key)
      if (!nextLease) { dispose(); throw new MagePlayerAdapterError('Automatic rendering is paused for this scene. Choose Retry to try it again.') }
      lease.dispose()
      lease = nextLease
      currentRecoveryKey = key
      currentScene = next
      sceneKey = nextKey
    },
    getAudioState,
    getPlaybackState: () => playback,
    getStoppedRecoveryKey: () => disposed ? currentRecoveryKey : null,
    getAudioResponseState,
    getAudioResponseCapabilities: () => loaded ? bridge!.getAudioResponseCapabilities() : null,
    getAudioResponseDiagnostics: () => null,
    getAudioResponseEvents: () => [],
    getEngineDiagnostics: () => null,
    setAudioResponseSettings(mode, config) {
      assertAllowed()
      if (!currentScene || !loaded) throw new MagePlayerAdapterError('Load a scene before changing its audio response.')
      currentScene = changedResponse(currentScene, mode, config)
      readResponse(currentScene)
      applyResponse()
      return getAudioResponseState()
    },
    setAudioResponseOverride(config) {
      assertAllowed()
      if (!loaded) throw new MagePlayerAdapterError('Load a scene before changing its audio response.')
      override = config === null ? null : normalizeAudioResponseConfig(config).config
      applyResponse()
      return getAudioResponseState()
    },
    async loadAudio(audioOptions = {}) {
      assertAllowed()
      if (!loaded || !currentScene) throw new MagePlayerAdapterError('Load a scene before loading audio.')
      const source = responseSource(currentScene)
      const saved = typeof source.audioPath === 'string' ? source.audioPath : typeof source.audio === 'string' ? source.audio
        : record(source.audio) ? source.audio.path ?? source.audio.url : undefined
      const path = audioOptions.sourcePath ?? saved
      if (typeof path !== 'string' || !path) throw new MagePlayerAdapterError('Choose an audio file before loading audio.')
      const generation = ++audioGeneration
      permissionWaiters.get('audio')?.reject(new MagePlayerAdapterError('Audio changed.'))
      permissionWaiters.delete('audio')
      const requestedScene = sceneGeneration
      await sceneAvailabilityStore.check(target)
      updateAvailability()
      if (generation !== audioGeneration || (audioOptions.sourcePath === undefined && requestedScene !== sceneGeneration)) throw new MagePlayerAdapterError('Audio changed.')
      await waitForPermission('audio')
      if (generation !== audioGeneration || (audioOptions.sourcePath === undefined && requestedScene !== sceneGeneration)) throw new MagePlayerAdapterError('Audio changed.')
      audioLabel = null
      await bridge!.loadAudio(path)
      if (generation !== audioGeneration || (audioOptions.sourcePath === undefined && requestedScene !== sceneGeneration)) throw new MagePlayerAdapterError('Audio changed.')
      await waitForPermission('audio')
      if (generation !== audioGeneration || (audioOptions.sourcePath === undefined && requestedScene !== sceneGeneration)) throw new MagePlayerAdapterError('Audio changed.')
      audioLabel = audioOptions.sourceLabel ?? path
      return getAudioState()
    },
    clearAudio() {
      audioGeneration++
      permissionWaiters.get('audio')?.reject(new MagePlayerAdapterError('Audio changed.'))
      permissionWaiters.delete('audio')
      audioLabel = null
      if (!disposed) bridge!.clearAudio()
      return getAudioState()
    },
    setAudioVolume(value) { assertAllowed(); bridge!.setVolume(volume(value)); return getAudioState() },
    seekAudio(time) { assertAllowed(); bridge!.seek(Number.isFinite(time) ? Math.max(0, time) : 0); return getAudioState() },
    setPlaybackState(next) {
      assertUsable()
      if (next === 'playing') assertAllowed()
      playback = next
      if (next === 'paused') pause()
      else resume()
      return playback
    },
    setRenderingSuspended(next) {
      assertUsable()
      if (viewSuspended === next) return
      viewSuspended = next
      if (next) { captureGeneration++; suspendRendering() }
      else resume()
    },
    resetPlayback() {
      assertAllowed()
      if (!loaded) throw new MagePlayerAdapterError('Load a scene before resetting playback.')
      captureGeneration++
      transportGeneration++
      playback = 'paused'
      override = null
      applyResponse()
      bridge!.reset()
      return playback
    },
    setSyntheticPreview(enabled, seed, tempoScale) { assertAllowed(); bridge!.setSynthetic(enabled, seed, tempoScale) },
    async captureFramePreview(capture = {}) {
      assertAllowed()
      if (viewSuspended) return null
      if (!loaded) throw new MagePlayerAdapterError('Load a scene before capturing a thumbnail.')
      if (capturing) throw new MagePlayerAdapterError('A preview capture is already in progress.')
      capturing = true
      try {
        const requestedScene = sceneGeneration
        await sceneAvailabilityStore.check(target)
        updateAvailability()
        assertAllowed()
        if (viewSuspended) return null
        if (requestedScene !== sceneGeneration) return null
        const generation = captureGeneration
        const bounds = container.getBoundingClientRect()
        const size = boundCaptureSize(capture.width ?? (bounds.width || 640), capture.height ?? (bounds.height || 360))
        const type = capture.type ?? 'image/png'
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) throw new MagePlayerAdapterError('The preview image type is unavailable.')
        const image = await bridge!.capture({ ...size, type: type as 'image/png' | 'image/jpeg' | 'image/webp', quality: capture.quality ?? 0.92 })
        assertAllowed()
        if (viewSuspended || generation !== captureGeneration) return null
        const data = await blobDataUrl(image)
        assertAllowed()
        return !viewSuspended && generation === captureGeneration ? data : null
      } finally { capturing = false }
    },
    stopRendering: () => fail('stopped'),
    dispose,
  }
}

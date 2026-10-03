import { resolveSceneForPlayback } from '../templates/resolveScene'
import { AUDIO_RESPONSE_SIGNALS, AUDIO_RESPONSE_TARGETS, normalizeAudioResponseConfig, normalizeAudioResponseMode,
  type AudioResponseMode, type AudioResponseConfig, type AudioResponseTarget } from '@notrac/mage/audio-response'
import type { RenderProfile } from '../policy/renderBudget'
import type { RenderFailure } from '../recovery/renderRecoveryMonitor'
import { createParentAudioSession, type ParentAudioSession } from './parentAudio'
import { createIsolatedPlaybackHost, type IsolatedPlaybackHost, type PlaybackHostStatus } from './playbackHost'
import { BRIDGE_LIMITS, isAudioResponseSettings, sceneForBridge, type CaptureRequest, type PlaybackPayloads } from './playbackProtocol'

export type IsolatedPlayerOptions = {
  container: HTMLElement
  rendererUrl: string
  profile?: RenderProfile
  wheelZoom?: boolean
  pointerInteractions?: boolean
  useInlineFrameStyles?: boolean
  onStatus?: (status: PlaybackHostStatus) => void
  onFailure?: (reason: RenderFailure) => void
  onHealthy?: () => void
}

export type IsolatedPlayerDependencies = {
  createAudio?: () => ParentAudioSession
  createHost?: typeof createIsolatedPlaybackHost
  now?: () => number
}

/** Parent transport and input ownership; normal app routing is handled separately. */
export function createIsolatedPlayer(options: IsolatedPlayerOptions, dependencies: IsolatedPlayerDependencies = {}) {
  const audio = (dependencies.createAudio ?? createParentAudioSession)()
  const now = dependencies.now ?? (() => performance.now())
  const previousUserSelect = options.container.style.userSelect
  if (options.pointerInteractions !== false) options.container.style.userSelect = 'none'
  let disposed = false, failed = false, available = false, sceneLoaded = false
  let playing = true, elapsed = 0, previousTick = now()
  let sceneGeneration = 0, audioGeneration = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let observer: ResizeObserver | null = null
  let host: IsolatedPlaybackHost | null = null
  let activePointer: number | null = null
  let zoom = 1
  let pointer: PlaybackPayloads['input']['pointer'] = { x: 0, y: 0, down: false, inside: false }
  let synthetic: PlaybackPayloads['synthetic'] = { enabled: false, seed: 1, tempoScale: 1 }
  let response: PlaybackPayloads['audio-response'] = { mode: 'legacy', config: null }
  let supportedTargets: AudioResponseTarget[] | null = null

  function assertActive() {
    if (disposed || failed) throw new Error('This isolated player has stopped.')
  }

  function releasePointer() {
    const previous = activePointer
    activePointer = null
    pointer = { ...pointer, down: false }
    if (previous !== null) {
      try { options.container.releasePointerCapture(previous) } catch { /* Capture may already have ended. */ }
    }
  }

  function pointerPosition(event: PointerEvent) {
    const rect = options.container.getBoundingClientRect()
    return {
      x: Math.max(-1, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1)),
      y: Math.max(-1, Math.min(1, 1 - (event.clientY - rect.top) / Math.max(1, rect.height) * 2)),
    }
  }

  function leavePointer() {
    releasePointer()
    pointer = { ...pointer, inside: false }
  }

  function onPointerDown(event: PointerEvent) {
    if (disposed || failed || event.button !== 0 || event.isPrimary === false || activePointer !== null) return
    event.preventDefault()
    activePointer = event.pointerId
    pointer = { ...pointerPosition(event), down: true, inside: true }
    try { options.container.setPointerCapture(event.pointerId) } catch { /* Window pointerup still releases the hold. */ }
  }

  function onPointerMove(event: PointerEvent) {
    if (disposed || failed || (activePointer !== null && event.pointerId !== activePointer)) return
    pointer = { ...pointer, ...pointerPosition(event), inside: true }
  }

  function onWheel(event: WheelEvent) {
    if (!options.wheelZoom || disposed || failed || !sceneLoaded || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? options.container.getBoundingClientRect().height : 1
    const delta = Math.max(-200, Math.min(200, event.deltaY * unit))
    if (!Number.isFinite(delta)) return
    zoom = Math.max(0.4, Math.min(2.5, zoom * Math.exp(delta * 0.001)))
    host?.setZoom(zoom)
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId === activePointer) releasePointer()
  }

  function onVisibilityChange() {
    previousTick = now()
    if (document.visibilityState === 'hidden') leavePointer()
  }

  function resize() {
    if (disposed || failed || !host) return
    const rect = options.container.getBoundingClientRect()
    const dimension = (value: number) => Math.max(1, Math.min(8192, Math.round(Number.isFinite(value) ? value : 1)))
    const ratio = Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1
    host.resize(dimension(rect.width), dimension(rect.height), Math.max(0.25, Math.min(1.5, ratio)))
  }

  function stopSampling() {
    if (timer !== null) clearInterval(timer)
    timer = null
  }

  function removeInputs() {
    if (options.pointerInteractions !== false && options.container.style.userSelect === 'none') options.container.style.userSelect = previousUserSelect
    observer?.disconnect()
    observer = null
    options.container.removeEventListener('pointerdown', onPointerDown)
    options.container.removeEventListener('pointerenter', onPointerMove)
    options.container.removeEventListener('pointermove', onPointerMove)
    options.container.removeEventListener('pointerleave', leavePointer)
    options.container.removeEventListener('lostpointercapture', releasePointer)
    options.container.removeEventListener('wheel', onWheel)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    window.removeEventListener('blur', leavePointer)
    window.removeEventListener('resize', resize)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    releasePointer()
  }

  function fail(reason: RenderFailure) {
    if (disposed || failed) return
    failed = true
    playing = false
    audioGeneration++
    stopSampling()
    removeInputs()
    audio.pause()
    try { options.onFailure?.(reason) } catch { /* Observers cannot prevent stopping playback. */ }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    sceneGeneration++
    audioGeneration++
    stopSampling()
    removeInputs()
    audio.dispose()
    host?.dispose()
  }

  function update() {
    if (disposed || failed || !available || !sceneLoaded || !host) return
    const current = now()
    if (playing) elapsed = Math.min(BRIDGE_LIMITS.maxTime, elapsed + Math.max(0, Math.min(0.25, (current - previousTick) / 1000)))
    previousTick = current
    try {
      host.update({ time: elapsed, audio: audio.sample(), pointer: { ...pointer } })
    } catch {
      fail('runtime')
      host.dispose()
    }
  }

  try {
    host = (dependencies.createHost ?? createIsolatedPlaybackHost)({
      container: options.container, rendererUrl: options.rendererUrl, useInlineFrameStyles: options.useInlineFrameStyles,
      onStatus(status) {
        if (status === 'disposed' && !disposed) dispose()
        try { options.onStatus?.(status) } catch { /* Observers cannot interfere with the bridge. */ }
      },
      onFailure: fail,
      onHealthy() {
        if (disposed || failed || !available || !sceneLoaded || !playing) return
        try { options.onHealthy?.() } catch { /* Recovery observers cannot disrupt playback. */ }
      },
    })
  } catch (error) {
    options.container.style.userSelect = previousUserSelect
    audio.dispose()
    throw error
  }

  if (options.pointerInteractions !== false) {
    options.container.addEventListener('pointerdown', onPointerDown)
    options.container.addEventListener('pointerenter', onPointerMove)
    options.container.addEventListener('pointermove', onPointerMove)
    options.container.addEventListener('pointerleave', leavePointer)
    options.container.addEventListener('lostpointercapture', releasePointer)
    options.container.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('blur', leavePointer)
  }
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(resize)
    observer.observe(options.container)
  }
  resize()

  const ready = host.ready.then(() => {
    assertActive()
    available = true
    previousTick = now()
    timer = setInterval(update, 34)
    resize()
  }, error => {
    fail('startup-timeout')
    throw error
  })
  void ready.catch(() => {})

  return {
    ready,
    async loadScene(scene: unknown, profile = options.profile ?? 'full'): Promise<void> {
      assertActive()
      const safeScene = sceneForBridge(scene)
      const resolved = resolveSceneForPlayback(safeScene).engineScene
      response = { mode: normalizeAudioResponseMode(resolved.audioResponse),
        config: resolved.audioResponseConfig ? normalizeAudioResponseConfig(resolved.audioResponseConfig).config : null }
      supportedTargets = null
      const current = ++sceneGeneration
      sceneLoaded = false
      await ready
      assertActive()
      if (current !== sceneGeneration) throw new Error('Scene changed.')
      await host!.loadScene(safeScene, profile)
      assertActive()
      if (current !== sceneGeneration) throw new Error('Scene changed.')
      const capabilities = await host!.getCapabilities()
      assertActive()
      if (current !== sceneGeneration) throw new Error('Scene changed.')
      supportedTargets = capabilities.supportedTargets
      sceneLoaded = true
      elapsed = 0
      zoom = 1
      previousTick = now()
      audio.setSensitivity(response.config?.sensitivity ?? 1)
      host!.setAudioResponse(response)
      host!.setPlayback(playing)
      host!.setZoom(zoom)
      host!.setSynthetic(synthetic.enabled, synthetic.seed, synthetic.tempoScale)
      resize()
      update()
    },
    async loadAudio(source: Blob | string): Promise<void> {
      assertActive()
      const current = ++audioGeneration
      await audio.load(source)
      assertActive()
      if (current !== audioGeneration) throw new Error('Audio changed.')
      if (playing) await audio.play()
      assertActive()
      if (current !== audioGeneration) throw new Error('Audio changed.')
    },
    async play(): Promise<void> {
      assertActive()
      playing = true
      previousTick = now()
      if (available && sceneLoaded) host!.setPlayback(true)
      await audio.play()
    },
    pause() {
      assertActive()
      update()
      playing = false
      audio.pause()
      releasePointer()
      if (available && sceneLoaded) host!.setPlayback(false)
      update()
    },
    seek(seconds: number) { assertActive(); audio.seek(seconds); update() },
    setVolume(value: number) { assertActive(); audio.setVolume(value) },
    clearAudio() { assertActive(); audioGeneration++; audio.clear(); update() },
    reset() {
      assertActive()
      playing = false
      elapsed = 0
      zoom = 1
      previousTick = now()
      audio.pause()
      audio.seek(0)
      releasePointer()
      if (available && sceneLoaded) { host!.setPlayback(false); host!.setZoom(zoom) }
      update()
    },
    setSynthetic(enabled: boolean, seed = 1, tempoScale = 1) {
      assertActive()
      if (typeof enabled !== 'boolean' || !Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295
        || !Number.isFinite(tempoScale) || tempoScale < 0.25 || tempoScale > 4) throw new Error('Invalid simulated beat settings.')
      synthetic = { enabled, seed, tempoScale }
      if (available && sceneLoaded) host!.setSynthetic(enabled, seed, tempoScale)
    },
    setAudioResponse(mode: AudioResponseMode = 'legacy', config: AudioResponseConfig | null = null) {
      assertActive()
      const next = { mode, config }
      if (!isAudioResponseSettings(next)) throw new Error('Invalid music response settings.')
      response = structuredClone(next)
      audio.setSensitivity(response.config?.sensitivity ?? 1)
      if (available && sceneLoaded) host!.setAudioResponse(response)
    },
    getAudioResponseCapabilities() {
      if (!supportedTargets) return null
      const unsupportedTargets = response.config?.mappings.map(mapping => mapping.target).filter(target => !supportedTargets!.includes(target)) ?? []
      return { mode: response.mode, signals: [...AUDIO_RESPONSE_SIGNALS], targets: [...AUDIO_RESPONSE_TARGETS],
        supportedTargets: [...supportedTargets], unsupportedTargets,
        warnings: unsupportedTargets.map(target => `The active shader does not declare the ${target} input.`) }
    },
    getAudioState: () => audio.getState(),
    capture(request?: Partial<CaptureRequest>) { assertActive(); return host!.capture(request) },
    dispose,
  }
}

export type IsolatedPlayer = ReturnType<typeof createIsolatedPlayer>

import type { InputState, MAGEEngineAPI, MAGEPreset } from '@notrac/mage'
import { normalizeAudioResponseConfig, normalizeAudioResponseMode } from '@notrac/mage/audio-response'
import { boundCaptureSize, getRenderBudget, type RenderProfile } from '../modules/player/policy/renderBudget'
import { SCENE_POLICY, validateSceneForPlayback } from '../modules/player/policy/sceneValidation'
import { resolveSceneForPlayback } from '../modules/player/templates/resolveScene'
import { BRIDGE_LIMITS, type PlaybackPayloads, type CaptureRequest } from '../modules/player/isolation/playbackProtocol'
import { rasterDimensions } from '../modules/player/isolation/capture'
import { attachViewerPointerDeformation, type ViewerPointerMesh } from '../modules/player/infrastructure/viewerPointerDeformation'
import { createPointerOrbit, type OrbitFields } from './pointerOrbit'

export type PlaybackEngine = {
  dispose: () => void
  resize: (value: PlaybackPayloads['resize']) => void
  input: (value: PlaybackPayloads['input']) => void
  playback: (playing: boolean) => void
  synthetic: (value: PlaybackPayloads['synthetic']) => void
  audioResponse: (value: PlaybackPayloads['audio-response']) => void
  capabilities: () => PlaybackPayloads['capabilities-result']
  zoom: (factor: number) => void
  capture: (value: CaptureRequest) => Promise<PlaybackPayloads['captured']>
}
export type PlaybackLoader = (options: {
  canvas: HTMLCanvasElement; scene: unknown; profile: RenderProfile; signal: AbortSignal
  onError: () => void; onFrame: () => void
}) => Promise<PlaybackEngine>

type Engine = Omit<MAGEEngineAPI, 'loadPreset'> & {
  loadPreset: (preset: MAGEPreset) => unknown
  setExternalClock: (value: { time: number; rate: number; playing: boolean } | null) => void
  getEngineFields: () => OrbitFields & { controlSettings: { active: boolean; integrated: boolean }; controls: { enabled: boolean };
    visualizer: { render_tooltips: boolean; mesh: ViewerPointerMesh | null; getActiveShader: () => string | null } }
}
const silence = { frame: null, legacyAmplitude: 0, audioTime: 0, playing: false, loaded: false }
const noShortcuts: InputState = { requestToggleUI: false, requestResetVisualizer: false,
  requestNextShader: false, requestPreviousShader: false, requestWheelDirection: 0 }

/** Only validated scene data and numbers enter this engine; no media loader is exposed. */
export const loadPlaybackEngine: PlaybackLoader = async ({ canvas, scene, profile, signal, onError, onFrame }) => {
  const resolved = resolveSceneForPlayback(validateSceneForPlayback(scene)).engineScene
  validateSceneForPlayback(resolved)
  // Defense in depth for callers other than the protocol validator.
  if (Object.hasOwn(resolved, 'audio') || Object.hasOwn(resolved, 'audioPath')) throw new Error('Media is parent-owned.')
  const { initMAGE } = await import('@notrac/mage')
  signal.throwIfAborted()
  const engine = initMAGE({ canvas, autoStart: false, log: false, pixelRatio: 1,
    withControls: { active: false, integrated: false }, renderBudget: getRenderBudget(profile) }) as unknown as Engine
  let disposed = false
  let unsubscribe = () => {}
  let rejectStartup: (error: Error) => void = () => {}
  let capturePending = false
  let orbit: ReturnType<typeof createPointerOrbit> | null = null
  let deformation: ReturnType<typeof attachViewerPointerDeformation> | null = null
  const intent = resolved.intent as Record<string, unknown> | undefined
  const state = resolved.state as Record<string, unknown> | undefined
  const speed = typeof intent?.time_multiplier === 'number' ? intent.time_multiplier : 1
  const initialTime = typeof state?.time === 'number' ? state.time : 0
  let appliedResponseMode = normalizeAudioResponseMode(resolved.audioResponse)
  let appliedResponseConfig = appliedResponseMode === 'mapped-v1'
    ? JSON.stringify(normalizeAudioResponseConfig(resolved.audioResponseConfig).config) : null
  let playing = true
  function onContextLost() {
    if (disposed) return
    try { onError() } finally { dispose() }
  }
  function dispose() {
    if (disposed) return
    disposed = true
    signal.removeEventListener('abort', dispose)
    canvas.removeEventListener('webglcontextlost', onContextLost)
    orbit?.dispose(); deformation?.dispose(); orbit = deformation = null
    try { unsubscribe() } catch { /* Continue releasing graphics after listener cleanup. */ }
    try { engine.dispose() } catch { /* Removing the iframe is the final cleanup boundary. */ }
    rejectStartup(new Error('Rendering stopped.'))
  }
  signal.addEventListener('abort', dispose, { once: true })
  canvas.addEventListener('webglcontextlost', onContextLost)
  try {
    await new Promise<void>((resolve, reject) => {
      rejectStartup = reject
      let loaded = false
      unsubscribe = engine.subscribeRenderLifecycle(event => {
        if (disposed) return
        if (event.type === 'error') { onError(); dispose(); reject(new Error('Rendering failed.')); return }
        if (loaded) { onFrame(); resolve() }
      })
      // External silence prevents the renderer from ever starting its internal audio source.
      engine.setExternalAudioFrame(silence)
      engine.setInputState({ ...noShortcuts, pointerOverUi: true, currPointerDown: 0 })
      engine.start()
      if (disposed) throw new Error('Renderer failed during startup.')
      const fields = engine.getEngineFields()
      fields.controlSettings.active = true
      fields.controlSettings.integrated = false
      fields.controls.enabled = true
      fields.visualizer.render_tooltips = false
      const fx = resolved.fx && typeof resolved.fx === 'object' ? resolved.fx as Record<string, unknown> : {}
      if (!engine.loadPreset({ ...resolved, fx: { ...fx,
        bloom: { enabled: SCENE_POLICY.defaults.optionalEffects, ...(fx.bloom as object ?? {}) },
        passes: { ...Object.fromEntries(SCENE_POLICY.optionalEffectFlags.map(flag => [flag, SCENE_POLICY.defaults.optionalEffects])),
          outputPass: SCENE_POLICY.defaults.outputPass, ...(fx.passes as object ?? {}) },
      } } as MAGEPreset)) throw new Error('Scene could not load.')
      orbit = createPointerOrbit(fields)
      deformation = attachViewerPointerDeformation(fields.visualizer.mesh, fields.visualizer.getActiveShader() ?? '')
      loaded = true
      engine.setExternalClock({ time: Math.min(BRIDGE_LIMITS.maxTime, Math.max(0, initialTime)), rate: speed, playing })
      // Startup must submit a real frame even when the parent intends a paused scene.
      engine.play()
      if (signal.aborted) dispose()
    })
    return {
      dispose,
      resize(value) {
        if (disposed) return
        // The engine measures CSS size every frame and applies its immutable render ceilings.
        // DPR stays at one for this bridge; supplied device ratio cannot raise the budget.
        canvas.style.width = `${value.width}px`
        canvas.style.height = `${value.height}px`
      },
      playback(value) {
        if (disposed) return
        playing = value
        engine.setExternalClock({ time: engine.getEngineTime(), rate: speed, playing })
        if (playing) engine.play(); else engine.pause()
      },
      input(value) {
        if (disposed) return
        engine.setExternalClock({ time: Math.min(BRIDGE_LIMITS.maxTime, Math.max(0, initialTime + value.time * speed)), rate: speed, playing })
        engine.setExternalAudioFrame(value.audio)
        const rect = canvas.getBoundingClientRect()
        const inside = value.pointer.inside ?? true
        orbit?.update(value.pointer, rect.width, rect.height)
        deformation?.update(value.pointer.x, value.pointer.y, inside ? 1 : 0, inside && value.pointer.down ? 1 : 0)
        engine.setInputState({ ...noShortcuts, pointerOverUi: !inside, currPointerDown: inside && value.pointer.down ? 1 : 0,
          clientX: rect.left + (value.pointer.x + 1) * rect.width / 2,
          clientY: rect.top + (1 - value.pointer.y) * rect.height / 2 })
      },
      synthetic(value) { if (!disposed) engine.setSyntheticPreview(value.enabled, value.seed, value.tempoScale) },
      audioResponse(value) {
        if (disposed) return
        const modeChanged = value.mode !== appliedResponseMode
        const config = value.mode === 'mapped-v1' ? normalizeAudioResponseConfig(value.config).config : null
        const configKey = config ? JSON.stringify(config) : null
        // Selecting a mode resets the engine's config and analysis sessions.
        // Apply it first, and preserve those sessions during same-mode edits.
        if (modeChanged) engine.setAudioResponseMode(value.mode)
        if (value.mode === 'mapped-v1' && (modeChanged || configKey !== appliedResponseConfig)) {
          engine.setAudioResponseConfig(config)
        }
        appliedResponseMode = value.mode
        appliedResponseConfig = configKey
      },
      capabilities() { return { supportedTargets: engine.getAudioResponseCapabilities().supportedTargets } },
      zoom(factor) { if (!disposed) orbit?.zoom(factor) },
      async capture(value) {
        if (disposed || capturePending) throw new Error('Capture is unavailable.')
        capturePending = true
        try {
          const dimensions = boundCaptureSize(value.width, value.height)
          const url = await engine.captureFramePreview({ ...value, ...dimensions })
          signal.throwIfAborted()
          if (disposed || typeof url !== 'string') throw new Error('Capture is unavailable.')
          const prefix = `data:${value.type};base64,`
          if (!url.startsWith(prefix) || url.length > prefix.length + Math.ceil(BRIDGE_LIMITS.captureBytes / 3) * 4) throw new Error('Invalid capture.')
          const decoded = atob(url.slice(prefix.length))
          if (!decoded.length || decoded.length > BRIDGE_LIMITS.captureBytes) throw new Error('Invalid capture.')
          const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0)).buffer
          const actual = rasterDimensions(bytes, value.type)
          if (actual.width > dimensions.width || actual.height > dimensions.height) throw new Error('Invalid capture dimensions.')
          return { bytes, type: value.type, ...actual }
        } finally { capturePending = false }
      },
    }
  } catch (error) { dispose(); throw error }
}

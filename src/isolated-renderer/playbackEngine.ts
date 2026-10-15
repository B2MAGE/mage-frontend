import type { InputState, MAGEEngineAPI, MAGEPreset } from '@notrac/mage'
import { AUDIO_RESPONSE_TARGETS, normalizeAudioResponseConfig, normalizeAudioResponseMode } from '@notrac/mage/audio-response'
import type { AudioAnalysisFrame } from '@notrac/mage/audio-analysis'
import { AUDIO_INSPECTOR_BANDS, AUDIO_INSPECTOR_HIT_SECONDS, emptyInspectorBands, type AudioInspectorSnapshot } from '../modules/player/audioInspector'
import { boundCaptureSize, getRenderBudget, type RenderProfile } from '../modules/player/policy/renderBudget'
import { SCENE_POLICY, validateSceneForPlayback } from '../modules/player/policy/sceneValidation'
import { resolveSceneForPlayback } from '../modules/player/templates/resolveScene'
import { BRIDGE_LIMITS, type PlaybackPayloads, type CaptureRequest, type StartupPhase } from '../modules/player/isolation/playbackProtocol'
import { rasterDimensions } from '../modules/player/isolation/capture'
import { attachViewerPointerDeformation, type ViewerPointerMesh } from '../modules/player/infrastructure/viewerPointerDeformation'
import { createPointerOrbit, type OrbitFields } from './pointerOrbit'
import type { CompiledShaderArtifact } from '@notrac/mage/compiled-shader'
import { diffLiveSceneSettings, extractLiveSceneSettings, validateLiveSceneSettings, type SceneLiveSettingsPatch } from '../modules/player/liveSceneSettings'
import { compileBuilderPreviewDocument } from '../modules/player/templates/builderCompiler'
import { assertBuilderUniformManifest, type BuilderUniformValue } from '../modules/player/templates/builderUniformValues'
import { assertBuilderBindingManifest, type BuilderLiveBinding } from '../modules/player/templates/builderBindings'
import { createBuilderBindingController } from './builderBindings'

export type PlaybackEngine = {
  dispose: () => void
  resize: (value: PlaybackPayloads['resize']) => void
  input: (value: PlaybackPayloads['input']) => void
  playback: (playing: boolean) => void
  synthetic: (value: PlaybackPayloads['synthetic']) => void
  audioResponse: (value: PlaybackPayloads['audio-response']) => void
  sceneSettings: (value: PlaybackPayloads['scene-settings']) => void
  capabilities: () => PlaybackPayloads['capabilities-result']
  audioInspector?: () => AudioInspectorSnapshot | null
  zoom: (factor: number) => void
  capture: (value: CaptureRequest) => Promise<PlaybackPayloads['captured']>
}
export type PlaybackLoader = (options: {
  canvas: HTMLCanvasElement; scene: unknown; profile: RenderProfile; signal: AbortSignal
  sceneRevision?: number
  onError: (reason?: 'context-lost') => void; onFrame: () => void; onPhase?: (phase: StartupPhase) => void
}) => Promise<PlaybackEngine>

export class PlaybackDownloadError extends Error {
  readonly code: 'compiler-download' | 'graphics-download'
  constructor(code: 'compiler-download' | 'graphics-download') { super('Player resources could not be downloaded.'); this.code = code }
}

type Engine = Omit<MAGEEngineAPI, 'loadPreset' | 'loadCompiledPreset' | 'updateSettings'> & {
  updateSettings: (value: SceneLiveSettingsPatch) => boolean
  loadCompiledPreset: (preset: MAGEPreset, artifact: CompiledShaderArtifact) => unknown
  setExternalClock: (value: { time: number; rate: number; playing: boolean } | null) => void
  getEngineFields: () => OrbitFields & { controlSettings: { active: boolean; integrated: boolean }; controls: { enabled: boolean };
    visualizer: { render_tooltips: boolean; mesh: ViewerPointerMesh | null; getActiveShader: () => string | null } }
}
const silence = { frame: null, legacyAmplitude: 0, audioTime: 0, playing: false, loaded: false }
const noShortcuts: InputState = { requestToggleUI: false, requestResetVisualizer: false,
  requestNextShader: false, requestPreviousShader: false, requestWheelDirection: 0 }

/** Only validated scene data and numbers enter this engine; no media loader is exposed. */
export const loadPlaybackEngine: PlaybackLoader = async ({ canvas, scene, profile, signal, sceneRevision = 1, onError, onFrame, onPhase }) => {
  const document = validateSceneForPlayback(scene)
  const resolved = resolveSceneForPlayback(document).engineScene
  const builder = document.kind === 'builder' ? compileBuilderPreviewDocument(document) : null
  if (builder) (resolved.visualizer as { shader: string }).shader = builder.shader
  validateSceneForPlayback({ schemaVersion: 1, kind: 'custom', scene: resolved })
  // Defense in depth for callers other than the protocol validator.
  if (Object.hasOwn(resolved, 'audio') || Object.hasOwn(resolved, 'audioPath')) throw new Error('Media is parent-owned.')
  let appliedSettings = extractLiveSceneSettings(scene)
  const renderBudget = getRenderBudget(profile)
  const shader = (resolved.visualizer as { shader: string }).shader
  // Finish and retire submitted JavaScript before allocating the renderer. An
  // unavailable worker is an error, never permission to compile in this frame.
  onPhase?.('compiler-download')
  const { compileInWorker } = await import('./compiler/client').catch(() => { throw new PlaybackDownloadError('compiler-download') })
  signal.throwIfAborted()
  onPhase?.('compiler-startup')
  const artifact = await compileInWorker(shader, { signal, sceneRevision, maxRaymarchIterations: renderBudget.maxRaymarchIterations,
    onStarted: () => onPhase?.('compiling') })
  signal.throwIfAborted()
  onPhase?.('graphics-download')
  const { initMAGE } = await import('@notrac/mage').catch(() => { throw new PlaybackDownloadError('graphics-download') })
  signal.throwIfAborted()
  onPhase?.('graphics-startup')
  const devicePixelRatio = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
    ? Math.min(window.devicePixelRatio, renderBudget.maxDevicePixelRatio)
    : 1
  const engine = initMAGE({ canvas, autoStart: false, log: false, pixelRatio: devicePixelRatio,
    withControls: { active: false, integrated: false }, renderBudget }) as unknown as Engine
  let disposed = false
  let unsubscribe = () => {}
  let rejectStartup: (error: Error) => void = () => {}
  let capturePending = false
  let orbit: ReturnType<typeof createPointerOrbit> | null = null
  let deformation: ReturnType<typeof attachViewerPointerDeformation> | null = null
  let bindingController: ReturnType<typeof createBuilderBindingController> | null = null
  const intent = resolved.intent as Record<string, unknown> | undefined
  const state = resolved.state as Record<string, unknown> | undefined
  let speed = typeof intent?.time_multiplier === 'number' ? intent.time_multiplier : 1
  const initialTime = typeof state?.time === 'number' ? state.time : 0
  let parentTime = 0, clockAnchorParent = 0, clockAnchorScene = initialTime
  let audioEpoch: number | undefined
  let inspectorInput: PlaybackPayloads['input'] | null = null, inspectorReceivedAt = 0
  let inspectorFrame: AudioAnalysisFrame | null = null
  let simulated = false
  const inspectorHits = new Map<AudioAnalysisFrame['hits'][number]['band'], AudioAnalysisFrame['hits'][number]>()
  function clearInspectorInput() { inspectorFrame = null; inspectorHits.clear() }
  const boundTime = (time: number) => Math.min(BRIDGE_LIMITS.maxTime, Math.max(0, time))
  let appliedResponseMode = normalizeAudioResponseMode(resolved.audioResponse)
  let appliedResponseConfig = appliedResponseMode === 'mapped-v1'
    ? JSON.stringify(normalizeAudioResponseConfig(resolved.audioResponseConfig).config) : null
  let playing = true
  let currentZoom = 1
  function prepareBuilderValues(values: readonly BuilderUniformValue[] | undefined, bindings: readonly BuilderLiveBinding[] | undefined) {
    if (!builder) {
      if (values !== undefined || bindings !== undefined) throw new Error('Builder settings require a Builder scene.')
      return () => {}
    }
    assertBuilderUniformManifest(values ?? [], builder.uniforms)
    assertBuilderBindingManifest(bindings ?? [], builder.uniforms)
    const material = engine.getEngineFields().visualizer.mesh?.material
    if (!material || Array.isArray(material)) throw new Error('Builder material is unavailable.')
    const updates = builder.uniforms.map((uniform, index) => {
      const slot = material.uniforms?.[uniform.name]
      if (!slot || typeof slot.value !== 'number') throw new Error('Builder uniform is unavailable.')
      return { slot, index }
    })
    return () => {
      const write = (animatedValues: readonly number[]) => {
        for (const { slot, index } of updates) slot.value = animatedValues[index]
        material.uniformsNeedUpdate = true
      }
      if (bindingController) bindingController.configure(bindings ?? [], values ?? [])
      else bindingController = createBuilderBindingController(builder.uniforms, bindings ?? [], values ?? [], write)
      const fields = engine.getEngineFields()
      // An explicitly bound pointer must not also warp every object through the viewer fallback.
      if (bindings?.some(binding => binding.source.startsWith('pointer-'))
        || builder.uniforms.some(uniform => uniform.target === 'driver-signal' && uniform.source.startsWith('pointer-'))) {
        deformation?.dispose(); deformation = null
      } else deformation = attachViewerPointerDeformation(fields.visualizer.mesh, fields.visualizer.getActiveShader() ?? '')
    }
  }
  function onContextLost() {
    if (disposed) return
    try { onError('context-lost') } finally { dispose() }
  }
  function dispose() {
    if (disposed) return
    disposed = true
    signal.removeEventListener('abort', dispose)
    canvas.removeEventListener('webglcontextlost', onContextLost)
    orbit?.dispose(); deformation?.dispose(); orbit = deformation = null
    bindingController?.dispose(); bindingController = null
    inspectorInput = null; clearInspectorInput()
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
        if (loaded) { bindingController?.advance(); onFrame(); resolve() }
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
      if (!engine.loadCompiledPreset({ ...resolved, fx: { ...fx,
        bloom: { enabled: SCENE_POLICY.defaults.optionalEffects, ...(fx.bloom as object ?? {}) },
        passes: { ...Object.fromEntries(SCENE_POLICY.optionalEffectFlags.map(flag => [flag, SCENE_POLICY.defaults.optionalEffects])),
          outputPass: SCENE_POLICY.defaults.outputPass, ...(fx.passes as object ?? {}) },
      } } as MAGEPreset, artifact)) throw new Error('Scene could not load.')
      prepareBuilderValues(appliedSettings.builderUniforms, appliedSettings.builderBindings)()
      orbit = createPointerOrbit(fields)
      if (!builder) deformation = attachViewerPointerDeformation(fields.visualizer.mesh, fields.visualizer.getActiveShader() ?? '')
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
        if (!value) clearInspectorInput()
        bindingController?.playback(value)
        engine.setExternalClock({ time: engine.getEngineTime(), rate: speed, playing })
        if (playing) engine.play(); else engine.pause()
      },
      input(value) {
        if (disposed) return
        // Reset keeps its established authored starting time. Other clock input
        // advances from the most recent speed edit instead of rescaling history.
        if (value.time < parentTime) { clockAnchorParent = 0; clockAnchorScene = initialTime }
        parentTime = value.time
        engine.setExternalClock({ time: boundTime(clockAnchorScene + (parentTime - clockAnchorParent) * speed), rate: speed, playing })
        const nextAudioEpoch = value.audioEpoch ?? 0
        if (audioEpoch !== nextAudioEpoch || !value.audio.playing
          || inspectorInput?.audio.playing !== value.audio.playing) clearInspectorInput()
        inspectorInput = value; inspectorReceivedAt = performance.now() / 1000
        if (value.audio.playing && value.audio.frame) {
          inspectorFrame = value.audio.frame
          for (const hit of value.audio.frame.hits) inspectorHits.set(hit.band, hit)
        }
        if (audioEpoch !== undefined && audioEpoch !== nextAudioEpoch) {
          // The audio clock keeps advancing across seeks and song changes. Clear
          // old hit envelopes without reloading settings or detaching parent audio.
          engine.setExternalAudioFrame({ ...value.audio, frame: null, legacyAmplitude: 0, playing: false })
        }
        audioEpoch = nextAudioEpoch
        engine.setExternalAudioFrame(value.audio)
        bindingController?.input(value)
        const rect = canvas.getBoundingClientRect()
        const inside = value.pointer.inside ?? true
        orbit?.update(value.pointer, rect.width, rect.height)
        deformation?.update(value.pointer.x, value.pointer.y, inside ? 1 : 0, inside && value.pointer.down ? 1 : 0)
        engine.setInputState({ ...noShortcuts, pointerOverUi: !inside, currPointerDown: inside && value.pointer.down ? 1 : 0,
          clientX: rect.left + (value.pointer.x + 1) * rect.width / 2,
          clientY: rect.top + (1 - value.pointer.y) * rect.height / 2 })
      },
      synthetic(value) {
        if (disposed) return
        simulated = value.enabled
        engine.setSyntheticPreview(value.enabled, value.seed, value.tempoScale)
        bindingController?.synthetic(value)
      },
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
      sceneSettings(value) {
        if (disposed) return
        // Direct engine clients receive the same atomic validation as the port.
        const next = validateLiveSceneSettings(value)
        // Validate every manifest entry and material slot before changing either
        // global settings or uniforms. Names never arrive over the bridge.
        const applyBuilderValues = prepareBuilderValues(next.builderUniforms, next.builderBindings)
        const delta = diffLiveSceneSettings(appliedSettings, next)
        if (!Object.keys(delta).length) {
          applyBuilderValues(); appliedSettings = next; return
        }
        const nextSpeed = next.intent.time_multiplier
        const currentTime = nextSpeed === speed ? null : boundTime(engine.getEngineTime())
        if (!engine.updateSettings(delta)) throw new Error('Rendering stopped.')
        applyBuilderValues()
        if (currentTime !== null) {
          clockAnchorParent = parentTime; clockAnchorScene = currentTime; speed = nextSpeed
          engine.setExternalClock({ time: currentTime, rate: speed, playing })
        }
        if (delta.controls) {
          orbit?.dispose()
          orbit = createPointerOrbit(engine.getEngineFields(), currentZoom)
        }
        appliedSettings = next
      },
      capabilities() { return { supportedTargets: engine.getAudioResponseCapabilities().supportedTargets } },
      audioInspector() {
        if (disposed) return null
        const bound = bindingController?.inspect()
        const age = Math.max(0, performance.now() / 1000 - inspectorReceivedAt)
        const audio = inspectorInput?.audio
        const source = !playing ? 'none' : audio?.loaded && audio.playing
          ? age <= 1 ? 'audio' : 'none' : simulated ? 'synthetic' : 'none'
        const audioTime = (audio?.audioTime ?? 0) + age
        const hits = emptyInspectorBands()
        if (source === 'audio') for (const band of AUDIO_INSPECTOR_BANDS) {
          const hit = inspectorHits.get(band)
          if (hit && audioTime - hit.time <= AUDIO_INSPECTOR_HIT_SECONDS) hits[band] = hit.strength
        }
        const material = engine.getEngineFields().visualizer.mesh?.material
        const uniforms = material && !Array.isArray(material) ? material.uniforms : undefined
        const sceneOutputs: AudioInspectorSnapshot['sceneOutputs'] = {}
        for (const target of AUDIO_RESPONSE_TARGETS) {
          const value = uniforms?.[target]?.value
          if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000) sceneOutputs[target] = value
        }
        return { mode: appliedResponseMode, playing, audioLoaded: audio?.loaded ?? false, source: bound?.source ?? source,
          levels: bound ? bound.levels : source === 'audio' && inspectorFrame && audioTime - inspectorFrame.time <= 1
            ? { ...inspectorFrame.levels } : null,
          hits: bound?.hits ?? hits, sceneOutputs,
          bindings: bound?.bindings ?? [], driverSignals: bound?.driverSignals ?? [] }
      },
      zoom(factor) {
        if (disposed || !Number.isFinite(factor)) return
        currentZoom = Math.min(2.5, Math.max(0.4, factor))
        orbit?.zoom(currentZoom)
      },
      async capture(value) {
        if (disposed || capturePending) throw new Error('Capture is unavailable.')
        capturePending = true
        try {
          bindingController?.advance()
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

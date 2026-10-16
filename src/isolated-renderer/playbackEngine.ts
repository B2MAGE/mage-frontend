import type { InputState, MAGEEngineAPI, MAGEPreset } from '@notrac/mage'
import type { CompiledShaderArtifact } from '@notrac/mage/compiled-shader'
import { getRenderBudget, type RenderProfile } from '../modules/player/policy/renderBudget'
import { SCENE_POLICY, validateSceneForPlayback } from '../modules/player/policy/sceneValidation'
import { resolveSceneForPlayback } from '../modules/player/templates/resolveScene'
import { type PlaybackPayloads, type CaptureRequest, type StartupPhase } from '../modules/player/isolation/playbackProtocol'
import { type ViewerPointerMesh } from '../modules/player/infrastructure/viewerPointerDeformation'
import type { OrbitFields } from './pointerOrbit'
import { extractLiveSceneSettings, type SceneLiveSettingsPatch } from '../modules/player/liveSceneSettings'
import { compileBuilderPreviewDocument } from '../modules/player/templates/builderCompiler'
import { createPlaybackSceneControls } from './playbackSceneControls'
import type { AudioInspectorSnapshot } from '../modules/player/audioInspector'

export type PreparedPlaybackScene = { activate(): void; discard(): void }
export type PreparePlaybackSceneOptions = { scene: unknown; profile: RenderProfile; signal: AbortSignal
  sceneRevision: number; onPhase?: (phase: StartupPhase) => void }
export type PlaybackEngine = {
  initialPreparedScene?: PreparedPlaybackScene
  prepareScene?: (options: PreparePlaybackSceneOptions) => Promise<PreparedPlaybackScene>
  dispose: () => void
  resize: (value: PlaybackPayloads['resize']) => void
  input: (value: PlaybackPayloads['input']) => void
  playback: (playing: boolean) => void
  synthetic: (value: PlaybackPayloads['synthetic']) => void
  audioResponse: (value: PlaybackPayloads['audio-response']) => void
  sceneSettings: (value: PlaybackPayloads['scene-settings']) => void
  capabilities: () => PlaybackPayloads['capabilities-result']
  audioInspector?: () => AudioInspectorSnapshot | null
  graphicsDiagnostics?: () => PlaybackPayloads['graphics-diagnostics-result']
  zoom: (factor: number) => void
  capture: (value: CaptureRequest) => Promise<PlaybackPayloads['captured']>
}
export type PlaybackLoader = (options: {
  canvas: HTMLCanvasElement; scene: unknown; profile: RenderProfile; signal: AbortSignal
  sceneRevision?: number
  deferActivation?: boolean
  onError: (reason?: 'context-lost') => void; onFrame: () => void; onPhase?: (phase: StartupPhase) => void
}) => Promise<PlaybackEngine>

export class PlaybackDownloadError extends Error {
  readonly code: 'compiler-download' | 'graphics-download'
  constructor(code: 'compiler-download' | 'graphics-download') { super('Player resources could not be downloaded.'); this.code = code }
}

export type EngineFields = OrbitFields & { controlSettings: { active: boolean; integrated: boolean }; controls: { enabled: boolean };
  renderer?: { info: { memory: { geometries: number; textures: number }; programs?: unknown[] } };
  visualizer: { render_tooltips: boolean; mesh: ViewerPointerMesh | null; getActiveShader: () => string | null } }
export type Engine = Omit<MAGEEngineAPI, 'loadPreset' | 'loadCompiledPreset' | 'updateSettings' | 'prepareCompiledPreset' | 'getPreparedSceneFields' | 'activatePreparedPreset' | 'discardPreparedPreset'> & {
  updateSettings(value: SceneLiveSettingsPatch): boolean
  loadCompiledPreset(preset: MAGEPreset, artifact: CompiledShaderArtifact): unknown
  prepareCompiledPreset(preset: MAGEPreset, artifact: CompiledShaderArtifact, options: { signal: AbortSignal;
    configure: (fields: Omit<EngineFields, 'controlSettings'>) => void }): Promise<object>
  getPreparedSceneFields(token: object): Omit<EngineFields, 'controlSettings'>
  activatePreparedPreset(token: object, options?: { time: number }): unknown
  discardPreparedPreset(token: object): void
  setExternalClock(value: { time: number; rate: number; playing: boolean } | null): void
  getEngineFields(): EngineFields
}
const silence = { frame: null, legacyAmplitude: 0, audioTime: 0, playing: false, loaded: false }
const noShortcuts: InputState = { requestToggleUI: false, requestResetVisualizer: false,
  requestNextShader: false, requestPreviousShader: false, requestWheelDirection: 0 }
// One module instance per disposable iframe, including replacement contexts.
let contextsCreated = 0, contextsDisposed = 0

async function compileScene({ scene, profile, signal, sceneRevision, onPhase }: PreparePlaybackSceneOptions) {
  const requestedAt = performance.now()
  const document = validateSceneForPlayback(scene)
  const resolved = resolveSceneForPlayback(document).engineScene
  const builder = document.kind === 'builder' ? compileBuilderPreviewDocument(document) : null
  if (builder) (resolved.visualizer as { shader: string }).shader = builder.shader
  validateSceneForPlayback({ schemaVersion: 1, kind: 'custom', scene: resolved })
  if (Object.hasOwn(resolved, 'audio') || Object.hasOwn(resolved, 'audioPath')) throw new Error('Media is parent-owned.')
  onPhase?.('compiler-download')
  const { compileInWorker } = await import('./compiler/client').catch(() => { throw new PlaybackDownloadError('compiler-download') })
  signal.throwIfAborted(); onPhase?.('compiler-startup')
  const artifact = await compileInWorker((resolved.visualizer as { shader: string }).shader,
    { signal, sceneRevision, maxRaymarchIterations: getRenderBudget(profile).maxRaymarchIterations,
      onStarted: () => onPhase?.('compiling') })
  signal.throwIfAborted()
  const fx = resolved.fx && typeof resolved.fx === 'object' ? resolved.fx as Record<string, unknown> : {}
  const preset = { ...resolved, fx: { ...fx,
    bloom: { enabled: SCENE_POLICY.defaults.optionalEffects, ...(fx.bloom as object ?? {}) },
    passes: { ...Object.fromEntries(SCENE_POLICY.optionalEffectFlags.map(flag => [flag, SCENE_POLICY.defaults.optionalEffects])),
      outputPass: SCENE_POLICY.defaults.outputPass, ...(fx.passes as object ?? {}) },
  } } as MAGEPreset
  return { resolved, builder, artifact, preset, settings: extractLiveSceneSettings(scene), requestedAt }
}
export type PlaybackSceneData = Awaited<ReturnType<typeof compileScene>>
type SceneControls = ReturnType<typeof createPlaybackSceneControls>

/** Submitted code finishes in a disposable worker before graphics allocation. */
export const loadPlaybackEngine: PlaybackLoader = async ({ canvas, scene, profile, signal, sceneRevision = 1,
  deferActivation = false, onError, onFrame, onPhase }) => {
  const initial = await compileScene({ scene, profile, signal, sceneRevision, onPhase })
  const renderBudget = getRenderBudget(profile)
  onPhase?.('graphics-download')
  const { initMAGE } = await import('@notrac/mage').catch(() => { throw new PlaybackDownloadError('graphics-download') })
  signal.throwIfAborted(); onPhase?.('graphics-startup')
  const devicePixelRatio = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
    ? Math.min(window.devicePixelRatio, renderBudget.maxDevicePixelRatio) : 1
  const engine = initMAGE({ canvas, autoStart: false, initialScene: 'empty', log: false, pixelRatio: devicePixelRatio,
    withControls: { active: false, integrated: false }, renderBudget }) as unknown as Engine
  let recordedContexts = 0, recordedDisposals = 0, started = false
  function recordContextOwnership() {
    const metrics = engine.getGraphicsDiagnostics?.()
    const created = metrics?.contextsCreated ?? (started ? 1 : 0)
    const released = metrics?.contextsDisposed ?? (started && disposed ? 1 : 0)
    contextsCreated += created - recordedContexts; recordedContexts = created
    contextsDisposed += released - recordedDisposals; recordedDisposals = released
  }
  let disposed = false, active: SceneControls | null = null
  let candidate: { abort: AbortController; discard(): void } | null = null
  let firstFrameMs: number | null = null, activeRequestedAt = initial.requestedAt
  let unsubscribe = () => {}
  let rejectStartup: (error: Error) => void = () => {}
  let resolveStartup = () => {}
  let playing = true
  let synthetic: PlaybackPayloads['synthetic'] = { enabled: false, seed: 1, tempoScale: 1 }
  function dispose() {
    if (disposed) return
    disposed = true
    signal.removeEventListener('abort', dispose)
    canvas.removeEventListener('webglcontextlost', onContextLost)
    candidate?.discard(); candidate = null
    active?.dispose(); active = null
    unsubscribe()
    try { engine.dispose() } catch { /* The disposable iframe remains the final boundary. */ }
    finally { recordContextOwnership() }
    rejectStartup(new Error('Rendering stopped.'))
  }
  function onContextLost() {
    if (disposed) return
    try { onError('context-lost') } finally { dispose() }
  }
  signal.addEventListener('abort', dispose, { once: true })
  canvas.addEventListener('webglcontextlost', onContextLost)
  unsubscribe = engine.subscribeRenderLifecycle(event => {
    if (disposed) return
    if (event.type === 'error') { try { onError() } finally { dispose() }; return }
    if (active) {
      firstFrameMs ??= Math.min(120_000, Math.max(0, performance.now() - activeRequestedAt))
      active.frame(); onFrame(); resolveStartup()
    }
  })

  async function prepare(options: PreparePlaybackSceneOptions, compiled?: PlaybackSceneData): Promise<PreparedPlaybackScene> {
    if (disposed || options.profile !== profile) throw new Error('Renderer profile cannot change within a session.')
    candidate?.discard()
    const abort = new AbortController()
    const cancel = () => job.discard()
    let token: object | null = null, controls: SceneControls | null = null, committed = false
    const job = { abort, discard() {
      if (committed) return
      abort.abort()
      options.signal.removeEventListener('abort', cancel)
      controls?.dispose(); controls = null
      if (token) engine.discardPreparedPreset(token)
      if (candidate === job) candidate = null
    } }
    candidate = job
    options.signal.addEventListener('abort', cancel, { once: true })
    if (options.signal.aborted) cancel()
    try {
      const data = compiled ?? await compileScene({ ...options, signal: abort.signal })
      abort.signal.throwIfAborted()
      options.onPhase?.('graphics-startup')
      let activated = false
      token = await engine.prepareCompiledPreset(data.preset, data.artifact, { signal: abort.signal,
        configure(preparedFields) {
          // Include pointer shader additions and validate Builder slots before the candidate's graphics check.
          preparedFields.visualizer.render_tooltips = false
          controls = createPlaybackSceneControls(engine, canvas, data, () => activated ? engine.getEngineFields()
            : { ...preparedFields, controlSettings: engine.getEngineFields().controlSettings })
          controls.initialize()
        } })
      abort.signal.throwIfAborted()
      const readyControls = controls as SceneControls | null, readyToken = token
      if (!readyControls) throw new Error('Candidate controls were not prepared.')
      return { discard: job.discard, activate() {
        abort.signal.throwIfAborted()
        if (disposed || candidate !== job) throw new Error('Scene preparation was superseded.')
        const authoredTime = (data.resolved.state as { time?: number } | undefined)?.time ?? 0
        engine.activatePreparedPreset(readyToken, { time: authoredTime })
        activated = true; committed = true; candidate = null
        options.signal.removeEventListener('abort', cancel)
        const previous = active
        active = readyControls; activeRequestedAt = data.requestedAt
        firstFrameMs = Math.min(120_000, Math.max(0, performance.now() - data.requestedAt))
        try {
          readyControls.activate(); readyControls.playback(playing); readyControls.synthetic(synthetic)
        } catch (error) {
          // The graphics commit already succeeded: this is a session failure, not a retained candidate failure.
          try { onError() } finally { dispose() }
          throw error
        } finally { previous?.dispose() }
      } }
    } catch (error) { job.discard(); throw error }
  }

  try {
    engine.setExternalAudioFrame(silence)
    engine.setInputState({ ...noShortcuts, pointerOverUi: true, currPointerDown: 0 })
    try { engine.start(); started = true } finally { recordContextOwnership() }
    if (disposed) throw new Error('Renderer failed during startup.')
    const fields = engine.getEngineFields()
    fields.controlSettings.active = true; fields.controlSettings.integrated = false; fields.controls.enabled = true
    fields.visualizer.render_tooltips = false
    let initialPreparedScene: PreparedPlaybackScene | undefined
    if (deferActivation) {
      initialPreparedScene = await prepare({ scene, profile, signal, sceneRevision, onPhase }, initial)
    } else {
      // Compatibility during renderer-first rollout; all new parents opt into staged activation.
      await new Promise<void>((resolve, reject) => {
        resolveStartup = resolve; rejectStartup = reject
        if (!engine.loadCompiledPreset(initial.preset, initial.artifact)) throw new Error('Scene could not load.')
        active = createPlaybackSceneControls(engine, canvas, initial)
        active.initialize(); active.activate(); engine.play()
        if (signal.aborted) dispose()
      })
    }
    return {
      initialPreparedScene, prepareScene: options => prepare(options), dispose,
      resize(value) { if (!disposed) { canvas.style.width = value.width + 'px'; canvas.style.height = value.height + 'px' } },
      input: value => { if (!disposed) active?.input(value) },
      playback(value) { playing = value; if (!disposed) active?.playback(value) },
      synthetic(value) { synthetic = value; if (!disposed) active?.synthetic(value) },
      audioResponse: value => { if (!disposed) active?.audioResponse(value) },
      sceneSettings(value) { if (disposed) return; if (!active) throw new Error('No active scene.'); active.sceneSettings(value) },
      capabilities: () => active?.capabilities() ?? { supportedTargets: [] },
      audioInspector: () => active?.audioInspector() ?? null,
      graphicsDiagnostics() {
        const info = engine.getEngineFields().renderer?.info
        const metrics = engine.getGraphicsDiagnostics?.()
        return info ? { contextsCreated, contextsDisposed, firstFrameMs,
          geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0,
          ...(metrics && { preparation: { peakGeometries: metrics.peakGeometries, peakTextures: metrics.peakTextures,
            peakPrograms: metrics.peakPrograms, candidatesPrepared: metrics.candidatesPrepared,
            candidatesActivated: metrics.candidatesActivated, candidatesDiscarded: metrics.candidatesDiscarded,
            mode: metrics.preparationMode } }) } : null
      },
      zoom: value => { if (!disposed) active?.zoom(value) },
      capture(value) { return active && !disposed ? active.capture(value) : Promise.reject(new Error('Capture is unavailable.')) },
    }
  } catch (error) { dispose(); throw error }
}

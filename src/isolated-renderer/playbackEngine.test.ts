import { customDocument } from '@shared/test/sceneDocument'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPlaybackEngine } from './playbackEngine'
import { SCENE_POLICY } from '../modules/player/policy/sceneValidation'
import engineSource from '@notrac/mage?raw'
import { normalizeAudioResponseConfig, normalizeAudioResponseMode } from '@notrac/mage/audio-response'
import { AudioAnalysisSession } from '@notrac/mage/audio-analysis'
import { AudioResponseMapper, SyntheticAudioFrames } from '@notrac/mage/audio-mapping'
import { compileShader } from '@notrac/mage/compiler'
import type { CompilerWorker } from './compiler/client'
import type { CompileRequest } from './compiler/protocol'
import { extractLiveSceneSettings } from '../modules/player/liveSceneSettings'
import { parseSceneDocument, type BuilderSceneDocument } from '../modules/player/templates/sceneContract'
import { compileBuilderPreviewDocument } from '../modules/player/templates/builderCompiler'

type ResponseHarness = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const engineClass = engineSource.slice(engineSource.indexOf('var MAGEEngine = class MAGEEngine {'))
// Run the installed engine setters without allocating WebGL or audio resources.
// Mode selection really resets config/sessions, so reversed calls cannot pass.
function responseMethod(name: string) {
  const start = engineClass.indexOf(`\n\t${name}(`)
  const end = engineClass.indexOf('\n\t}', start)
  if (start < 0 || end <= start) throw new Error(`Missing installed engine method ${name}`)
  const dependencies = { normalizeAudioResponseConfig, normalizeAudioResponseMode, AudioAnalysisSession, AudioResponseMapper, SyntheticAudioFrames }
  return new Function(...Object.keys(dependencies), `return function ${engineClass.slice(start + 2, end + 3).replaceAll('this.#', 'this.')}`)(...Object.values(dependencies))
}

const { initMAGE, compileInWorker, compiledArtifact } = vi.hoisted(() => ({ initMAGE: vi.fn(), compileInWorker: vi.fn(),
  compiledArtifact: { version: 1, uniforms: [], frag: 'compiled fragment', vert: 'compiled vertex', geoGLSL: '', colorGLSL: '' } }))
vi.mock('@notrac/mage', () => ({ initMAGE }))
vi.mock('./compiler/client', () => ({ compileInWorker }))
beforeEach(() => { initMAGE.mockReset(); compileInWorker.mockReset().mockResolvedValue(compiledArtifact) })
function fixture(profile: 'full' | 'preview' = 'preview') {
  const response: ResponseHarness = { audioAnalysis: null, transientAudio: null, syntheticPreviewSeed: 0, syntheticPreviewTempoScale: 1 }
  for (const name of ['setAudioResponseMode', 'setAudioResponseConfig', 'getAudioResponseConfig']) response[name] = responseMethod(name).bind(response)
  const png = new Uint8Array(33)
  png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82])
  const view = new DataView(png.buffer); view.setUint32(16, 10); view.setUint32(20, 10)
  const pngUrl = `data:image/png;base64,${btoa(String.fromCharCode(...png))}`
  let listener: ((event: { type: 'frame' | 'error' }) => void) | undefined
  const engine = { start: vi.fn(), play: vi.fn(), pause: vi.fn(), dispose: vi.fn(), setInputState: vi.fn(),
    updateSettings: vi.fn(() => true),
    setExternalAudioFrame: vi.fn(), setExternalClock: vi.fn(), getEngineTime: vi.fn(() => 2), setSyntheticPreview: vi.fn(),
    setAudioResponseMode: vi.fn((mode: unknown) => response.setAudioResponseMode(mode)),
    setAudioResponseConfig: vi.fn((config: unknown) => response.setAudioResponseConfig(config)),
    loadCompiledPreset: vi.fn((preset: Record<string, unknown>, artifact: unknown): unknown => {
      expect(artifact).toEqual(compiledArtifact)
      response.setAudioResponseMode(preset.audioResponse)
      if (response.audioResponseMode === 'mapped-v1') response.setAudioResponseConfig(preset.audioResponseConfig)
      return {}
    }), captureFramePreview: vi.fn().mockResolvedValue(pngUrl),
    getEngineFields: vi.fn(() => ({ controlSettings: { active: false, integrated: false },
      camera: { position: { x: 0, y: 0, z: 5 }, up: { x: 0, y: 1, z: 0 } },
      controls: { enabled: false, target: { x: 0, y: 0, z: 0 }, update: vi.fn() },
      visualizer: { render_tooltips: true, mesh: null, getActiveShader: () => 'sphere(1);' } })),
    subscribeRenderLifecycle: vi.fn(callback => { listener = callback; return () => { listener = undefined } }) }
  initMAGE.mockReturnValue(engine)
  const abort = new AbortController(), canvas = document.createElement('canvas'), onError = vi.fn(), onFrame = vi.fn()
  const load = (scene: unknown = customDocument({ visualizer: { shader: 'sphere(1);' } })) => loadPlaybackEngine({ canvas, signal: abort.signal, scene,
    profile, onError, onFrame })
  const ready = async (scene?: unknown) => { const loading = load(scene); await vi.waitFor(() => expect(engine.loadCompiledPreset).toHaveBeenCalledOnce()); listener?.({ type: 'frame' }); return loading }
  return { engine, response, abort, canvas, onError, onFrame, load, ready, emit: (type: 'frame' | 'error') => listener?.({ type }) }
}

describe('isolated playback engine', () => {
  it('keeps cumulative wheel zoom continuous through camera setting edits', async () => {
    const f = fixture(), scene = customDocument({ visualizer: { shader: 'sphere(1);' } }), settings = extractLiveSceneSettings(scene)
    const fields = f.engine.getEngineFields()
    f.engine.getEngineFields.mockReturnValue(fields)
    const control = await f.ready(scene)
    control.zoom(2); expect(fields.camera.position.z).toBeCloseTo(10)
    control.sceneSettings({ ...settings, controls: { ...settings.controls, zoom0: 1.2 } })
    control.zoom(2.01)
    expect(fields.camera.position.z).toBeCloseTo(10.05)
    control.dispose()
  })
  it('applies only changed live data without reloading, resuming, or resetting music sessions', async () => {
    const f = fixture(), scene = customDocument({ visualizer: { shader: 'sphere(1);' } }), control = await f.ready(scene)
    const settings = extractLiveSceneSettings(scene)
    control.playback(false); vi.clearAllMocks()
    const next = { ...settings, intent: { ...settings.intent, fov: 80 }, fx: { ...settings.fx,
      bloom: { ...settings.fx.bloom, strength: 1.6 } } }
    control.sceneSettings(next)
    expect(f.engine.updateSettings).toHaveBeenCalledExactlyOnceWith({ intent: { fov: 80 }, fx: { bloom: { strength: 1.6 } } })
    control.sceneSettings(next); expect(f.engine.updateSettings).toHaveBeenCalledOnce()
    expect(f.engine.play).not.toHaveBeenCalled(); expect(f.engine.pause).not.toHaveBeenCalled()
    expect(f.engine.loadCompiledPreset).not.toHaveBeenCalled(); expect(compileInWorker).not.toHaveBeenCalled()
    expect(f.engine.setExternalAudioFrame).not.toHaveBeenCalled(); expect(f.engine.setAudioResponseMode).not.toHaveBeenCalled()
    expect(f.engine.setSyntheticPreview).not.toHaveBeenCalled()
    control.dispose(); control.sceneSettings(settings); expect(f.engine.updateSettings).toHaveBeenCalledOnce()
  })
  it('validates the complete direct settings update before mutating engine or saved settings', async () => {
    const f = fixture(), scene = customDocument({ visualizer: { shader: 'sphere(1);' } }), control = await f.ready(scene)
    const settings = extractLiveSceneSettings(scene)
    const next = { ...settings, intent: { ...settings.intent, fov: 80 } }
    for (const invalid of [
      { ...next, visualizer: { ...next.visualizer, shader: 'sphere(2);' } },
      { ...next, state: { ...next.state, volume_multiplier: Infinity } },
      { ...next, controls: { ...next.controls, zoom0: -1 } },
    ]) expect(() => control.sceneSettings(invalid as typeof settings)).toThrow()
    expect(f.engine.updateSettings).not.toHaveBeenCalled()
    control.sceneSettings(next)
    expect(f.engine.updateSettings).toHaveBeenCalledExactlyOnceWith({ intent: { fov: 80 } })
    control.dispose()
  })
  it('does not advance the applied settings or clock when the engine rejects an update', async () => {
    const f = fixture(), scene = customDocument({ visualizer: { shader: 'sphere(1);' } }), control = await f.ready(scene)
    const settings = extractLiveSceneSettings(scene), next = { ...settings, intent: { ...settings.intent, time_multiplier: 2 } }
    f.engine.setExternalClock.mockClear(); f.engine.updateSettings.mockReturnValueOnce(false)
    expect(() => control.sceneSettings(next)).toThrow(/stopped/)
    expect(f.engine.setExternalClock).not.toHaveBeenCalled()
    control.sceneSettings(next)
    expect(f.engine.updateSettings).toHaveBeenNthCalledWith(2, { intent: { time_multiplier: 2 } })
    expect(f.engine.setExternalClock).toHaveBeenLastCalledWith({ time: 2, rate: 2, playing: true })
    control.dispose()
  })
  it('anchors live speed edits without jumping elapsed time and preserves pause and reset semantics', async () => {
    const scene = customDocument({ visualizer: { shader: 'sphere(1);' }, intent: { time_multiplier: 0.5 }, state: { time: 3 } })
    const f = fixture(), control = await f.ready(scene), settings = extractLiveSceneSettings(scene)
    const input = { time: 10, audio: { frame: null, legacyAmplitude: 0, audioTime: 0, loaded: false, playing: false }, pointer: { x: 0, y: 0, down: false } }
    control.input(input); f.engine.getEngineTime.mockReturnValue(8)
    control.playback(false)
    control.sceneSettings({ ...settings, intent: { ...settings.intent, time_multiplier: 2 } })
    expect(f.engine.setExternalClock).toHaveBeenLastCalledWith({ time: 8, rate: 2, playing: false })
    control.input(input)
    expect(f.engine.setExternalClock).toHaveBeenLastCalledWith({ time: 8, rate: 2, playing: false })
    control.playback(true); control.input({ ...input, time: 11 })
    expect(f.engine.setExternalClock).toHaveBeenLastCalledWith({ time: 10, rate: 2, playing: true })
    control.playback(false); control.input({ ...input, time: 0 })
    expect(f.engine.setExternalClock).toHaveBeenLastCalledWith({ time: 3, rate: 2, playing: false })
    control.dispose()
  })
  it('compiles before creating graphics and passes only the resulting artifact to the compiled loader', async () => {
    const f = fixture()
    let compiled!: (artifact: unknown) => void
    compileInWorker.mockReturnValue(new Promise(resolve => { compiled = resolve }))
    const loading = f.load()
    expect(initMAGE).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(compileInWorker).toHaveBeenCalledWith('sphere(1);', {
      signal: f.abort.signal, sceneRevision: 1, maxRaymarchIterations: 200, onStarted: expect.any(Function) }))
    compiled(compiledArtifact)
    await vi.waitFor(() => expect(f.engine.loadCompiledPreset).toHaveBeenCalledOnce())
    expect(f.engine.loadCompiledPreset.mock.calls[0][1]).toEqual(compiledArtifact)
    f.emit('frame'); (await loading).dispose()
  })

  it('compiles validated Builder objects only after they reach the isolated renderer', async () => {
    const builder = { schemaVersion: 1, kind: 'builder', builderVersion: 1, objects: [{
      id: 'safe-id', name: 'sphere(999); throw new Error("must stay data")',
      operation: { type: 'sphere', radius: 0.7 },
      transform: { position: { x: 1 } },
      bindings: [{ target: 'position.x', source: 'bass-level' }],
    }] }
    const f = fixture(), fields = f.engine.getEngineFields()
    const uniforms = Object.fromEntries(compileBuilderPreviewDocument(parseSceneDocument(builder) as BuilderSceneDocument).uniforms.map(uniform => [uniform.name, { value: 0 }]))
    Object.assign(fields.visualizer, { mesh: { material: { uniforms } } })
    f.engine.getEngineFields.mockReturnValue(fields)
    const loading = f.load(builder)
    await vi.waitFor(() => expect(f.engine.loadCompiledPreset).toHaveBeenCalledOnce())
    const generated = compileInWorker.mock.calls[0][0] as string
    expect(generated).toContain('extractSDF(sphere)(0.7)')
    expect(generated).toContain('builder_o0_position_x=input(0,-100,100)')
    expect(uniforms.builder_o0_position_x.value).toBe(1)
    expect(generated).not.toContain(builder.objects[0].name)
    expect(compileInWorker).toHaveBeenCalledWith(generated,
      { signal: f.abort.signal, sceneRevision: 1, maxRaymarchIterations: 200, onStarted: expect.any(Function) })
    expect(f.engine.loadCompiledPreset.mock.calls[0][0]).toMatchObject({ visualizer: { shader: generated, scale: 10 } })
    f.emit('frame'); (await loading).dispose()
  })

  it('applies the exact Builder manifest before frame/capture without recompilation or clock/audio changes', async () => {
    const scene = parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
      objects: [{ id: 'shape', operation: { type: 'sphere' }, transform: { position: { x: 3 } } }] }) as BuilderSceneDocument
    const f = fixture(), fields = f.engine.getEngineFields()
    const uniforms = Object.fromEntries(compileBuilderPreviewDocument(scene).uniforms.map(uniform => [uniform.name, { value: 0 }]))
    Object.assign(fields.visualizer, { mesh: { material: { uniforms } } })
    f.engine.getEngineFields.mockReturnValue(fields)
    const player = await f.ready(scene)
    expect(uniforms.builder_o0_position_x.value).toBe(3)
    f.engine.setExternalAudioFrame.mockClear(); f.engine.setExternalClock.mockClear(); f.engine.play.mockClear()
    scene.objects[0].transform.position.x = 7
    scene.objects[0].material.metalness = 0.8
    const settings = extractLiveSceneSettings(scene)
    player.sceneSettings(settings)
    expect(uniforms.builder_o0_position_x.value).toBe(7)
    expect(uniforms.builder_o0_material_metalness.value).toBe(0.8)
    expect(compileInWorker).toHaveBeenCalledOnce()
    expect(f.engine.loadCompiledPreset).toHaveBeenCalledOnce()
    expect(f.engine.updateSettings).not.toHaveBeenCalled()
    expect(f.engine.setExternalAudioFrame).not.toHaveBeenCalled()
    expect(f.engine.setExternalClock).not.toHaveBeenCalled()
    expect(f.engine.play).not.toHaveBeenCalled()
    const wrong = { ...settings, intent: { ...settings.intent, fov: 96 }, builderUniforms: settings.builderUniforms!.slice(1) }
    expect(() => player.sceneSettings(wrong)).toThrow(/match the loaded/)
    expect(f.engine.updateSettings).not.toHaveBeenCalled()
    expect(uniforms.builder_o0_position_x.value).toBe(7)
    expect(() => player.sceneSettings({ ...settings, builderUniforms: settings.builderUniforms!.map(entry => ({ ...entry, objectIndex: 1 })) })).toThrow(/match the loaded/)
    await player.capture({ width: 10, height: 10, quality: 0.9, type: 'image/png' })
    expect(f.engine.captureFramePreview).toHaveBeenCalledOnce()
    player.dispose()
  })

  it('updates group transforms and blending atomically without restarting playback', async () => {
    const scene = parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
      objects: [{ id: 'left', operation: { type: 'sphere' } }, { id: 'right', operation: { type: 'box' } }],
      composition: { version: 1, roots: ['pair'], groups: [{ id: 'pair', children: ['left', 'right'],
        operation: { type: 'smooth-union', blend: 0.25 } }] } }) as BuilderSceneDocument
    const manifest = compileBuilderPreviewDocument(scene).uniforms
    const f = fixture(), fields = f.engine.getEngineFields()
    const uniforms = Object.fromEntries(manifest.map(uniform => [uniform.name, { value: 0 }]))
    Object.assign(fields.visualizer, { mesh: { material: { uniforms } } })
    f.engine.getEngineFields.mockReturnValue(fields)
    const player = await f.ready(scene)
    const groupValue = (target: string) => {
      const entry = manifest.find(uniform => 'groupIndex' in uniform && uniform.groupIndex === 0 && uniform.target === target)!
      return uniforms[entry.name].value
    }
    expect(groupValue('blend')).toBe(0.25)
    f.engine.setExternalClock.mockClear(); f.engine.setExternalAudioFrame.mockClear(); f.engine.play.mockClear()
    const group = scene.composition!.groups[0]
    group.transform.position.x = 3
    group.transform.scale = 2
    group.operation = { type: 'smooth-union', blend: 0 }
    const settings = extractLiveSceneSettings(scene)
    player.sceneSettings(settings)
    expect(groupValue('position.x')).toBe(3)
    expect(groupValue('scale')).toBe(2)
    expect(groupValue('blend')).toBe(0)
    expect(compileInWorker).toHaveBeenCalledOnce()
    expect(f.engine.loadCompiledPreset).toHaveBeenCalledOnce()
    expect(f.engine.setExternalClock).not.toHaveBeenCalled()
    expect(f.engine.setExternalAudioFrame).not.toHaveBeenCalled()
    expect(f.engine.play).not.toHaveBeenCalled()
    expect(() => player.sceneSettings({ ...settings, intent: { ...settings.intent, fov: 90 },
      builderUniforms: settings.builderUniforms!.map(entry => 'groupIndex' in entry ? { ...entry, groupIndex: 1 } : entry),
    })).toThrow(/match the loaded/)
    expect(groupValue('position.x')).toBe(3)
    expect(f.engine.updateSettings).not.toHaveBeenCalled()
    player.dispose()
  })

  it('applies driver vector constants and clamp edits to real material slots without reloading a paused preview', async () => {
    const scene = parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
      objects: [{ id: 'shape', operation: { type: 'sphere' }, drivers: [{ target: 'position.x', mode: 'replace', expression: {
        type: 'clamp', min: -2, max: 4, input: { type: 'component', axis: 'y', input: { type: 'constant', value: { x: 1, y: 2, z: 3 } } },
      } }] }],
    }) as BuilderSceneDocument
    const manifest = compileBuilderPreviewDocument(scene).uniforms
    const f = fixture(), fields = f.engine.getEngineFields()
    const uniforms = Object.fromEntries(manifest.map(uniform => [uniform.name, { value: 0 }]))
    Object.assign(fields.visualizer, { mesh: { material: { uniforms } } })
    f.engine.getEngineFields.mockReturnValue(fields)
    const player = await f.ready(scene)
    const driverValues = () => manifest.filter(uniform => uniform.target === 'driver-value').map(uniform => uniforms[uniform.name].value)
    expect(driverValues()).toEqual([1, 2, 3, -2, 4])
    player.playback(false)
    f.engine.play.mockClear(); f.engine.setExternalClock.mockClear(); f.engine.setExternalAudioFrame.mockClear()
    scene.objects[0].drivers![0].expression = { type: 'clamp', min: -1, max: 5,
      input: { type: 'component', axis: 'y', input: { type: 'constant', value: { x: 1, y: 4, z: 3 } } } }
    player.sceneSettings(extractLiveSceneSettings(scene))
    expect(driverValues()).toEqual([1, 4, 3, -1, 5])
    expect(compileInWorker).toHaveBeenCalledOnce()
    expect(f.engine.loadCompiledPreset).toHaveBeenCalledOnce()
    expect(f.engine.play).not.toHaveBeenCalled()
    expect(f.engine.setExternalClock).not.toHaveBeenCalled()
    expect(f.engine.setExternalAudioFrame).not.toHaveBeenCalled()
    await player.capture({ width: 10, height: 10, quality: 0.9, type: 'image/png' })
    expect(driverValues()).toEqual([1, 4, 3, -1, 5])
    player.dispose()
  })

  it.each(['legacy', 'mapped-v1'] as const)('updates independent real binding uniforms in %s mode and edits responses without restarting playback', async mode => {
    const scene = parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
      settings: { audioResponse: mode }, objects: [
        { id: 'bass', operation: { type: 'sphere' }, transform: { position: { x: 1 } },
          bindings: [{ target: 'position.x', source: 'bass-level', attack: 0, release: 0 }] },
        { id: 'highs', operation: { type: 'sphere' },
          bindings: [{ target: 'scale.y', source: 'treble-level', amount: 2, attack: 0, release: 0 }] },
      ] }) as BuilderSceneDocument
    const manifest = compileBuilderPreviewDocument(scene).uniforms
    const f = fixture(), fields = f.engine.getEngineFields()
    const uniforms = Object.fromEntries(manifest.map(uniform => [uniform.name, { value: 0 }]))
    Object.assign(fields.visualizer, { mesh: { material: { uniforms } } })
    f.engine.getEngineFields.mockReturnValue(fields)
    const player = await f.ready(scene)
    const sample = { time: 2, audio: { audioTime: 2, legacyAmplitude: 0.5, playing: true, loaded: true,
      frame: { sequence: 1, time: 2, levels: { bass: 0.8, mid: 0, treble: 0.25, overall: 0.5 }, hits: [] } },
      pointer: { x: -0.4, y: 0.6, down: true, inside: true } }
    player.input(sample)
    expect(uniforms.builder_o0_position_x.value).toBeCloseTo(1.8)
    expect(uniforms.builder_o1_scale_y.value).toBeCloseTo(1.5)
    f.engine.setExternalAudioFrame.mockClear(); f.engine.setExternalClock.mockClear()
    f.engine.setAudioResponseMode.mockClear(); f.engine.play.mockClear(); f.engine.pause.mockClear()
    scene.objects[0].bindings[0].source = 'pointer-x'
    scene.objects[0].bindings[0].amount = 2
    scene.objects[1].bindings[0].amount = -1
    player.sceneSettings(extractLiveSceneSettings(scene))
    expect(uniforms.builder_o0_position_x.value).toBeCloseTo(0.2)
    expect(uniforms.builder_o1_scale_y.value).toBeCloseTo(0.75)
    expect(compileInWorker).toHaveBeenCalledOnce(); expect(f.engine.loadCompiledPreset).toHaveBeenCalledOnce()
    expect(f.engine.setExternalAudioFrame).not.toHaveBeenCalled(); expect(f.engine.setExternalClock).not.toHaveBeenCalled()
    expect(f.engine.setAudioResponseMode).not.toHaveBeenCalled(); expect(f.engine.play).not.toHaveBeenCalled(); expect(f.engine.pause).not.toHaveBeenCalled()
    player.playback(false)
    expect(uniforms.builder_o0_position_x.value).toBe(1); expect(uniforms.builder_o1_scale_y.value).toBe(1)
    player.dispose()
  })

  it('rejects a binding to an absent object before applying any global or uniform edits', async () => {
    const scene = parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
      objects: [{ id: 'one', operation: { type: 'sphere' }, bindings: [{ target: 'position.x', source: 'bass-level' }] }] }) as BuilderSceneDocument
    const f = fixture(), fields = f.engine.getEngineFields()
    const uniforms = Object.fromEntries(compileBuilderPreviewDocument(scene).uniforms.map(uniform => [uniform.name, { value: 0 }]))
    Object.assign(fields.visualizer, { mesh: { material: { uniforms } } }); f.engine.getEngineFields.mockReturnValue(fields)
    const player = await f.ready(scene), settings = extractLiveSceneSettings(scene)
    const next = { ...settings, intent: { ...settings.intent, fov: 95 },
      builderBindings: settings.builderBindings!.map(binding => ({ ...binding, objectIndex: 1 })) }
    expect(() => player.sceneSettings(next)).toThrow()
    expect(f.engine.updateSettings).not.toHaveBeenCalled(); expect(uniforms.builder_o0_position_x.value).toBe(0)
    player.dispose()
  })

  it('does not allocate a renderer or fall back when worker compilation fails or is cancelled', async () => {
    const f = fixture()
    compileInWorker.mockRejectedValue(new Error('Worker unavailable'))
    await expect(f.load()).rejects.toThrow('Worker unavailable')
    expect(initMAGE).not.toHaveBeenCalled()
    compileInWorker.mockImplementation(async () => { f.abort.abort(); return compiledArtifact })
    await expect(f.load()).rejects.toThrow()
    expect(initMAGE).not.toHaveBeenCalled()
  })

  it.each(['invalid-version', 'commented-limit', 'changed-vertex', 'sparse-uniforms'])(
    'rejects %s through the real worker receiver before allocating graphics', async kind => {
      const { compileInWorker: receiveCompiled } = await vi.importActual<typeof import('./compiler/client')>('./compiler/client')
      const artifact = compileShader('sphere(1);')
      if (kind === 'invalid-version') Object.assign(artifact, { version: 2 })
      if (kind === 'commented-limit') artifact.frag = '// const int MAX_ITERATIONS = 200;\nvoid main() {}'
      if (kind === 'changed-vertex') artifact.vert = 'void main() { gl_Position = vec4(0.); }'
      if (kind === 'sparse-uniforms') artifact.uniforms.length++
      const terminate = vi.fn(), release = vi.fn()
      const worker: CompilerWorker = { onmessage: null, onerror: null, onmessageerror: null, terminate,
        postMessage: vi.fn((request: CompileRequest) => {
          const reply = (type: string, extra: object = {}) => worker.onmessage?.call(worker as Worker,
            new MessageEvent('message', { data: { protocol: request.protocol, version: request.version,
              jobId: request.jobId, channelId: request.channelId, sceneRevision: request.sceneRevision, type, ...extra } }))
          reply('started')
          reply('compiled', { artifact })
        }) }
      compileInWorker.mockImplementation((source, options) => receiveCompiled(source, options,
        { createWorker: () => ({ worker, release }) }))
      const f = fixture()
      await expect(f.load()).rejects.toMatchObject({ code: 'invalid-output' })
      expect(terminate).toHaveBeenCalledOnce()
      expect(release).toHaveBeenCalledOnce()
      expect(initMAGE).not.toHaveBeenCalled()
      expect(f.engine.loadCompiledPreset).not.toHaveBeenCalled()
    })

  it('preserves saved selective settings and mapper history when the parent replays them after loading', async () => {
    const config = normalizeAudioResponseConfig({ version: 1, sensitivity: 0.3,
      mappings: [{ target: 'size', source: 'bass-hit', amount: 0.025, attack: 0.12, release: 0.7 }] }).config
    const f = fixture(), control = await f.ready(customDocument({ visualizer: { shader: 'sphere(1);' }, audioResponse: 'mapped-v1', audioResponseConfig: config }))
    const mapper = f.response.audioMapper, analysis = f.response.audioAnalysis, synthetic = f.response.syntheticAudioFrames
    mapper.process([{ sequence: 1, time: 1, levels: {}, hits: [{ band: 'bass', time: 1, strength: 0.8 }] }], 1)
    const history = mapper.getSnapshot()
    control.audioResponse({ mode: 'mapped-v1', config })
    expect(f.response.getAudioResponseConfig()).toEqual(config)
    expect(f.response.audioMapper).toBe(mapper)
    expect(mapper.getSnapshot()).toEqual(history)
    expect(f.response.audioAnalysis).toBe(analysis)
    expect(f.response.syntheticAudioFrames).toBe(synthetic)
    expect(f.engine.setAudioResponseMode).not.toHaveBeenCalled()
    expect(f.engine.setAudioResponseConfig).not.toHaveBeenCalled()
    control.dispose()
  })

  it('clears Selective reactions from the previous song position when the parent audio epoch changes', async () => {
    const config = normalizeAudioResponseConfig({ version: 1,
      mappings: [{ target: 'size', source: 'bass-hit', amount: 1, attack: 0, release: 0.7 }] }).config
    const f = fixture(), control = await f.ready(customDocument({ visualizer: { shader: 'sphere(1);' },
      audioResponse: 'mapped-v1', audioResponseConfig: config }))
    // Use the installed engine receiver and mapper so the check observes an old
    // beat leaking into the new position, rather than just counting reset calls.
    f.engine.setExternalAudioFrame.mockImplementation(responseMethod('setExternalAudioFrame').bind(f.response))
    const mapper = f.response.audioMapper
    const pointer = { x: 0, y: 0, down: false }
    const audio = { audioTime: 1, legacyAmplitude: 0.4, playing: true, loaded: true,
      frame: { sequence: 1, time: 1, levels: { bass: 0.8, mid: 0, treble: 0, overall: 0.4 },
        hits: [{ band: 'bass' as const, time: 1, strength: 0.8 }] } }
    control.input({ time: 1, audioEpoch: 1, audio, pointer })
    expect(mapper.process(f.response.externalAudioFrames.splice(0), 1).size).toBeCloseTo(0.8)
    control.input({ time: 1.1, audioEpoch: 1, audio: { ...audio, audioTime: 1.1, frame: null }, pointer })
    expect(mapper.process(f.response.externalAudioFrames.splice(0), 1.1).size).toBeGreaterThan(0)

    // Seeking or replacing a playing track keeps the AudioContext clock moving
    // forward and can deliver silence before the first new analysis frame.
    control.input({ time: 1.2, audioEpoch: 2, audio: { ...audio, audioTime: 1.2, frame: null }, pointer })
    expect(mapper.process(f.response.externalAudioFrames.splice(0), 1.2).size).toBe(0)
    expect(mapper.getEvents()).toEqual([])
    expect(f.response.audioMapper).toBe(mapper)
    expect(f.response.getAudioResponseConfig()).toEqual(config)
    expect(f.response.externalAudio).toMatchObject({ playing: true, loaded: true, legacyAmplitude: 0.4 })
    expect(f.engine.setAudioResponseMode).not.toHaveBeenCalled()
    expect(f.engine.setAudioResponseConfig).not.toHaveBeenCalled()
    expect(f.engine.pause).not.toHaveBeenCalled()
    control.input({ time: 1.3, audioEpoch: 3, audio: { ...audio, audioTime: 1.3,
      frame: { ...audio.frame, sequence: 2, time: 1.3, hits: [{ band: 'bass', time: 1.3, strength: 0.6 }] } }, pointer })
    expect(mapper.process(f.response.externalAudioFrames.splice(0), 1.3).size).toBeCloseTo(0.6)
    control.dispose()
  })

  it('applies amount and sensitivity edits without reselecting the mode or replacing analysis/synthetic sessions', async () => {
    const f = fixture(), control = await f.ready(customDocument({ visualizer: { shader: 'sphere(1);' }, audioResponse: 'mapped-v1' }))
    const analysis = f.response.audioAnalysis, mapper = f.response.audioMapper, synthetic = f.response.syntheticAudioFrames
    for (const [amount, sensitivity] of [[0, 0.1], [0.1, 0.7], [2, 3]]) {
      const config = normalizeAudioResponseConfig({ version: 1, sensitivity,
        mappings: [{ target: 'size', source: 'bass-level', amount, attack: 0, release: 0.1 }] }).config
      control.audioResponse({ mode: 'mapped-v1', config })
      expect(f.response.getAudioResponseConfig()).toEqual(config)
      expect(f.response.audioMapper).toBe(mapper)
      expect(f.response.audioAnalysis).toBe(analysis)
      expect(f.response.syntheticAudioFrames).toBe(synthetic)
      expect(analysis.sensitivity).toBe(sensitivity)
      expect(mapper.process([{ sequence: 1, time: 1, levels: { bass: 0.5 }, hits: [] }], 1).size).toBeCloseTo(amount * 0.5)
    }
    expect(f.engine.setAudioResponseMode).not.toHaveBeenCalled()
    expect(f.engine.setAudioResponseConfig).toHaveBeenCalledTimes(3)
    control.dispose()
  })

  it('selects a changed mode before applying its config and ignores unchanged or disposed updates', async () => {
    const f = fixture(), control = await f.ready()
    const config = normalizeAudioResponseConfig({ version: 1, sensitivity: 2,
      mappings: [{ target: 'size', source: 'treble-level', amount: 0.08, attack: 0, release: 0.2 }] }).config
    control.audioResponse({ mode: 'mapped-v1', config })
    expect(f.response.getAudioResponseConfig()).toEqual(config)
    expect(f.engine.setAudioResponseMode.mock.invocationCallOrder[0]).toBeLessThan(f.engine.setAudioResponseConfig.mock.invocationCallOrder[0])
    control.audioResponse({ mode: 'mapped-v1', config: structuredClone(config) })
    expect(f.engine.setAudioResponseConfig).toHaveBeenCalledOnce()
    control.audioResponse({ mode: 'legacy', config: null })
    expect(f.response.audioResponseMode).toBe('legacy')
    expect(f.response.getAudioResponseConfig()).toBeNull()
    expect(f.engine.setAudioResponseConfig).toHaveBeenCalledOnce()
    control.audioResponse({ mode: 'mapped-v1', config })
    expect(f.response.getAudioResponseConfig()).toEqual(config)
    expect(f.engine.setAudioResponseMode).toHaveBeenCalledTimes(3)
    expect(f.engine.setAudioResponseConfig).toHaveBeenCalledTimes(2)
    control.dispose()
    control.audioResponse({ mode: 'legacy', config: null })
    expect(f.engine.setAudioResponseMode).toHaveBeenCalledTimes(3)
  })

  it('fails on real canvas context loss even when paused, and ignores disposal events', async () => {
    const f = fixture(), control = await f.ready()
    control.playback(false)
    f.canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(f.onError).toHaveBeenCalledOnce()
    expect(f.engine.dispose).toHaveBeenCalledOnce()
    f.canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(f.onError).toHaveBeenCalledOnce()
    const next = fixture(), nextControl = await next.ready()
    nextControl.dispose()
    next.canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(next.onError).not.toHaveBeenCalled()
  })

  it('cancels before allocation and rejects parent-only media', async () => {
    const f = fixture(); const loading = f.load(); f.abort.abort()
    await expect(loading).rejects.toThrow()
    await expect(f.load(customDocument({ visualizer: { shader: 'sphere(1);' }, audioPath: '/song.mp3' }))).rejects.toThrow()
    expect(initMAGE).not.toHaveBeenCalled()
  })

  it('resolves and validates template settings before allocating graphics', async () => {
    const f = fixture()
    const loading = f.load({ schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 })
    await vi.waitFor(() => expect(f.engine.loadCompiledPreset).toHaveBeenCalledOnce())
    expect(f.engine.loadCompiledPreset).toHaveBeenCalledWith(expect.objectContaining({ visualizer: expect.objectContaining({ shader: expect.any(String) }) }), compiledArtifact)
    f.emit('frame'); (await loading).dispose()
  })

  it('requires a frame after load, materializes optional effect defaults, and enforces the shared budget', async () => {
    const f = fixture(); let completed = false
    f.engine.start.mockImplementation(() => f.emit('frame'))
    const loading = f.load().then(value => { completed = true; return value })
    await vi.waitFor(() => expect(f.engine.loadCompiledPreset).toHaveBeenCalledOnce())
    expect(completed).toBe(false)
    expect(initMAGE).toHaveBeenCalledWith(expect.objectContaining({ pixelRatio: 1,
      renderBudget: expect.objectContaining({ maxRenderPixels: 230400, maxFramesPerSecond: 30 }) }))
    const preset = f.engine.loadCompiledPreset.mock.calls[0][0] as { fx: { passes: Record<string, boolean> } }
    expect(SCENE_POLICY.optionalEffectFlags.every(flag => preset.fx.passes[flag] === false)).toBe(true)
    f.emit('frame'); const control = await loading
    expect(f.onFrame).toHaveBeenCalledOnce()
    control.playback(false); expect(f.engine.pause).toHaveBeenCalledOnce()
    f.emit('error'); expect(f.onError).toHaveBeenCalledOnce(); expect(f.engine.dispose).toHaveBeenCalledOnce()
    control.dispose(); expect(f.engine.dispose).toHaveBeenCalledOnce()
  })

  it('forwards numeric clock/audio/input and ignores controls after disposal', async () => {
    const f = fixture(), control = await f.ready()
    vi.spyOn(f.canvas, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 400, height: 200 } as DOMRect)
    const audio = { frame: null, legacyAmplitude: 0.3, audioTime: 1, playing: true, loaded: true }
    control.input({ time: 2, audio, pointer: { x: 0.5, y: -0.5, down: true } })
    expect(f.engine.setExternalClock).toHaveBeenCalledWith({ time: 2, rate: 1, playing: true })
    expect(f.engine.setExternalAudioFrame).toHaveBeenLastCalledWith(audio)
    expect(f.engine.setInputState).toHaveBeenLastCalledWith(expect.objectContaining({ clientX: 310, clientY: 170, currPointerDown: 1 }))
    control.resize({ width: 600, height: 400, pixelRatio: 1.5 })
    expect(f.canvas.style.width).toBe('600px'); expect(f.canvas.style.height).toBe('400px')
    control.synthetic({ enabled: true, seed: 8, tempoScale: 1.2 })
    expect(f.engine.setSyntheticPreview).toHaveBeenCalledWith(true, 8, 1.2)
    f.abort.abort(); control.playback(true); expect(f.engine.play).toHaveBeenCalledOnce()
  })

  it('preserves authored animation speed and saved time, including while paused', async () => {
    const f = fixture()
    const loading = f.load(customDocument({ visualizer: { shader: 'sphere(1);' }, intent: { time_multiplier: 0.4 }, state: { time: 3 } }))
    await vi.waitFor(() => expect(f.engine.loadCompiledPreset).toHaveBeenCalledOnce())
    f.emit('frame'); const control = await loading
    expect(f.engine.setExternalClock).toHaveBeenLastCalledWith({ time: 3, rate: 0.4, playing: true })
    control.playback(false)
    control.input({ time: 10, audio: { frame: null, legacyAmplitude: 0, audioTime: 0, loaded: false, playing: false }, pointer: { x: 0, y: 0, down: false } })
    expect(f.engine.setExternalClock).toHaveBeenLastCalledWith({ time: 7, rate: 0.4, playing: false })
    control.dispose()
  })

  it('bounds captures and rejects wrong type, oversize or late data', async () => {
    const f = fixture(), control = await f.ready()
    const request = { width: 640, height: 640, type: 'image/png' as const, quality: 0.8 }
    const result = await control.capture(request)
    expect(f.engine.captureFramePreview).toHaveBeenCalledWith({ ...request, width: 480, height: 480 })
    expect(result.width * result.height).toBeLessThanOrEqual(230400)
    expect(result.width).toBe(10); expect(result.height).toBe(10)
    expect(new Uint8Array(result.bytes).slice(0, 4)).toEqual(new Uint8Array([137, 80, 78, 71]))
    f.engine.captureFramePreview.mockResolvedValue('data:image/jpeg;base64,AQID')
    await expect(control.capture(request)).rejects.toThrow()
    f.engine.captureFramePreview.mockResolvedValue(`data:image/png;base64,${'A'.repeat(1_500_000)}`)
    await expect(control.capture(request)).rejects.toThrow()
    let complete!: (value: string) => void
    f.engine.captureFramePreview.mockReturnValue(new Promise(resolve => { complete = resolve }))
    const pending = control.capture(request); f.abort.abort(); complete('data:image/png;base64,AQID')
    await expect(pending).rejects.toThrow()
  })

  it.each(['full', 'preview'] as const)('retains the host %s allocation budget and preview capture ceiling after compilation', async profile => {
    const previousDevicePixelRatio = window.devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
    try {
      const f = fixture(profile), control = await f.ready()
      expect(initMAGE).toHaveBeenCalledWith(expect.objectContaining({ pixelRatio: 1.5,
        renderBudget: { maxRenderPixels: profile === 'full' ? 2073600 : 230400,
          maxLongestEdge: profile === 'full' ? 1920 : 640, maxDevicePixelRatio: 1.5,
          maxFramesPerSecond: profile === 'full' ? 60 : 30, maxRaymarchIterations: 200 } }))
      control.resize({ width: 8192, height: 8192, pixelRatio: 1.5 })
      await control.capture({ width: 100000, height: 100000, type: 'image/png', quality: 1 })
      const [capture] = f.engine.captureFramePreview.mock.calls.at(-1)!
      expect(capture).toMatchObject({ type: 'image/png', quality: 1 })
      expect(capture.width).toBeGreaterThan(0)
      expect(capture.width).toBeLessThanOrEqual(480)
      expect(capture.height).toBe(capture.width)
      expect(capture.width * capture.height).toBeLessThanOrEqual(230400)
      expect(compileInWorker).toHaveBeenCalledOnce()
      control.dispose()
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: previousDevicePixelRatio })
    }
  })

  it('rejects failed compilation and synchronous startup failure, releasing resources', async () => {
    const f = fixture(); f.engine.loadCompiledPreset.mockReturnValue(undefined)
    await expect(f.load()).rejects.toThrow()
    expect(f.engine.dispose).toHaveBeenCalledOnce()
    const next = fixture(); next.engine.start.mockImplementation(() => next.emit('error'))
    await expect(next.load()).rejects.toThrow()
    expect(next.engine.loadCompiledPreset).not.toHaveBeenCalled()
    expect(next.engine.dispose).toHaveBeenCalledOnce()
  })
})

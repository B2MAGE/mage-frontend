import { customDocument } from '@shared/test/sceneDocument'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installPlaybackRuntime } from './playbackRuntime'
import { playbackMessage, type PlaybackPayloads, type PlaybackType } from '../modules/player/isolation/playbackProtocol'
import { PlaybackDownloadError, type PlaybackLoader, type PlaybackEngine } from './playbackEngine'
import { ShaderCompilationError } from './compiler/errors'
import { extractLiveSceneSettings } from '../modules/player/liveSceneSettings'
import type { AudioInspectorSnapshot } from '../modules/player/audioInspector'
import { SHADER_WORKLOAD_FAILURES } from '../modules/player/policy/shaderWorkloadFailure'

const origin = 'https://mage.peterbucci.com', session = '4b50667d-27d8-4634-93e8-3a795e110123'
const scene = customDocument({ visualizer: { shader: 'sphere(1);' } })
const input: PlaybackPayloads['input'] = { time: 1, audio: { frame: null, legacyAmplitude: 0, audioTime: 0, loaded: false, playing: false }, pointer: { x: 0, y: 0, down: false } }
const releases: (() => void)[] = []
afterEach(() => { releases.splice(0).forEach(fn => fn()); vi.restoreAllMocks(); vi.useRealTimers() })
function fixture() {
  const target = Object.assign(new EventTarget(), { parent: {} }) as unknown as Window
  const engine = { dispose: vi.fn(), resize: vi.fn(), input: vi.fn(), playback: vi.fn(), synthetic: vi.fn(), zoom: vi.fn(),
    initialPreparedScene: { activate: vi.fn(), discard: vi.fn() },
    prepareScene: vi.fn<NonNullable<PlaybackEngine['prepareScene']>>(async () => ({ activate: vi.fn(), discard: vi.fn() })),
    audioResponse: vi.fn(), sceneSettings: vi.fn(), capabilities: vi.fn(() => ({ supportedTargets: ['size' as const] })),
    audioInspector: vi.fn<() => AudioInspectorSnapshot | null>(() => null),
    graphicsDiagnostics: vi.fn<() => PlaybackPayloads['graphics-diagnostics-result']>(() => null),
    capture: vi.fn().mockResolvedValue({ bytes: new ArrayBuffer(12), type: 'image/png', width: 10, height: 10 }) }
  const loadScene = vi.fn<PlaybackLoader>().mockResolvedValue(engine)
  const statusElement = document.createElement('p')
  const container = document.createElement('div'), canvas = document.createElement('canvas')
  canvas.id = 'renderer-canvas'; canvas.style.width = '500px'
  container.append(canvas)
  const runtime = installPlaybackRuntime({ canvas, statusElement,
    allowedParentOrigins: [origin], targetWindow: target, loadScene })
  releases.push(runtime.dispose)
  const port = { postMessage: vi.fn(), start: vi.fn(), close: vi.fn(), onmessage: null as ((event: MessageEvent) => void) | null }
  const bootstrap = (overrides: Partial<MessageEventInit> = {}) => target.dispatchEvent(new MessageEvent('message', {
    data: playbackMessage('connect', session, 0, 0, { startupPhases: true, workloadErrors: true }), source: target.parent, origin, ports: [port as unknown as MessagePort], ...overrides }))
  let request = 0
  const send = <T extends PlaybackType>(type: T, payload: PlaybackPayloads[T], generation = 1, requestId = ++request) =>
    port.onmessage?.(new MessageEvent('message', { data: playbackMessage(type, session, generation, requestId, payload) }))
  const load = (generation = 1) => send('load', { scene, profile: 'preview' }, generation)
  const responses = (type: PlaybackType) => port.postMessage.mock.calls.map(call => call[0]).filter(message => message.type === type)
  return { target, port, engine, loadScene, runtime, statusElement, bootstrap, send, load, responses, container, canvas }
}

describe('isolated playback runtime', () => {
  const flush = async () => { for (let index = 0; index < 6; index++) await Promise.resolve() }
  const stagedConnect = () => playbackMessage('connect', session, 0, 0, { startupPhases: true, workloadErrors: true, stagedScenes: true })
  async function activeStaged() {
    const f = fixture(); f.bootstrap({ data: stagedConnect() }); f.load(); await flush(); f.send('activate', null)
    return f
  }

  it('prepares initial graphics without activating until the authorized parent acknowledges readiness', async () => {
    const f = fixture(); f.bootstrap({ data: stagedConnect() }); f.load(); await flush()
    expect(f.loadScene).toHaveBeenCalledOnce()
    expect(f.loadScene.mock.calls[0][0].deferActivation).toBe(true)
    expect(f.engine.initialPreparedScene.activate).not.toHaveBeenCalled()
    expect(f.responses('prepared')).toHaveLength(1); expect(f.responses('loaded')).toHaveLength(0)
    f.send('activate', null)
    expect(f.engine.initialPreparedScene.activate).toHaveBeenCalledOnce()
    expect(f.responses('loaded')).toHaveLength(1); expect(f.engine.dispose).not.toHaveBeenCalled()
  })

  it('replaces designs within one renderer while active progress remains separate from candidate readiness', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0)
    const f = await activeStaged(), active = f.loadScene.mock.calls[0][0]
    const replacement = { activate: vi.fn(), discard: vi.fn() }
    let finish!: (value: typeof replacement) => void
    f.engine.prepareScene.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    active.onFrame(); f.load(2)
    active.onFrame()
    expect(f.responses('progress')[0].generation).toBe(1)
    expect(f.responses('loaded')).toHaveLength(1)
    expect(f.engine.prepareScene).toHaveBeenCalledOnce(); expect(f.loadScene).toHaveBeenCalledOnce()
    expect(f.container.firstChild).toBe(f.canvas); expect(f.engine.dispose).not.toHaveBeenCalled()
    f.send('input', input, 1); expect(f.engine.input).toHaveBeenCalledWith(input)
    finish(replacement); await flush()
    expect(replacement.activate).not.toHaveBeenCalled()
    f.send('activate', null, 2)
    expect(replacement.activate).toHaveBeenCalledOnce()
    vi.spyOn(performance, 'now').mockReturnValue(1000); active.onFrame()
    expect(f.responses('progress').at(-1).generation).toBe(2)
    expect(f.responses('loaded').map(message => message.generation)).toEqual([1, 2])
    expect(f.engine.dispose).not.toHaveBeenCalled()
    f.runtime.dispose(); expect(f.engine.dispose).toHaveBeenCalledOnce()
  })

  it.each(['compile', 'first-frame', 'activation'] as const)('preserves the previous design after a candidate %s failure', async failure => {
    const f = await activeStaged()
    const prepared = { activate: vi.fn(), discard: vi.fn() }
    if (failure === 'activation') {
      prepared.activate.mockImplementation(() => { throw new Error('Atomic activation rejected.') })
      f.engine.prepareScene.mockResolvedValueOnce(prepared)
    } else f.engine.prepareScene.mockRejectedValueOnce(failure === 'compile' ? new ShaderCompilationError('failed') : new Error('First-use draw failed.'))
    f.load(2); await flush()
    if (failure === 'activation') f.send('activate', null, 2)
    expect(f.responses('candidate-error').at(-1).payload).toEqual({ code: failure === 'compile' ? 'compile' : 'graphics-startup', retained: true })
    expect(f.responses('error')).toHaveLength(0); expect(f.engine.dispose).not.toHaveBeenCalled(); expect(f.port.close).not.toHaveBeenCalled()
    f.send('playback', { playing: false }, 1); expect(f.engine.playback).toHaveBeenLastCalledWith(false)
    expect(f.engine.prepareScene).toHaveBeenCalledOnce()
  })

  it('cancels and discards obsolete candidates without touching the active scene or a newer candidate', async () => {
    const f = await activeStaged(), discarded = { activate: vi.fn(), discard: vi.fn() }
    let finish!: (value: typeof discarded) => void
    f.engine.prepareScene.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    f.load(2)
    const old = f.engine.prepareScene.mock.calls[0][0]
    f.send('cancel-load', null, 2)
    expect(old.signal.aborted).toBe(true)
    f.load(3); await flush()
    old.onPhase?.('graphics-startup')
    finish(discarded); await flush()
    expect(discarded.discard).toHaveBeenCalledOnce(); expect(discarded.activate).not.toHaveBeenCalled()
    expect(f.responses('candidate-error')).toHaveLength(0); expect(f.responses('error')).toHaveLength(0)
    f.send('activate', null, 3)
    expect(f.responses('loaded').map(message => message.generation)).toEqual([1, 3])
    expect(f.engine.dispose).not.toHaveBeenCalled()
  })

  it('retires an initial uncommitted renderer before reinitializing and ignores its delayed context events', async () => {
    const f = fixture(); f.bootstrap({ data: stagedConnect() }); f.load(); await flush()
    const old = f.loadScene.mock.calls[0][0]
    f.send('cancel-load', null)
    expect(f.engine.initialPreparedScene.discard).toHaveBeenCalledOnce()
    expect(f.engine.dispose).toHaveBeenCalledOnce()
    f.load(2); await flush()
    const next = f.loadScene.mock.calls[1][0]
    expect(next.canvas).not.toBe(old.canvas)
    expect(next.canvas.id).toBe('renderer-canvas'); expect(next.canvas.style.width).toBe('500px')
    expect(f.container.firstChild).toBe(next.canvas)
    const nextContextLost = vi.fn(() => next.onError('context-lost'))
    next.canvas.addEventListener('webglcontextlost', nextContextLost)
    old.canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(nextContextLost).not.toHaveBeenCalled()
    old.onError('context-lost'); old.onFrame()
    expect(f.loadScene).toHaveBeenCalledTimes(2); expect(f.engine.prepareScene).not.toHaveBeenCalled()
    expect(f.responses('error')).toHaveLength(0)
    f.send('activate', null, 2)
    expect(f.responses('loaded').map(message => message.generation)).toEqual([2])
  })

  it('keeps the session context-loss callback alive while replacements prepare', async () => {
    const f = await activeStaged()
    f.engine.prepareScene.mockReturnValueOnce(new Promise(() => {}))
    f.load(2)
    f.loadScene.mock.calls[0][0].onError('context-lost')
    expect(f.responses('error').at(-1)).toMatchObject({ generation: 1, payload: { code: 'context-lost' } })
    expect(f.engine.dispose).toHaveBeenCalledOnce(); expect(f.port.close).toHaveBeenCalledOnce()
  })

  it('preserves current pause and input intent at activation without reapplying old authored settings', async () => {
    const f = await activeStaged()
    f.send('input', input, 1)
    f.send('audio-response', { mode: 'legacy', config: null }, 1)
    f.send('scene-settings', extractLiveSceneSettings(scene), 1)
    f.send('synthetic', { enabled: true, seed: 7, tempoScale: 1 }, 1)
    f.load(2); await flush()
    f.send('playback', { playing: false }, 1)
    f.engine.audioResponse.mockClear(); f.engine.sceneSettings.mockClear()
    f.send('activate', null, 2)
    expect(f.engine.playback).toHaveBeenLastCalledWith(false)
    expect(f.engine.synthetic).toHaveBeenLastCalledWith({ enabled: true, seed: 7, tempoScale: 1 })
    expect(f.engine.input).toHaveBeenLastCalledWith(input)
    expect(f.engine.audioResponse).not.toHaveBeenCalled(); expect(f.engine.sceneSettings).not.toHaveBeenCalled()
  })

  it('reads graphics counters only when requested, bounds reads and preserves input/rendering', async () => {
    const f = fixture(); f.bootstrap(); f.load(); await Promise.resolve()
    const measured = { contextsCreated: 1, contextsDisposed: 0, firstFrameMs: 20.5, geometries: 2, textures: 4, programs: 2 }
    f.engine.graphicsDiagnostics.mockReturnValue(measured)
    expect(f.engine.graphicsDiagnostics).not.toHaveBeenCalled()
    for (let index = 0; index < 5; index++) f.send('graphics-diagnostics', null)
    expect(f.engine.graphicsDiagnostics).toHaveBeenCalledTimes(2)
    expect(f.responses('graphics-diagnostics-result').map(message => message.payload)).toEqual([measured, measured])
    f.send('input', input)
    expect(f.engine.input).toHaveBeenCalledWith(input)
    expect(f.responses('error')).toHaveLength(0); expect(f.engine.dispose).not.toHaveBeenCalled()
  })

  it.each(['absent', 'throwing', 'invalid'] as const)('returns null for %s graphics measurements without stopping playback', async availability => {
    const f = fixture(); f.bootstrap(); f.load(); await Promise.resolve()
    if (availability === 'absent') Reflect.deleteProperty(f.engine, 'graphicsDiagnostics')
    if (availability === 'throwing') f.engine.graphicsDiagnostics.mockImplementation(() => { throw new Error('Private WebGL details') })
    if (availability === 'invalid') f.engine.graphicsDiagnostics.mockReturnValue({ contextsCreated: 1, contextsDisposed: 0,
      firstFrameMs: 20, geometries: 1, textures: 1, programs: 1, source: 'private shader source' } as PlaybackPayloads['graphics-diagnostics-result'])
    f.send('graphics-diagnostics', null)
    expect(f.responses('graphics-diagnostics-result')[0].payload).toBeNull()
    expect(JSON.stringify(f.port.postMessage.mock.calls)).not.toContain('private')
    f.send('playback', { playing: false })
    expect(f.engine.playback).toHaveBeenLastCalledWith(false)
    expect(f.responses('error')).toHaveLength(0); expect(f.engine.dispose).not.toHaveBeenCalled()
  })

  it('keeps playback alive when capability metadata throws', async () => {
    const f = fixture(); f.bootstrap(); f.load(); await Promise.resolve()
    f.engine.capabilities.mockImplementation(() => { throw new Error('optional metadata unavailable') })
    f.send('capabilities', null)
    expect(f.responses('capabilities-result')[0].payload).toEqual({ supportedTargets: [] })
    f.send('input', input)
    expect(f.engine.input).toHaveBeenCalledWith(input)
    expect(f.engine.dispose).not.toHaveBeenCalled()
  })

  it('cancels an obsolete load before the next source is dispatched and ignores its late errors', async () => {
    const f = fixture()
    let reject!: (error: Error) => void
    f.loadScene.mockReturnValueOnce(new Promise((_, no) => { reject = no }))
    f.bootstrap(); f.load()
    const old = f.loadScene.mock.calls[0][0]
    f.send('cancel-load', null)
    expect(old.signal.aborted).toBe(true)
    old.onError('context-lost')
    reject(new Error('late failure'))
    await Promise.resolve(); await Promise.resolve()
    expect(f.responses('error')).toEqual([])
    f.load(3); await Promise.resolve()
    expect(f.responses('loaded').map(message => message.generation)).toEqual([3])
    expect(f.port.close).not.toHaveBeenCalled()
  })

  it('ignores cancellation after a scene has activated', async () => {
    const f = fixture(); f.bootstrap(); f.load(); await Promise.resolve()
    f.send('cancel-load', null)
    expect(f.loadScene.mock.calls[0][0].signal.aborted).toBe(false)
    expect(f.engine.dispose).not.toHaveBeenCalled()
  })
  it.each(SHADER_WORKLOAD_FAILURES)('reports only the bounded %s code for compiler and engine rejection', async failure => {
    const f = fixture(), error = new ShaderCompilationError(failure)
    error.message = 'private shader source and stack'
    f.loadScene.mockRejectedValueOnce(error)
    f.bootstrap(); f.load(); await Promise.resolve(); await Promise.resolve()
    expect(f.responses('error').map(message => message.payload)).toEqual([{ code: failure }])
    expect(JSON.stringify(f.port.postMessage.mock.calls)).not.toContain('private shader')
    expect(f.port.close).toHaveBeenCalledOnce()
    expect(f.engine.playback).not.toHaveBeenCalled()
  })

  it.each([null, { startupPhases: true }])('keeps existing parents on their supported compile error when their opt-in is %j', async payload => {
    const f = fixture()
    f.loadScene.mockRejectedValueOnce(new ShaderCompilationError('shader-workload-expanded-cost'))
    f.bootstrap({ data: playbackMessage('connect', session, 0, 0, payload as PlaybackPayloads['connect']) })
    f.load(); await Promise.resolve(); await Promise.resolve()
    expect(f.responses('error').map(message => message.payload)).toEqual([{ code: 'compile' }])
  })

  it('classifies an independently thrown engine workload limit without transmitting its arbitrary message', async () => {
    const f = fixture()
    f.loadScene.mockRejectedValueOnce(Object.assign(new Error('private engine detail'), {
      code: 'shader-workload-limit', limit: 'fragment-cost', actual: 9999999, maximum: 2,
    }))
    f.bootstrap(); f.load(); await Promise.resolve(); await Promise.resolve()
    expect(f.responses('error').map(message => message.payload)).toEqual([{ code: 'shader-workload-fragment-cost' }])
  })

  it('only reads inspector data on request, bounds reads and keeps observer errors out of playback recovery', async () => {
    const f = fixture(); f.bootstrap(); f.load(); await Promise.resolve()
    expect(f.engine.audioInspector).not.toHaveBeenCalled()
    for (let index = 0; index < 8; index++) f.send('audio-inspector', null)
    expect(f.engine.audioInspector).toHaveBeenCalledTimes(5)
    expect(f.responses('audio-inspector-result')).toHaveLength(5)
    expect(f.responses('error')).toHaveLength(0)
    expect(f.engine.dispose).not.toHaveBeenCalled()
  })

  it('answers unavailable readings with null while playback remains usable', async () => {
    const f = fixture(); f.bootstrap(); f.load(); await Promise.resolve()
    f.engine.audioInspector.mockImplementation(() => { throw new Error('Unavailable observation') })
    f.send('audio-inspector', null)
    expect(f.responses('audio-inspector-result')[0].payload).toBeNull()
    expect(f.responses('error')).toHaveLength(0)
    f.send('playback', { playing: false })
    expect(f.engine.playback).toHaveBeenLastCalledWith(false)
  })
  it('keeps an existing v2 parent playing without sending newly introduced phase responses', async () => {
    const f = fixture()
    f.loadScene.mockImplementation(async options => {
      for (const phase of ['compiler-download', 'compiler-startup', 'compiling', 'graphics-download', 'graphics-startup'] as const) options.onPhase?.(phase)
      options.onFrame()
      return f.engine
    })
    f.bootstrap({ data: playbackMessage('connect', session, 0, 0, null) })
    f.load(); await Promise.resolve()
    f.send('playback', { playing: false }); f.send('capabilities', null)
    f.send('capture', { width: 10, height: 10, type: 'image/png', quality: 0.9 }); await Promise.resolve()
    // Frozen response vocabulary of the deployed pre-PL-01 v2 parent. That
    // parent disposes the frame immediately for any response outside this set.
    const legacyTypes = ['ready', 'loaded', 'captured', 'capabilities-result', 'progress', 'error']
    for (const [message] of f.port.postMessage.mock.calls) {
      expect(message.version).toBe(2)
      expect(Object.keys(message).sort()).toEqual(['generation', 'payload', 'protocol', 'requestId', 'session', 'type', 'version'])
      expect(legacyTypes).toContain(message.type)
    }
    expect(f.responses('load-phase')).toEqual([])
    expect(f.responses('loaded')).toHaveLength(1)
    expect(f.responses('captured')).toHaveLength(1)
    expect(f.responses('capabilities-result')).toHaveLength(1)
    expect(f.engine.playback).toHaveBeenLastCalledWith(false)
    expect(f.port.close).not.toHaveBeenCalled()
  })

  it.each([
    ['compiler-download', 'compile'], ['graphics-download', 'render'], ['startup', 'compile'],
    ['timeout', 'compile'], ['invalid-output', 'compile'], ['interrupted', 'compile'],
    ['graphics-startup', 'render'], ['context-lost', 'render'],
  ] as const)('maps %s to the original %s error for an existing parent', async (failure, expected) => {
    const f = fixture()
    f.loadScene.mockImplementation(async options => {
      if (failure === 'compiler-download' || failure === 'graphics-download') throw new PlaybackDownloadError(failure)
      if (failure === 'graphics-startup') { options.onPhase?.('graphics-startup'); throw new Error('Private detail') }
      if (failure === 'context-lost') { options.onError('context-lost'); return f.engine }
      throw new ShaderCompilationError(failure)
    })
    f.bootstrap({ data: playbackMessage('connect', session, 0, 0, null) })
    f.load(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(f.responses('load-phase')).toEqual([])
    expect(f.responses('error').map(message => message.payload)).toEqual([{ code: expected }])
    expect(f.port.close).toHaveBeenCalledOnce()
  })

  it('distinguishes graphics setup rejection from runtime rendering failure', async () => {
    const f = fixture()
    f.loadScene.mockImplementationOnce(async options => {
      options.onPhase?.('graphics-startup')
      throw new Error('Private WebGL details')
    })
    f.bootstrap(); f.load(); await Promise.resolve(); await Promise.resolve()
    expect(f.responses('error').map(message => message.payload.code)).toEqual(['graphics-startup'])
    expect(JSON.stringify(f.port.postMessage.mock.calls)).not.toContain('Private WebGL details')
  })
  it.each(['compiler-download', 'graphics-download', 'startup', 'timeout', 'invalid-output'] as const)(
    'preserves fixed %s failure classification without exposing diagnostics', async code => {
      const f = fixture()
      f.loadScene.mockRejectedValueOnce(code.endsWith('download')
        ? new PlaybackDownloadError(code as 'compiler-download' | 'graphics-download')
        : new ShaderCompilationError(code as 'startup' | 'timeout' | 'invalid-output'))
      f.bootstrap(); f.load(); await Promise.resolve(); await Promise.resolve()
      expect(f.responses('error').map(message => message.payload.code)).toEqual([
        code === 'startup' ? 'compiler-startup' : code === 'timeout' ? 'compile-timeout' : code])
    })

  it('waits for visibility before allocating a loader and preserves a requested pause', async () => {
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const f = fixture(); f.bootstrap(); f.load(); f.send('playback', { playing: false })
    expect(f.loadScene).not.toHaveBeenCalled()
    expect(f.responses('load-phase')[0].payload).toEqual({ phase: 'waiting-visible', attempt: 0 })
    hidden.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve(); await Promise.resolve()
    expect(f.loadScene).toHaveBeenCalledOnce()
    expect(f.engine.playback).toHaveBeenLastCalledWith(false)
  })

  it('restarts one hidden compiler interruption inside the same pending load, retaining pause', async () => {
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const f = fixture()
    let reject!: (error: Error) => void
    f.loadScene.mockReturnValueOnce(new Promise((_resolve, no) => { reject = no }))
    f.bootstrap(); f.load(7); f.send('playback', { playing: false }, 7)
    hidden.mockReturnValue('hidden'); reject(new ShaderCompilationError('interrupted'))
    await Promise.resolve(); await Promise.resolve()
    expect(f.loadScene).toHaveBeenCalledOnce(); expect(f.responses('error')).toEqual([])
    hidden.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve(); await Promise.resolve()
    expect(f.loadScene.mock.calls.map(([options]) => options.sceneRevision)).toEqual([7, 7])
    expect(f.engine.playback).toHaveBeenLastCalledWith(false)
    expect(f.responses('loaded')).toHaveLength(1)
  })

  it.each(['dispose', 'replace'] as const)('cancels a hidden pending restart on %s', async action => {
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const f = fixture()
    f.loadScene.mockImplementationOnce(() => {
      hidden.mockReturnValue('hidden')
      return Promise.reject(new ShaderCompilationError('interrupted'))
    })
    f.bootstrap(); f.load(1); await Promise.resolve(); await Promise.resolve()
    if (action === 'dispose') f.runtime.dispose(); else f.load(2)
    hidden.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(f.loadScene.mock.calls.map(([options]) => options.sceneRevision)).toEqual(action === 'dispose' ? [1] : [1, 2])
    expect(f.responses('loaded').map(message => message.generation)).toEqual(action === 'dispose' ? [] : [2])
    expect(f.responses('error')).toEqual([])
  })

  it('does not loop when the single visibility restart is interrupted again', async () => {
    const f = fixture()
    f.loadScene.mockRejectedValue(new ShaderCompilationError('interrupted'))
    f.bootstrap(); f.load(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(f.loadScene).toHaveBeenCalledTimes(2)
    expect(f.responses('error').map(message => message.payload.code)).toEqual(['interrupted'])
  })
  it('retains the latest startup settings and preserves desired pause without reloading', async () => {
    const f = fixture(), settings = extractLiveSceneSettings(scene)
    let complete!: (engine: typeof f.engine) => void
    f.loadScene.mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
    f.bootstrap(); f.load()
    f.send('scene-settings', settings)
    const latest = { ...settings, intent: { ...settings.intent, fov: 80 } }
    f.send('scene-settings', latest); f.send('playback', { playing: false })
    expect(f.engine.sceneSettings).not.toHaveBeenCalled()
    complete(f.engine); await Promise.resolve()
    expect(f.engine.sceneSettings).toHaveBeenCalledExactlyOnceWith(latest)
    expect(f.engine.playback).toHaveBeenLastCalledWith(false)
    f.send('scene-settings', settings)
    expect(f.engine.sceneSettings).toHaveBeenLastCalledWith(settings)
    expect(f.engine.playback).toHaveBeenCalledOnce(); expect(f.loadScene).toHaveBeenCalledOnce()
  })
  it('drops pending settings when a scene is replaced and ignores late old-generation edits', async () => {
    const f = fixture(), settings = extractLiveSceneSettings(scene)
    f.loadScene.mockReturnValueOnce(new Promise(() => {}))
    f.bootstrap(); f.load(); f.send('scene-settings', settings)
    f.load(2); await Promise.resolve()
    f.send('scene-settings', settings, 1)
    expect(f.engine.sceneSettings).not.toHaveBeenCalled()
    f.send('scene-settings', settings, 2)
    expect(f.engine.sceneSettings).toHaveBeenCalledExactlyOnceWith(settings)
  })
  it('rejects malformed settings before any engine mutation', async () => {
    const f = fixture(), settings = extractLiveSceneSettings(scene)
    f.bootstrap(); f.load(); await Promise.resolve()
    f.send('scene-settings', { ...settings, visualizer: { ...settings.visualizer, shader: 'sphere(2);' } } as typeof settings)
    expect(f.engine.sceneSettings).not.toHaveBeenCalled()
    expect(f.responses('error').at(-1).payload).toEqual({ code: 'protocol' })
    expect(f.port.close).toHaveBeenCalledOnce()
  })
  it('reports only the fixed compile code and closes after a compiler-policy rejection', async () => {
    const f = fixture()
    const rejected = new ShaderCompilationError()
    rejected.message = 'private source and compiler diagnostics must not leave the child'
    f.loadScene.mockRejectedValueOnce(rejected)
    f.bootstrap(); f.load(7); await Promise.resolve()
    expect(f.loadScene.mock.calls[0][0].sceneRevision).toBe(7)
    expect(f.responses('error')).toEqual([playbackMessage('error', session, 7, 1, { code: 'compile' })])
    expect(f.responses('loaded')).toEqual([])
    expect(f.port.close).toHaveBeenCalledOnce()
    expect(f.loadScene.mock.calls[0][0].signal.aborted).toBe(true)
    expect(f.statusElement.textContent).toBe('This scene could not be displayed.')
    expect(JSON.stringify(f.port.postMessage.mock.calls)).not.toContain(rejected.message)
    f.load(8); await Promise.resolve()
    expect(f.loadScene).toHaveBeenCalledOnce()
  })

  it('does not treat arbitrary loader errors or a forged error name as compiler rejection', async () => {
    const f = fixture()
    const error = new Error('private renderer error')
    error.name = 'ShaderCompilationError'
    f.loadScene.mockRejectedValueOnce(error)
    f.bootstrap(); f.load(); await Promise.resolve()
    expect(f.responses('error').map(message => message.payload)).toEqual([{ code: 'render' }])
    expect(JSON.stringify(f.port.postMessage.mock.calls)).not.toContain(error.message)
  })

  it('ignores a late compiler rejection from an aborted scene revision', async () => {
    const f = fixture()
    let reject!: (error: Error) => void
    f.loadScene.mockReturnValueOnce(new Promise((_resolve, no) => { reject = no }))
    f.bootstrap(); f.load(1)
    f.load(2); await Promise.resolve()
    reject(new ShaderCompilationError()); await Promise.resolve()
    expect(f.loadScene.mock.calls.map(([options]) => options.sceneRevision)).toEqual([1, 2])
    expect(f.responses('error')).toEqual([])
    expect(f.responses('loaded').map(message => message.generation)).toEqual([2])
    expect(f.port.close).not.toHaveBeenCalled()
  })

  it('changes music response without reloading and returns capabilities only when requested', async () => {
    const f = fixture()
    f.bootstrap(); f.load(); await Promise.resolve()
    expect(f.responses('capabilities-result')).toHaveLength(0)
    const settings = { mode: 'mapped-v1' as const, config: { version: 1 as const, sensitivity: 2, mappings: [] } }
    f.send('audio-response', settings)
    f.send('capabilities', null)
    expect(f.engine.audioResponse).toHaveBeenCalledExactlyOnceWith(settings)
    expect(f.loadScene).toHaveBeenCalledOnce()
    expect(f.responses('capabilities-result')[0].payload).toEqual({ supportedTargets: ['size'] })
  })
  it.each(['source', 'origin', 'port', 'schema'])('ignores unauthorized %s without allocating an engine', invalid => {
    const f = fixture()
    f.bootstrap(invalid === 'source' ? { source: {} as Window } : invalid === 'origin' ? { origin: 'null' }
      : invalid === 'port' ? { ports: [] } : { data: { ...playbackMessage('connect', session, 0, 0, null), url: '/api' } })
    expect(f.port.start).not.toHaveBeenCalled(); expect(f.loadScene).not.toHaveBeenCalled()
  })

  it('retains only latest inputs and desired playback during startup', async () => {
    const f = fixture()
    let complete!: (engine: typeof f.engine) => void
    f.loadScene.mockReturnValue(new Promise(resolve => { complete = resolve }))
    f.bootstrap(); f.load()
    f.send('input', input); f.send('input', { ...input, time: 2 })
    f.send('resize', { width: 500, height: 300, pixelRatio: 1.5 })
    f.send('synthetic', { enabled: true, seed: 7, tempoScale: 1 })
    f.send('zoom', { factor: 1.6 })
    f.send('playback', { playing: true })
    expect(f.engine.input).not.toHaveBeenCalled()
    complete(f.engine); await Promise.resolve()
    expect(f.engine.input).toHaveBeenCalledOnce()
    expect(f.engine.input).toHaveBeenCalledWith({ ...input, time: 2 })
    expect(f.engine.playback).toHaveBeenCalledWith(true)
    expect(f.engine.resize).toHaveBeenCalledWith({ width: 500, height: 300, pixelRatio: 1.5 })
    expect(f.engine.synthetic).toHaveBeenCalledWith({ enabled: true, seed: 7, tempoScale: 1 })
    expect(f.engine.zoom).toHaveBeenCalledWith(1.6)
    expect(f.responses('loaded')).toHaveLength(1)
  })

  it('aborts replaced loads and ignores their eventual success and failures', async () => {
    const f = fixture()
    let complete!: (engine: typeof f.engine) => void
    f.loadScene.mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
    f.bootstrap(); f.load()
    const first = f.loadScene.mock.calls[0][0]
    f.load(2); await Promise.resolve()
    expect(first.signal.aborted).toBe(true)
    first.onFrame(); first.onError(); complete(f.engine); await Promise.resolve()
    expect(f.responses('loaded').map(message => message.generation)).toEqual([2])
    expect(f.responses('error')).toEqual([])
    expect(f.responses('progress')).toEqual([])
  })

  it('replaces the canvas before a new scene so delayed old context loss cannot stop it', async () => {
    const f = fixture()
    f.loadScene.mockImplementation(async options => {
      // WebGL listeners are bound to the canvas. Old renderer disposal may lose
      // that context after the next scene has already begun loading.
      options.canvas.addEventListener('webglcontextlost', () => options.onError('context-lost'))
      return { ...f.engine, dispose: vi.fn() }
    })
    f.bootstrap(); f.load(); await Promise.resolve()
    const first = f.loadScene.mock.calls[0][0]
    f.load(2); await Promise.resolve()
    const second = f.loadScene.mock.calls[1][0]
    expect(first.signal.aborted).toBe(true)
    expect(second.canvas).not.toBe(first.canvas)
    expect(second.canvas.id).toBe('renderer-canvas')
    expect(second.canvas.style.width).toBe('500px')
    expect(f.container.children).toHaveLength(1)
    expect(f.container.firstElementChild).toBe(second.canvas)
    first.canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(f.port.close).not.toHaveBeenCalled()
    expect(f.responses('error')).toEqual([])
    expect(f.responses('loaded').map(message => message.generation)).toEqual([1, 2])
    second.canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(f.port.close).toHaveBeenCalledOnce()
  })

  it('ignores stale generations, request IDs, and sessions', async () => {
    const f = fixture(); f.bootstrap(); f.load(); await Promise.resolve()
    f.send('input', input, 1, 8)
    f.send('input', { ...input, time: 2 }, 1, 7)
    f.send('input', input, 0, 9)
    f.port.onmessage?.(new MessageEvent('message', { data: playbackMessage('input', '1'.repeat(32), 1, 10, input) }))
    expect(f.engine.input).toHaveBeenCalledOnce()
    f.send('dispose', null, 1, 9)
    expect(f.engine.dispose).toHaveBeenCalledOnce()
    expect(f.port.close).toHaveBeenCalledOnce()
  })

  it('reports actual completed frames at most twice per second with request ID zero', async () => {
    const f = fixture(); f.bootstrap(); f.load(); await Promise.resolve()
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const frame = f.loadScene.mock.calls[0][0].onFrame
    for (let i = 0; i < 100; i++) frame()
    clock.mockReturnValue(1499); frame(); clock.mockReturnValue(1500); frame()
    expect(f.responses('progress').map(message => [message.requestId, message.payload.frames])).toEqual([[0, 1], [0, 102]])
  })

  it('transfers bounded raster bytes and suppresses late capture after a new generation', async () => {
    const f = fixture(); f.bootstrap(); f.load(); await Promise.resolve()
    f.send('capture', { width: 10, height: 10, quality: 0.8, type: 'image/png' })
    await vi.waitFor(() => expect(f.responses('captured')).toHaveLength(1))
    const captured = f.responses('captured')[0]
    expect(f.port.postMessage).toHaveBeenCalledWith(captured, [captured.payload.bytes])
    let complete!: (value: PlaybackPayloads['captured']) => void
    f.engine.capture.mockReturnValue(new Promise(resolve => { complete = resolve }))
    f.send('capture', { width: 10, height: 10, quality: 0.8, type: 'image/png' })
    f.load(2); await Promise.resolve()
    complete({ bytes: new ArrayBuffer(12), type: 'image/png', width: 10, height: 10 })
    await Promise.resolve(); await Promise.resolve()
    expect(f.responses('captured')).toHaveLength(1)
  })

  it('does not queue simultaneous captures and reports timeout without raw errors', async () => {
    vi.useFakeTimers()
    const f = fixture(); f.bootstrap(); f.load(); await Promise.resolve()
    f.engine.capture.mockReturnValue(new Promise(() => {}))
    f.send('capture', { width: 10, height: 10, quality: 0.8, type: 'image/png' })
    f.send('capture', { width: 10, height: 10, quality: 0.8, type: 'image/png' })
    expect(f.engine.capture).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(5001)
    expect(f.responses('error')).toHaveLength(2)
    expect(f.responses('error').map(message => message.payload)).toEqual([{ code: 'capture' }, { code: 'capture' }])
    expect(f.port.close).not.toHaveBeenCalled()
    f.send('input', input)
    expect(f.engine.input).toHaveBeenCalledWith(input)
    f.send('capture', { width: 10, height: 10, quality: 0.8, type: 'image/png' })
    expect(f.engine.capture).toHaveBeenCalledOnce()
  })

  it('captures a replacement scene without waiting for an abandoned capture to finish', async () => {
    const f = fixture(); f.bootstrap(); f.load(); await Promise.resolve()
    f.engine.capture.mockReturnValueOnce(new Promise(() => {}))
    const request = { width: 10, height: 10, quality: 0.8, type: 'image/png' as const }
    f.send('capture', request)
    f.load(2); await Promise.resolve()
    f.send('capture', request, 2)
    await Promise.resolve()
    expect(f.engine.capture).toHaveBeenCalledTimes(2)
    expect(f.responses('captured').map(message => message.generation)).toEqual([2])
    expect(f.responses('error')).toEqual([])
    expect(f.port.close).not.toHaveBeenCalled()
  })

  it('does not let stale capture completion release or cancel the current capture', async () => {
    vi.useFakeTimers()
    const f = fixture(); f.bootstrap(); f.load(); await Promise.resolve()
    let completeOld!: (value: PlaybackPayloads['captured']) => void
    f.engine.capture.mockReturnValueOnce(new Promise(resolve => { completeOld = resolve }))
    const request = { width: 10, height: 10, quality: 0.8, type: 'image/png' as const }
    f.send('capture', request)
    await vi.advanceTimersByTimeAsync(1001)
    f.load(2); await Promise.resolve()
    f.engine.capture.mockReturnValueOnce(new Promise(() => {}))
    f.send('capture', request, 2)
    completeOld({ bytes: new ArrayBuffer(12), type: 'image/png', width: 10, height: 10 })
    await Promise.resolve()
    f.send('capture', request, 2)
    expect(f.engine.capture).toHaveBeenCalledTimes(2)
    expect(f.responses('captured')).toEqual([])
    expect(f.responses('error').map(message => message.payload)).toEqual([{ code: 'capture' }])
    await vi.advanceTimersByTimeAsync(5001)
    expect(f.responses('error').map(message => message.payload)).toEqual([{ code: 'capture' }, { code: 'capture' }])
    expect(f.port.close).not.toHaveBeenCalled()
  })

  it('fails closed on malformed and excessive scene commands', async () => {
    const f = fixture(); f.bootstrap()
    f.send('load', { scene: { ...scene, audioPath: 'https://example.com/song.mp3' }, profile: 'full' })
    expect(f.loadScene).not.toHaveBeenCalled()
    expect(f.port.close).toHaveBeenCalledOnce()
    const next = fixture(); next.bootstrap()
    for (let i = 1; i <= 5; i++) next.load(i)
    await Promise.resolve()
    expect(next.loadScene).toHaveBeenCalledTimes(4)
    expect(next.port.close).toHaveBeenCalledOnce()
  })
})

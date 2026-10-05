import { afterEach, describe, expect, it, vi } from 'vitest'
import { installPlaybackRuntime } from './playbackRuntime'
import { playbackMessage, type PlaybackPayloads, type PlaybackType } from '../modules/player/isolation/playbackProtocol'
import type { PlaybackLoader } from './playbackEngine'
import { ShaderCompilationError } from './compiler/errors'
import { extractLiveSceneSettings } from '../modules/player/liveSceneSettings'

const origin = 'https://mage.peterbucci.com', session = '4b50667d-27d8-4634-93e8-3a795e110123'
const scene = { visualizer: { shader: 'sphere(1);' } }
const input: PlaybackPayloads['input'] = { time: 1, audio: { frame: null, legacyAmplitude: 0, audioTime: 0, loaded: false, playing: false }, pointer: { x: 0, y: 0, down: false } }
const releases: (() => void)[] = []
afterEach(() => { releases.splice(0).forEach(fn => fn()); vi.restoreAllMocks(); vi.useRealTimers() })
function fixture() {
  const target = Object.assign(new EventTarget(), { parent: {} }) as unknown as Window
  const engine = { dispose: vi.fn(), resize: vi.fn(), input: vi.fn(), playback: vi.fn(), synthetic: vi.fn(), zoom: vi.fn(),
    audioResponse: vi.fn(), sceneSettings: vi.fn(), capabilities: vi.fn(() => ({ supportedTargets: ['size' as const] })),
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
    data: playbackMessage('connect', session, 0, 0, null), source: target.parent, origin, ports: [port as unknown as MessagePort], ...overrides }))
  let request = 0
  const send = <T extends PlaybackType>(type: T, payload: PlaybackPayloads[T], generation = 1, requestId = ++request) =>
    port.onmessage?.(new MessageEvent('message', { data: playbackMessage(type, session, generation, requestId, payload) }))
  const load = (generation = 1) => send('load', { scene, profile: 'preview' }, generation)
  const responses = (type: PlaybackType) => port.postMessage.mock.calls.map(call => call[0]).filter(message => message.type === type)
  return { target, port, engine, loadScene, runtime, statusElement, bootstrap, send, load, responses, container, canvas }
}

describe('isolated playback runtime', () => {
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
      options.canvas.addEventListener('webglcontextlost', options.onError)
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
    expect(f.responses('error').map(message => message.payload)).toEqual([{ code: 'capture' }, { code: 'render' }])
    expect(f.port.close).toHaveBeenCalledOnce()
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
    expect(f.responses('error').map(message => message.payload)).toEqual([{ code: 'capture' }, { code: 'render' }])
    expect(f.port.close).toHaveBeenCalledOnce()
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

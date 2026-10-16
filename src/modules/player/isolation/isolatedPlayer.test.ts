import { customDocument } from '@shared/test/sceneDocument'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIsolatedPlayer, type IsolatedPlayer } from './isolatedPlayer'
import type { ParentAudioSession } from './parentAudio'
import type { createIsolatedPlaybackHost, IsolatedPlaybackHost } from './playbackHost'
import type { GraphicsDiagnostics } from './playbackProtocol'
import { extractLiveSceneSettings } from '../liveSceneSettings'
import type { AudioInspectorSnapshot, AudioInspectorSpectrum } from '../audioInspector'
import { SceneReplacementError } from './sceneReplacement'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const scene = customDocument({ visualizer: { shader: 'sphere(0.5);' } })
const players: IsolatedPlayer[] = []
const observers: Array<{ callback: ResizeObserverCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = []

function fixture(wheelZoom = false, pointerInteractions = true) {
  const container = document.createElement('div')
  document.body.append(container)
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 400, 200))
  const state = { loaded: false, playing: false, time: 0, duration: 120, volume: 1 }
  const audio = {
    load: vi.fn<ParentAudioSession['load']>(async (_source, _signal, options) => {
      await options?.beforeCommit?.()
      state.loaded = true
      state.playing = options?.shouldPlay?.() ?? state.playing
    }),
    play: vi.fn<ParentAudioSession['play']>(async () => { state.playing = state.loaded }),
    pause: vi.fn(() => { state.playing = false }),
    seek: vi.fn((time: number) => { state.time = time }),
    setVolume: vi.fn((volume: number) => { state.volume = volume }),
    setSensitivity: vi.fn(),
    setSpectrumEnabled: vi.fn(),
    spectrum: vi.fn<() => AudioInspectorSpectrum | null>(() => null),
    getState: vi.fn(() => ({ ...state })),
    sample: vi.fn(() => ({ frame: null, legacyAmplitude: 0, audioTime: state.time, loaded: state.loaded, playing: state.playing })),
    clear: vi.fn(() => { state.loaded = false; state.playing = false; state.time = 0 }),
    dispose: vi.fn(),
  }
  const boot = deferred<void>()
  const host = {
    ready: boot.promise,
    setAudioResponse: vi.fn(), setSceneSettings: vi.fn(), getCapabilities: vi.fn(async () => ({ supportedTargets: ['size' as const] })),
    requestAudioInspector: vi.fn<() => Promise<AudioInspectorSnapshot | null>>(async () => null),
    requestGraphicsDiagnostics: vi.fn<() => Promise<GraphicsDiagnostics | null>>(async () => null),
    loadScene: vi.fn<IsolatedPlaybackHost['loadScene']>(async () => {}), cancelPendingLoad: vi.fn<() => number | null>(() => null), setPlayback: vi.fn(), setSynthetic: vi.fn(), setZoom: vi.fn(), update: vi.fn(), resize: vi.fn(),
    capture: vi.fn(async () => new Blob(['image'], { type: 'image/png' })), dispose: vi.fn(),
  }
  let hostOptions!: Parameters<typeof createIsolatedPlaybackHost>[0]
  let automaticActivation = true
  const createHost = vi.fn<typeof createIsolatedPlaybackHost>(options => {
    hostOptions = options
    return { ...host, async loadScene(...args) {
      await host.loadScene(...args)
      if (automaticActivation) { args[2]?.beforeActivate(); args[2]?.onActivated() }
    } }
  })
  const createAudio = vi.fn(() => audio)
  const onFailure = vi.fn(), onStatus = vi.fn(), onDiagnostic = vi.fn()
  let time = 0
  const player = createIsolatedPlayer({ container, rendererUrl: 'http://localhost:5181/', onFailure, onStatus, onDiagnostic, wheelZoom, pointerInteractions }, {
    createHost, createAudio, now: () => time,
  })
  players.push(player)
  function pointer(type: string, clientX: number, clientY: number, pointerId = 7) {
    const event = new MouseEvent(type, { clientX, clientY, button: 0, bubbles: true })
    Object.defineProperties(event, { pointerId: { value: pointerId }, isPrimary: { value: true } })
    container.dispatchEvent(event)
  }
  return {
    player, audio, state, host, boot, createHost, createAudio, container, onFailure, onStatus, onDiagnostic, pointer,
    get hostOptions() { return hostOptions },
    manualActivation() { automaticActivation = false },
    async start() { boot.resolve(); await player.ready; await player.loadScene(scene) },
    async tick(ms = 34) { time += ms; await vi.advanceTimersByTimeAsync(ms) },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  observers.length = 0
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn()
    disconnect = vi.fn()
    constructor(callback: ResizeObserverCallback) { observers.push({ callback, observe: this.observe, disconnect: this.disconnect }) }
  })
})
afterEach(() => {
  players.splice(0).forEach(player => player.dispose())
  document.body.replaceChildren()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('isolated player parent integration', () => {
  const diagnostic: AudioInspectorSnapshot = { mode: 'legacy', source: 'audio', playing: true, audioLoaded: true,
    levels: { bass: .5, mid: .2, treble: .1, overall: .3 }, hits: { bass: 0, mid: 0, treble: 0, overall: 0 },
    bindings: [], driverSignals: [], sceneOutputs: {} }

  it('adds spectrum to inspector readings only in the parent, never to renderer input or simulated readings', async () => {
    const f = fixture()
    await f.start()
    f.host.requestAudioInspector.mockResolvedValue(diagnostic)
    await expect(f.player.requestAudioInspector()).resolves.toBeNull()
    expect(f.host.requestAudioInspector).not.toHaveBeenCalled()
    f.player.setAudioInspectorEnabled(true)
    expect(f.audio.setSpectrumEnabled).toHaveBeenLastCalledWith(true)
    const spectrum = { time: 0, minHz: 40, maxHz: 8000, values: Array(36).fill(.2) }
    f.audio.spectrum.mockReturnValue(spectrum)
    await expect(f.player.requestAudioInspector()).resolves.toEqual({ ...diagnostic, spectrum })
    await f.tick()
    for (const [input] of f.host.update.mock.calls) {
      expect(input).not.toHaveProperty('spectrum')
      expect(input.audio).not.toHaveProperty('spectrum')
    }
    f.audio.spectrum.mockClear()
    f.host.requestAudioInspector.mockResolvedValue({ ...diagnostic, source: 'synthetic' })
    await expect(f.player.requestAudioInspector()).resolves.toMatchObject({ source: 'synthetic', spectrum: null })
    expect(f.audio.spectrum).not.toHaveBeenCalled()
    f.player.setAudioInspectorEnabled(false)
    expect(f.audio.setSpectrumEnabled).toHaveBeenLastCalledWith(false)
    await expect(f.player.requestAudioInspector()).resolves.toBeNull()
  })

  it('stops optional spectrum for hidden or inactive previews and resumes only while the panel remains open', async () => {
    const f = fixture()
    f.player.setAudioInspectorEnabled(true)
    expect(f.audio.setSpectrumEnabled).toHaveBeenLastCalledWith(false)
    await f.start()
    expect(f.audio.setSpectrumEnabled).toHaveBeenLastCalledWith(true)
    f.player.setRenderingSuspended(true)
    expect(f.audio.setSpectrumEnabled).toHaveBeenLastCalledWith(false)
    f.player.setRenderingSuspended(false)
    expect(f.audio.setSpectrumEnabled).toHaveBeenLastCalledWith(true)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(f.audio.setSpectrumEnabled).toHaveBeenLastCalledWith(false)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(f.audio.setSpectrumEnabled).toHaveBeenLastCalledWith(true)
    f.player.setAudioInspectorEnabled(false)
    f.player.setRenderingSuspended(true)
    f.player.setRenderingSuspended(false)
    expect(f.audio.setSpectrumEnabled).toHaveBeenLastCalledWith(false)
  })

  it.each(['seek', 'close', 'scene', 'dispose'] as const)('drops an old inspector reply after %s', async action => {
    const f = fixture()
    await f.start()
    f.player.setAudioInspectorEnabled(true)
    const pending = deferred<AudioInspectorSnapshot | null>()
    f.host.requestAudioInspector.mockReturnValue(pending.promise)
    const reading = f.player.requestAudioInspector()
    if (action === 'seek') f.player.seek(12)
    if (action === 'close') f.player.setAudioInspectorEnabled(false)
    if (action === 'scene') await f.player.loadScene(scene)
    if (action === 'dispose') f.player.dispose()
    pending.resolve(diagnostic)
    await expect(reading).resolves.toBeNull()
    expect(f.audio.spectrum).not.toHaveBeenCalled()
  })

  it('marks audio discontinuities without restarting the scene or its audio for binding edits', async () => {
    const f = fixture()
    await f.start()
    const epoch = () => f.host.update.mock.calls.at(-1)![0].audioEpoch!
    const initial = epoch()
    await f.player.loadAudio(new Blob(['audio']))
    expect(epoch()).toBe(initial + 1)
    f.player.seek(40)
    expect(epoch()).toBe(initial + 2)
    await f.tick()
    expect(epoch()).toBe(initial + 2)
    f.player.clearAudio()
    expect(epoch()).toBe(initial + 3)
    f.player.reset()
    expect(epoch()).toBe(initial + 4)
    expect(f.host.loadScene).toHaveBeenCalledOnce()
  })

  it('marks a quick pause and resume even if the bridge coalesces away the paused sample', async () => {
    const f = fixture()
    await f.start()
    await f.player.loadAudio(new Blob(['audio']))
    f.player.seek(30)
    const before = f.host.update.mock.calls.at(-1)![0]
    f.player.pause()
    await f.player.play()
    await f.tick()
    const resumed = f.host.update.mock.calls.at(-1)![0]
    expect(resumed.audioEpoch).toBe(before.audioEpoch! + 1)
    expect(resumed.audio).toMatchObject({ playing: true, loaded: true, frame: null })
    expect(f.player.getAudioState().time).toBe(30)
    expect(f.audio.load).toHaveBeenCalledOnce()
    expect(f.host.loadScene).toHaveBeenCalledOnce()
  })

  it('stages replacement with its cancellation and permission gate, using playback intent at commit', async () => {
    const f = fixture()
    await f.start()
    await f.player.loadAudio(new Blob(['original']))
    f.player.seek(23); f.player.setVolume(0.4)
    const work = deferred<void>()
    const beforeCommit = vi.fn(async () => {})
    const abort = new AbortController()
    f.audio.load.mockImplementationOnce(async (_source, signal, options) => {
      await work.promise
      await options?.beforeCommit?.()
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
      f.state.playing = options?.shouldPlay?.() ?? false
      f.state.time = 0
    })
    const candidate = new Blob(['replacement'])
    const loading = f.player.loadAudio(candidate, abort.signal, beforeCommit)
    expect(f.audio.load).toHaveBeenLastCalledWith(candidate, abort.signal, { beforeCommit, shouldPlay: expect.any(Function) })
    expect(f.player.getAudioState()).toMatchObject({ time: 23, playing: true, volume: 0.4 })
    f.player.pause()
    work.resolve(); await loading
    expect(beforeCommit).toHaveBeenCalledOnce()
    expect(f.player.getAudioState()).toMatchObject({ time: 0, playing: false, volume: 0.4 })
    expect(f.audio.play).not.toHaveBeenCalled()
    expect(f.host.loadScene).toHaveBeenCalledOnce()
  })

  it('rejects a pre-cancelled candidate before touching the original audio', async () => {
    const f = fixture()
    await f.start(); await f.player.loadAudio(new Blob(['original']))
    f.player.seek(23)
    const abort = new AbortController(); abort.abort()
    await expect(f.player.loadAudio(new Blob(['replacement']), abort.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(f.audio.load).toHaveBeenCalledOnce()
    expect(f.player.getAudioState()).toMatchObject({ time: 23, playing: true })
    expect(f.audio.clear).not.toHaveBeenCalled()
  })

  it('forwards validated live settings without transport or audio changes and rejects edits during scene replacement', async () => {
    const f = fixture(); await f.start(); f.player.pause()
    const settings = extractLiveSceneSettings(scene)
    vi.clearAllMocks()
    f.player.setSceneSettings(settings)
    expect(f.host.setSceneSettings).toHaveBeenCalledExactlyOnceWith(settings)
    expect(f.host.setPlayback).not.toHaveBeenCalled(); expect(f.host.loadScene).not.toHaveBeenCalled()
    expect(f.audio.play).not.toHaveBeenCalled(); expect(f.audio.seek).not.toHaveBeenCalled()
    expect(() => f.player.setSceneSettings({ ...settings, intent: { ...settings.intent, fov: NaN } })).toThrow()
    expect(f.host.setSceneSettings).toHaveBeenCalledOnce()
    const replacement = deferred<void>(); f.host.loadScene.mockReturnValueOnce(replacement.promise)
    const loading = f.player.loadScene(scene)
    expect(() => f.player.setSceneSettings(settings)).toThrow(/Load a scene/)
    replacement.resolve(); await loading
    f.player.dispose(); expect(() => f.player.setSceneSettings(settings)).toThrow(/stopped/)
  })
  it('updates response settings without scene or audio reload and reports actual shader inputs', async () => {
    const f = fixture()
    expect(f.player.getAudioResponseCapabilities()).toBeNull()
    await f.start()
    await f.player.loadAudio(new Blob(['music']))
    const config = { version: 1 as const, sensitivity: 2, mappings: [{ target: 'bass' as const, source: 'bass-hit' as const, amount: 1, attack: 0, release: 0.2 }] }
    f.player.setAudioResponse('mapped-v1', config)
    expect(f.host.setAudioResponse).toHaveBeenLastCalledWith({ mode: 'mapped-v1', config })
    expect(f.audio.setSensitivity).toHaveBeenLastCalledWith(2)
    expect(f.host.loadScene).toHaveBeenCalledOnce()
    expect(f.audio.load).toHaveBeenCalledOnce()
    expect(f.player.getAudioResponseCapabilities()).toMatchObject({ mode: 'mapped-v1', supportedTargets: ['size'], unsupportedTargets: ['bass'] })
  })

  it('starts playback and audio sampling without waiting for optional capability metadata', async () => {
    const f = fixture(), metadata = deferred<{ supportedTargets: 'size'[] }>()
    f.host.getCapabilities.mockReturnValueOnce(metadata.promise)
    await f.start()
    await f.player.loadAudio(new Blob(['music']))
    f.player.seek(42); f.player.setVolume(.4)
    await f.tick()
    expect(f.player.getAudioResponseCapabilities()).toBeNull()
    expect(f.host.update.mock.calls.at(-1)![0]).toMatchObject({ audio: { loaded: true, playing: true, audioTime: 42 } })
    metadata.reject(new Error('Capabilities request timed out.')); await Promise.resolve()
    expect(f.onFailure).not.toHaveBeenCalled(); expect(f.audio.pause).not.toHaveBeenCalled(); expect(f.host.dispose).not.toHaveBeenCalled()
    expect(f.player.getAudioState()).toMatchObject({ playing: true, time: 42, volume: .4 })
    expect(f.player.getAudioResponseCapabilities()).toBeNull()
  })

  it('does not fail a scene or override pause when capability metadata is unavailable', async () => {
    const f = fixture()
    f.player.pause()
    f.host.getCapabilities.mockRejectedValueOnce(new Error('Capabilities are unavailable.'))
    await f.start(); await f.tick()
    expect(f.onFailure).not.toHaveBeenCalled(); expect(f.host.dispose).not.toHaveBeenCalled()
    expect(f.host.setPlayback).toHaveBeenLastCalledWith(false)
    expect(f.player.getAudioResponseCapabilities()).toBeNull()
    expect(f.host.update).toHaveBeenCalled()
  })

  it('ignores old capability responses after a newer scene has completed', async () => {
    const f = fixture(), metadata = deferred<{ supportedTargets: 'size'[] }>()
    f.host.getCapabilities.mockReturnValueOnce(metadata.promise)
    await f.start()
    await f.player.loadScene(scene)
    expect(f.player.getAudioResponseCapabilities()?.supportedTargets).toEqual(['size'])
    metadata.resolve({ supportedTargets: [] }); await Promise.resolve()
    expect(f.player.getAudioResponseCapabilities()?.supportedTargets).toEqual(['size'])
    expect(f.onFailure).not.toHaveBeenCalled()
  })

  it('forwards host diagnostics without adding scene or audio contents', async () => {
    const f = fixture(); await f.start()
    const diagnostic = { type: 'operation' as const, at: 1, operation: 'capture' as const,
      requestId: 4, generation: 1, phase: 'failed' as const, reason: 'timeout' as const }
    f.hostOptions.onDiagnostic?.(diagnostic)
    expect(f.onDiagnostic).toHaveBeenCalledExactlyOnceWith(diagnostic)
  })

  it('requests graphics measurements only explicitly and ignores measurements from replaced scenes', async () => {
    const f = fixture()
    await expect(f.player.requestGraphicsDiagnostics()).resolves.toBeNull()
    await f.start(); await f.tick(1000)
    expect(f.host.requestGraphicsDiagnostics).not.toHaveBeenCalled()
    const measured: GraphicsDiagnostics = { contextsCreated: 1, contextsDisposed: 0, firstFrameMs: 40,
      geometries: 3, textures: 4, programs: 5 }
    f.host.requestGraphicsDiagnostics.mockResolvedValueOnce(measured)
    await expect(f.player.requestGraphicsDiagnostics()).resolves.toEqual(measured)
    const old = deferred<GraphicsDiagnostics | null>()
    f.host.requestGraphicsDiagnostics.mockReturnValueOnce(old.promise)
    const reading = f.player.requestGraphicsDiagnostics()
    await f.player.loadScene(scene); old.resolve(measured)
    await expect(reading).resolves.toBeNull()
    f.host.requestGraphicsDiagnostics.mockRejectedValueOnce(new Error('Unavailable optional observation'))
    await expect(f.player.requestGraphicsDiagnostics()).resolves.toBeNull()
    expect(f.onFailure).not.toHaveBeenCalled(); expect(f.audio.pause).not.toHaveBeenCalled()
    f.player.dispose(); await expect(f.player.requestGraphicsDiagnostics()).resolves.toBeNull()
  })

  it('retires a pending scene immediately without stopping or rewinding its music', async () => {
    const f = fixture(); await f.start(); await f.player.loadAudio(new Blob(['music'])); f.player.seek(42)
    const pending = deferred<void>()
    f.host.loadScene.mockReturnValueOnce(pending.promise)
    f.host.cancelPendingLoad.mockImplementationOnce(() => { pending.reject(new Error('Scene changed.')); return 2 })
    const loading = f.player.loadScene(scene), rejected = expect(loading).rejects.toThrow(/Scene changed/)
    await Promise.resolve()
    f.player.cancelPendingScene(); await rejected
    expect(f.host.cancelPendingLoad).toHaveBeenCalledOnce()
    expect(f.audio.pause).not.toHaveBeenCalled(); expect(f.audio.clear).not.toHaveBeenCalled(); expect(f.audio.dispose).not.toHaveBeenCalled()
    expect(f.player.getAudioState()).toMatchObject({ playing: true, time: 42 })
    expect(f.onFailure).not.toHaveBeenCalled()
    await f.player.loadScene(scene)
    expect(f.host.setPlayback).toHaveBeenLastCalledWith(true)
  })

  it('cancels a selection awaiting startup and does nothing to a completed scene', async () => {
    const f = fixture()
    const loading = f.player.loadScene(scene), rejected = expect(loading).rejects.toThrow(/Scene changed/)
    f.player.cancelPendingScene(); f.boot.resolve(); await rejected
    expect(f.host.loadScene).not.toHaveBeenCalled()
    expect(f.host.cancelPendingLoad).toHaveBeenCalledOnce()
    await f.player.loadScene(scene)
    f.host.cancelPendingLoad.mockClear(); f.host.setPlayback.mockClear()
    f.player.cancelPendingScene()
    expect(f.host.cancelPendingLoad).not.toHaveBeenCalled(); expect(f.host.setPlayback).not.toHaveBeenCalled()
    await f.tick(); expect(f.host.update).toHaveBeenCalled()
  })

  it('leaves hover preview hosts noninteractive when pointer input is disabled', async () => {
    const f = fixture(true, false)
    await f.start()
    f.pointer('pointerdown', 300, 50)
    const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true })
    f.container.dispatchEvent(wheel)
    await f.tick()
    expect(wheel.defaultPrevented).toBe(false)
    expect(f.container.style.userSelect).toBe('')
    expect(f.host.update.mock.calls.at(-1)![0].pointer).toEqual({ x: 0, y: 0, down: false, inside: false })
    expect(f.host.setZoom).toHaveBeenCalledExactlyOnceWith(1)
  })
  it('switches scenes while retaining the playing song, its position and volume in the same audio session', async () => {
    const f = fixture()
    await f.start()
    const file = new Blob(['private music'])
    await f.player.loadAudio(file)
    f.player.seek(42)
    f.player.setVolume(0.4)
    f.player.setSynthetic(true, 12, 1.5)
    f.audio.play.mockClear()
    f.audio.seek.mockClear()
    await f.player.loadScene({ schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1,
      settings: { audioResponse: 'mapped-v1', audioResponseConfig: { version: 1, sensitivity: 2, mappings: [] } } })
    expect(f.createAudio).toHaveBeenCalledOnce()
    expect(f.createHost).toHaveBeenCalledOnce()
    expect(f.audio.load).toHaveBeenCalledExactlyOnceWith(file, undefined, { beforeCommit: undefined, shouldPlay: expect.any(Function) })
    expect(f.audio.pause).not.toHaveBeenCalled()
    expect(f.audio.play).not.toHaveBeenCalled()
    expect(f.audio.seek).not.toHaveBeenCalled()
    expect(f.audio.clear).not.toHaveBeenCalled()
    expect(f.player.getAudioState()).toMatchObject({ time: 42, playing: true, volume: 0.4 })
    expect(f.audio.setSensitivity).toHaveBeenLastCalledWith(2)
    expect(f.host.setPlayback).toHaveBeenLastCalledWith(true)
    expect(f.host.setSynthetic).toHaveBeenLastCalledWith(true, 12, 1.5)
    expect(f.host.update.mock.calls.at(-1)![0]).toMatchObject({ time: 0, audio: { playing: true, loaded: true } })
    expect(JSON.stringify(f.host.loadScene.mock.calls)).not.toContain('private music')
  })

  it('holds the visual clock during pause, clamps delayed ticks, and resets both visual and audio positions', async () => {
    const f = fixture()
    await f.start()
    await f.player.loadAudio(new Blob(['music']))
    await f.tick()
    expect(f.host.update.mock.calls.at(-1)![0].time).toBeCloseTo(0.034)
    f.player.pause()
    await f.tick(3000)
    expect(f.host.update.mock.calls.at(-1)![0].time).toBeCloseTo(0.034)
    expect(f.host.setPlayback).toHaveBeenLastCalledWith(false)
    await f.player.play()
    await f.tick(4000)
    expect(f.host.update.mock.calls.at(-1)![0].time).toBeCloseTo(0.284)
    f.player.reset()
    expect(f.audio.seek).toHaveBeenLastCalledWith(0)
    expect(f.host.update.mock.calls.at(-1)![0].time).toBe(0)
    expect(f.player.getAudioState().playing).toBe(false)
    await f.tick(1000)
    expect(f.host.update.mock.calls.at(-1)![0].time).toBe(0)
  })

  it('suspends visuals and pointer holds during checks while keeping music, position and volume', async () => {
    const f = fixture(true)
    await f.start()
    await f.player.loadAudio(new Blob(['music']))
    f.player.seek(42)
    f.player.setVolume(0.4)
    f.pointer('pointerdown', 310, 70)
    await f.tick()
    const elapsed = f.host.update.mock.calls.at(-1)![0].time
    f.player.setRenderingSuspended(true)
    expect(f.host.setPlayback).toHaveBeenLastCalledWith(false)
    f.pointer('pointerdown', 100, 100)
    f.pointer('pointermove', 10, 20)
    const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true })
    f.container.dispatchEvent(wheel)
    await f.tick(3000)
    expect(wheel.defaultPrevented).toBe(false)
    expect(f.host.update.mock.calls.at(-1)![0]).toMatchObject({ time: elapsed, pointer: { down: false, inside: false } })
    expect(f.player.getAudioState()).toMatchObject({ playing: true, time: 42, volume: 0.4 })
    expect(f.audio.pause).not.toHaveBeenCalled()
    expect(f.audio.load).toHaveBeenCalledOnce()
    f.player.setRenderingSuspended(false)
    await f.tick()
    expect(f.host.update.mock.calls.at(-1)![0].time).toBeCloseTo(elapsed + 0.034)
    expect(f.host.setPlayback).toHaveBeenLastCalledWith(true)
  })

  it('retains visual suspension across compilation and never overrides a pause made while waiting', async () => {
    const f = fixture()
    await f.start()
    await f.player.loadAudio(new Blob(['music']))
    f.player.setRenderingSuspended(true)
    const compile = deferred<void>()
    f.host.loadScene.mockImplementationOnce(() => compile.promise)
    const loading = f.player.loadScene(scene)
    await f.tick(1000)
    expect(f.player.getAudioState().playing).toBe(true)
    f.player.pause()
    f.audio.play.mockClear()
    compile.resolve()
    await loading
    f.player.setRenderingSuspended(false)
    await f.tick()
    expect(f.host.setPlayback).toHaveBeenLastCalledWith(false)
    expect(f.host.update.mock.calls.at(-1)![0].time).toBe(0)
    expect(f.player.getAudioState().playing).toBe(false)
    expect(f.audio.play).not.toHaveBeenCalled()
  })

  it.each([false, true])('keeps music continuous while hidden and preserves a manual pause of %s on return', async pauseWhileHidden => {
    const f = fixture()
    await f.start()
    await f.player.loadAudio(new Blob(['music']))
    f.pointer('pointerdown', 310, 70)
    await f.tick()
    const elapsed = f.host.update.mock.calls.at(-1)![0].time
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await f.tick(5000)
    expect(f.host.setPlayback).toHaveBeenLastCalledWith(false)
    expect(f.host.update.mock.calls.at(-1)![0]).toMatchObject({ time: elapsed, pointer: { down: false, inside: false } })
    expect(f.audio.pause).not.toHaveBeenCalled()
    expect(f.player.getAudioState().playing).toBe(true)
    if (pauseWhileHidden) f.player.pause()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await f.tick()
    expect(f.host.setPlayback).toHaveBeenLastCalledWith(!pauseWhileHidden)
    expect(f.host.update.mock.calls.at(-1)![0].time).toBeCloseTo(elapsed + (pauseWhileHidden ? 0 : 0.034))
    expect(f.player.getAudioState().playing).toBe(!pauseWhileHidden)
    expect(f.audio.load).toHaveBeenCalledOnce()
  })

  it('restores paused and simulated-beat settings after each scene load, including choices made before startup', async () => {
    const f = fixture()
    f.player.pause()
    f.player.setSynthetic(true, 81, 2)
    await f.start()
    expect(f.host.setPlayback).toHaveBeenLastCalledWith(false)
    expect(f.host.setSynthetic).toHaveBeenLastCalledWith(true, 81, 2)
    await f.player.loadAudio(new Blob(['music']))
    expect(f.audio.play).not.toHaveBeenCalled()
    await f.player.loadScene(scene)
    expect(f.host.setPlayback).toHaveBeenLastCalledWith(false)
    expect(f.host.setSynthetic).toHaveBeenLastCalledWith(true, 81, 2)
  })

  it('normalizes pointer input, ignores other fingers and releases outside the scene', async () => {
    const f = fixture()
    await f.start()
    f.pointer('pointerdown', 310, 70)
    await f.tick()
    expect(f.host.update.mock.calls.at(-1)![0].pointer).toEqual({ x: 0.5, y: 0.5, down: true, inside: true })
    f.pointer('pointermove', 10, 20, 99)
    await f.tick()
    expect(f.host.update.mock.calls.at(-1)![0].pointer).toEqual({ x: 0.5, y: 0.5, down: true, inside: true })
    f.pointer('pointermove', 9999, -100)
    await f.tick()
    expect(f.host.update.mock.calls.at(-1)![0].pointer).toEqual({ x: 1, y: 1, down: true, inside: true })
    const up = new Event('pointerup')
    Object.defineProperty(up, 'pointerId', { value: 7 })
    window.dispatchEvent(up)
    await f.tick()
    expect(f.host.update.mock.calls.at(-1)![0].pointer.down).toBe(false)
    f.pointer('pointerleave', 9999, -100)
    await f.tick()
    expect(f.host.update.mock.calls.at(-1)![0].pointer.inside).toBe(false)
    f.pointer('pointerenter', 10, 20)
    await f.tick()
    expect(f.host.update.mock.calls.at(-1)![0].pointer.inside).toBe(true)
  })

  it('only captures wheel scrolling when explicitly enabled and bounds camera zoom', async () => {
    const inactive = fixture()
    await inactive.start()
    const pageScroll = new WheelEvent('wheel', { deltaY: 100, cancelable: true })
    inactive.container.dispatchEvent(pageScroll)
    expect(pageScroll.defaultPrevented).toBe(false)
    expect(inactive.host.setZoom).toHaveBeenCalledOnce()
    const f = fixture(true)
    await f.start()
    for (const modifier of ['ctrlKey', 'metaKey']) {
      const browserZoom = new WheelEvent('wheel', { deltaY: 100, cancelable: true, [modifier]: true })
      f.container.dispatchEvent(browserZoom)
      expect(browserZoom.defaultPrevented).toBe(false)
    }
    expect(f.host.setZoom).toHaveBeenCalledOnce()
    const zoomOut = new WheelEvent('wheel', { deltaY: 100, cancelable: true })
    f.container.dispatchEvent(zoomOut)
    expect(zoomOut.defaultPrevented).toBe(true)
    expect(f.host.setZoom).toHaveBeenLastCalledWith(Math.exp(0.1))
    for (let i = 0; i < 50; i++) f.container.dispatchEvent(new WheelEvent('wheel', { deltaY: 100000 }))
    expect(f.host.setZoom).toHaveBeenLastCalledWith(2.5)
    for (let i = 0; i < 50; i++) f.container.dispatchEvent(new WheelEvent('wheel', { deltaY: -100000 }))
    expect(f.host.setZoom).toHaveBeenLastCalledWith(0.4)
    f.player.reset()
    expect(f.host.setZoom).toHaveBeenLastCalledWith(1)
  })

  it('bounds display size and device ratio, and responds to ResizeObserver', async () => {
    const f = fixture()
    expect(f.host.resize).toHaveBeenCalledWith(400, 200, 1)
    vi.spyOn(f.container, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 99999, 0))
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(4)
    observers[0].callback([], {} as ResizeObserver)
    expect(f.host.resize).toHaveBeenLastCalledWith(8192, 1, 1.5)
    f.player.dispose()
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
  })

  it('stops sampling and audio on renderer failure and ignores later inputs', async () => {
    const f = fixture()
    await f.start()
    await f.player.loadAudio(new Blob(['music']))
    f.host.update.mockClear()
    f.hostOptions.onFailure?.('progress-timeout')
    f.hostOptions.onFailure?.('runtime')
    f.pointer('pointerdown', 100, 100)
    await f.tick(1000)
    expect(f.audio.pause).toHaveBeenCalledOnce()
    expect(f.host.update).not.toHaveBeenCalled()
    expect(f.onFailure).toHaveBeenCalledExactlyOnceWith('progress-timeout')
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
    await expect(f.player.play()).rejects.toThrow('stopped')
  })

  it('does not play audio when a pending source load finishes after disposal', async () => {
    const f = fixture()
    await f.start()
    const loaded = deferred<void>()
    f.audio.load.mockReturnValueOnce(loaded.promise)
    const work = f.player.loadAudio(new Blob(['music']))
    const rejected = expect(work).rejects.toThrow('stopped')
    f.player.dispose()
    loaded.resolve()
    await rejected
    expect(f.audio.play).not.toHaveBeenCalled()
    expect(f.audio.dispose).toHaveBeenCalledOnce()
    expect(f.host.dispose).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not auto-play a source cleared or replaced while loading', async () => {
    const f = fixture()
    await f.start()
    const loaded = deferred<void>()
    f.audio.load.mockReturnValueOnce(loaded.promise)
    const work = f.player.loadAudio(new Blob(['music']))
    const rejected = expect(work).rejects.toThrow('Audio changed')
    f.player.clearAudio()
    loaded.resolve()
    await rejected
    expect(f.audio.play).not.toHaveBeenCalled()
    expect(f.audio.clear).toHaveBeenCalledOnce()
  })

  it('keeps active audio, response and elapsed time when replacement preparation fails', async () => {
    const f = fixture(); await f.start()
    await f.player.loadAudio(new Blob(['music']))
    f.player.setAudioResponse('mapped-v1', { version: 1, sensitivity: 2, mappings: [] })
    await f.tick(100)
    const before = f.host.update.mock.calls.at(-1)![0].time
    f.audio.setSensitivity.mockClear(); f.host.setAudioResponse.mockClear()
    f.host.loadScene.mockRejectedValueOnce(new SceneReplacementError('compile', true))
    const candidate = customDocument({ ...scene.scene, audioResponseConfig: { version: 1, sensitivity: 3, mappings: [] } })
    await expect(f.player.loadScene(candidate)).rejects.toMatchObject({ retained: true, reason: 'compile' })
    await f.tick()
    expect(f.host.update.mock.calls.at(-1)![0].time).toBeGreaterThan(before)
    expect(f.audio.setSensitivity).not.toHaveBeenCalled(); expect(f.host.setAudioResponse).not.toHaveBeenCalled()
    expect(f.audio.pause).not.toHaveBeenCalled(); expect(f.audio.load).toHaveBeenCalledOnce()
    expect(f.onFailure).not.toHaveBeenCalled(); expect(f.host.dispose).not.toHaveBeenCalled()
    expect(f.player.getAudioState().playing).toBe(true)
    expect(() => f.player.setSceneSettings(extractLiveSceneSettings(scene))).not.toThrow()
  })

  it('commits actual intermediate metadata after approval even when the next scene is queued', async () => {
    const f = fixture(); await f.start(); f.manualActivation()
    await f.player.loadAudio(new Blob(['music']))
    const firstCommit = deferred<void>(), nextCommit = deferred<void>()
    f.host.loadScene.mockImplementationOnce(async (_scene, _profile, activation) => {
      activation!.beforeActivate(); await firstCommit.promise; activation!.onActivated()
    }).mockImplementationOnce(async (_scene, _profile, activation) => {
      await firstCommit.promise; activation!.beforeActivate(); await nextCommit.promise; activation!.onActivated()
    })
    const first = f.player.loadScene(customDocument({ ...scene.scene, audioResponseConfig: { version: 1, sensitivity: 2, mappings: [] } }))
    const obsolete = expect(first).rejects.toThrow('Scene changed')
    await Promise.resolve()
    f.player.cancelPendingScene()
    const next = f.player.loadScene(customDocument({ ...scene.scene, audioResponseConfig: { version: 1, sensitivity: 3, mappings: [] } }))
    await Promise.resolve()
    firstCommit.resolve(); await obsolete
    expect(f.audio.setSensitivity).toHaveBeenLastCalledWith(2)
    expect(f.host.setAudioResponse).toHaveBeenLastCalledWith(expect.objectContaining({ config: expect.objectContaining({ sensitivity: 2 }) }))
    nextCommit.resolve(); await next
    expect(f.audio.setSensitivity).toHaveBeenLastCalledWith(3)
    expect(f.audio.pause).not.toHaveBeenCalled(); expect(f.audio.load).toHaveBeenCalledOnce()
    expect(f.onFailure).not.toHaveBeenCalled()
  })

  it('does not reapply old scene controls when an older load finishes late', async () => {
    const f = fixture()
    await f.start()
    const loaded = deferred<void>()
    f.host.loadScene.mockReturnValueOnce(loaded.promise)
    const first = f.player.loadScene(scene)
    const rejected = expect(first).rejects.toThrow('Scene changed')
    await Promise.resolve()
    await f.player.loadScene(customDocument({ ...scene.scene, audioResponseConfig: { version: 1, sensitivity: 3, mappings: [] } }))
    loaded.resolve()
    await rejected
    expect(f.audio.setSensitivity).toHaveBeenLastCalledWith(3)
  })

  it('propagates safe captures and cleans up when the host closes on page exit', async () => {
    const f = fixture()
    await f.start()
    const capture = await f.player.capture({ width: 320, height: 180 })
    expect(capture.type).toBe('image/png')
    expect(f.host.capture).toHaveBeenCalledWith({ width: 320, height: 180 })
    f.hostOptions.onStatus?.('disposed')
    expect(f.audio.dispose).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects invalid scenes before disturbing the active player', async () => {
    const f = fixture()
    await f.start()
    await expect(f.player.loadScene({ visualizer: { shader: '' } })).rejects.toThrow()
    expect(f.host.loadScene).toHaveBeenCalledOnce()
    await f.tick()
    expect(f.host.update.mock.calls.at(-1)![0].time).toBeCloseTo(0.034)
  })
})

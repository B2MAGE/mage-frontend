import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIsolatedPlayer, type IsolatedPlayer } from './isolatedPlayer'
import type { ParentAudioSession } from './parentAudio'
import type { createIsolatedPlaybackHost } from './playbackHost'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const scene = { visualizer: { shader: 'sphere(0.5);' } }
const players: IsolatedPlayer[] = []
const observers: Array<{ callback: ResizeObserverCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = []

function fixture(wheelZoom = false, pointerInteractions = true) {
  const container = document.createElement('div')
  document.body.append(container)
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 400, 200))
  const state = { loaded: false, playing: false, time: 0, duration: 120, volume: 1 }
  const audio = {
    load: vi.fn<ParentAudioSession['load']>(async () => { state.loaded = true }),
    play: vi.fn<ParentAudioSession['play']>(async () => { state.playing = state.loaded }),
    pause: vi.fn(() => { state.playing = false }),
    seek: vi.fn((time: number) => { state.time = time }),
    setVolume: vi.fn((volume: number) => { state.volume = volume }),
    setSensitivity: vi.fn(),
    getState: vi.fn(() => ({ ...state })),
    sample: vi.fn(() => ({ frame: null, legacyAmplitude: 0, audioTime: state.time, loaded: state.loaded, playing: state.playing })),
    clear: vi.fn(() => { state.loaded = false; state.playing = false; state.time = 0 }),
    dispose: vi.fn(),
  }
  const boot = deferred<void>()
  const host = {
    ready: boot.promise,
    setAudioResponse: vi.fn(), getCapabilities: vi.fn(async () => ({ supportedTargets: ['size' as const] })),
    loadScene: vi.fn(async () => {}), setPlayback: vi.fn(), setSynthetic: vi.fn(), setZoom: vi.fn(), update: vi.fn(), resize: vi.fn(),
    capture: vi.fn(async () => new Blob(['image'], { type: 'image/png' })), dispose: vi.fn(),
  }
  let hostOptions!: Parameters<typeof createIsolatedPlaybackHost>[0]
  const createHost = vi.fn<typeof createIsolatedPlaybackHost>(options => { hostOptions = options; return host })
  const createAudio = vi.fn(() => audio)
  const onFailure = vi.fn(), onStatus = vi.fn()
  let time = 0
  const player = createIsolatedPlayer({ container, rendererUrl: 'http://localhost:5181/', onFailure, onStatus, wheelZoom, pointerInteractions }, {
    createHost, createAudio, now: () => time,
  })
  players.push(player)
  function pointer(type: string, clientX: number, clientY: number, pointerId = 7) {
    const event = new MouseEvent(type, { clientX, clientY, button: 0, bubbles: true })
    Object.defineProperties(event, { pointerId: { value: pointerId }, isPrimary: { value: true } })
    container.dispatchEvent(event)
  }
  return {
    player, audio, state, host, boot, createHost, createAudio, container, onFailure, onStatus, pointer,
    get hostOptions() { return hostOptions },
    async start() { boot.resolve(); await player.ready; await player.loadScene(scene) },
    async tick(ms = 34) { time += ms; await vi.advanceTimersByTimeAsync(ms) },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
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
  vi.unstubAllGlobals()
})

describe('isolated player parent integration', () => {
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
    expect(f.audio.load).toHaveBeenCalledExactlyOnceWith(file)
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

  it('does not reapply old scene controls when an older load finishes late', async () => {
    const f = fixture()
    await f.start()
    const loaded = deferred<void>()
    f.host.loadScene.mockReturnValueOnce(loaded.promise)
    const first = f.player.loadScene(scene)
    const rejected = expect(first).rejects.toThrow('Scene changed')
    await Promise.resolve()
    await f.player.loadScene({ ...scene, audioResponseConfig: { version: 1, sensitivity: 3, mappings: [] } })
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

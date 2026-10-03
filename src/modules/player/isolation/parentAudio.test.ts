import { Blob as NativeBlob } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioAnalysisFrame, AudioAnalysisSession } from '@notrac/mage/audio-analysis'
import { createParentAudioSession, MAX_PARENT_AUDIO_BYTES } from './parentAudio'
import { BRIDGE_LIMITS, isAudioInput } from './playbackProtocol'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function fixture() {
  let frames: AudioAnalysisFrame[] = []
  const nodes: Array<ReturnType<typeof node>> = []
  const sources: Array<ReturnType<typeof bufferSource>> = []
  function node() { return { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } } }
  function bufferSource() { return { ...node(), buffer: null, onended: null as (() => void) | null, start: vi.fn(), stop: vi.fn() } }
  const analyser = { ...node(), fftSize: 0, frequencyBinCount: 32, getByteFrequencyData: vi.fn((data: Uint8Array) => { data[2] = 128 }) }
  const context = {
    currentTime: 0, destination: {},
    createGain: vi.fn(() => { const value = node(); nodes.push(value); return value }),
    createAnalyser: vi.fn(() => analyser),
    createBufferSource: vi.fn(() => { const value = bufferSource(); sources.push(value); return value }),
    decodeAudioData: vi.fn<(bytes: ArrayBuffer) => Promise<AudioBuffer>>(async () => ({ duration: 90 } as AudioBuffer)),
    resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
  }
  const analysis = {
    connect: vi.fn(async () => true), reset: vi.fn(() => { frames = [] }), dispose: vi.fn(), setSensitivity: vi.fn(),
    drain: vi.fn(() => { const result = frames; frames = []; return result }),
  }
  const createContext = vi.fn(() => context as unknown as AudioContext)
  const fetchSource = vi.fn<typeof fetch>()
  const session = createParentAudioSession({ createContext, fetchSource, createAnalysis: () => analysis as unknown as AudioAnalysisSession })
  return { session, createContext, context, nodes, sources, analysis, analyser, fetchSource, queue(values: AudioAnalysisFrame[]) { frames.push(...values) } }
}

function frame(time: number, count = 1): AudioAnalysisFrame {
  return { sequence: 1, time, levels: { bass: 0.2, mid: 0.3, treble: 0.4, overall: 0.5 }, hits: Array.from({ length: count }, () => ({ band: 'bass', strength: 0.5, time })) }
}

beforeEach(() => { vi.stubGlobal('Blob', NativeBlob) })
afterEach(() => { vi.unstubAllGlobals() })

describe('parent-owned audio transport', () => {
  it('lazily creates one graph, preserves time across pause/play and seeks without replacing its analysis session', async () => {
    const f = fixture()
    expect(f.createContext).not.toHaveBeenCalled()
    expect(f.session.getState()).toEqual({ loaded: false, playing: false, time: 0, duration: 0, volume: 1 })
    await f.session.load(new Blob(['music']))
    expect(f.fetchSource).not.toHaveBeenCalled()
    expect(f.session.getState()).toMatchObject({ loaded: true, playing: false, duration: 90 })
    await f.session.play()
    f.context.currentTime = 5
    expect(f.session.getState()).toMatchObject({ time: 5, playing: true })
    f.session.pause()
    f.context.currentTime = 10
    expect(f.session.getState().time).toBe(5)
    expect(f.sources[0].stop).toHaveBeenCalledOnce()
    await f.session.play()
    expect(f.sources[1].start).toHaveBeenCalledWith(0, 5)
    f.session.seek(40)
    expect(f.sources[2].start).toHaveBeenCalledWith(0, 40)
    f.context.currentTime = 12
    expect(f.session.getState().time).toBe(42)
    f.session.setVolume(0.4)
    expect(f.nodes[1].gain.value).toBe(0.4)
    expect(f.nodes[0].gain.value).toBe(1)
    await f.session.load(new Blob(['replacement']))
    expect(f.createContext).toHaveBeenCalledOnce()
    expect(f.analysis.connect).toHaveBeenCalledOnce()
    expect(f.session.getState()).toMatchObject({ time: 0, loaded: true, playing: false, volume: 0.4 })
  })

  it('finishes naturally and restarts from the beginning', async () => {
    const f = fixture()
    await f.session.load(new Blob(['music']))
    await f.session.play()
    f.sources[0].onended?.()
    expect(f.session.getState()).toMatchObject({ time: 90, playing: false })
    expect(f.sources[0].disconnect).toHaveBeenCalledOnce()
    await f.session.play()
    expect(f.sources[1].start).toHaveBeenCalledWith(0, 0)
    f.session.seek(100)
    expect(f.session.getState()).toMatchObject({ time: 90, playing: false })
    f.session.seek(-5)
    expect(f.session.getState().time).toBe(0)
  })

  it.each(['pause', 'clear', 'seek', 'dispose'] as const)('does not revive playback after %s while browser resume is pending', async action => {
    const f = fixture()
    await f.session.load(new Blob(['music']))
    const resume = deferred<void>()
    f.context.resume.mockReturnValueOnce(resume.promise)
    const playing = f.session.play()
    if (action === 'seek') f.session.seek(25)
    else f.session[action]()
    resume.resolve()
    await playing
    expect(f.sources).toHaveLength(0)
    expect(f.session.getState().playing).toBe(false)
  })

  it('allows only the newest asynchronous load to replace the track', async () => {
    const f = fixture()
    const first = deferred<AudioBuffer>()
    f.context.decodeAudioData.mockReturnValueOnce(first.promise)
    const loading = f.session.load(new Blob(['first']))
    const cancelled = expect(loading).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(f.context.decodeAudioData).toHaveBeenCalledOnce())
    const second = f.session.load(new Blob(['second']))
    expect(f.context.decodeAudioData).toHaveBeenCalledOnce()
    first.resolve({ duration: 5 } as AudioBuffer)
    await second
    await cancelled
    expect(f.session.getState().duration).toBe(90)
    expect(f.createContext).toHaveBeenCalledOnce()
  })

  it('runs at most one native decoder and retains only the latest waiting source', async () => {
    const f = fixture()
    const decoding = deferred<AudioBuffer>()
    f.context.decodeAudioData.mockReturnValueOnce(decoding.promise)
    const first = f.session.load(new Blob(['first']))
    const firstCancelled = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(f.context.decodeAudioData).toHaveBeenCalledOnce())
    const second = f.session.load(new Blob(['second']))
    const secondCancelled = expect(second).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    await Promise.resolve()
    const newest = f.session.load(new Blob(['newest']))
    await firstCancelled
    await secondCancelled
    expect(f.context.decodeAudioData).toHaveBeenCalledOnce()
    decoding.resolve({ duration: 20 } as AudioBuffer)
    await newest
    expect(f.context.decodeAudioData).toHaveBeenCalledTimes(2)
    expect(new TextDecoder().decode(f.context.decodeAudioData.mock.calls[1][0])).toBe('newest')
    expect(f.session.getState().duration).toBe(90)
  })

  it('releases the decoder slot after failure and never starts queued work after disposal', async () => {
    const f = fixture()
    const oldDecode = deferred<AudioBuffer>()
    f.context.decodeAudioData.mockReturnValueOnce(oldDecode.promise)
    const old = f.session.load(new Blob(['first']))
    const oldCancelled = expect(old).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(f.context.decodeAudioData).toHaveBeenCalledOnce())
    const replacement = f.session.load(new Blob(['replacement']))
    oldDecode.reject(new Error('Invalid old file'))
    await replacement
    await oldCancelled
    expect(f.context.decodeAudioData).toHaveBeenCalledTimes(2)
    const activeDecode = deferred<AudioBuffer>()
    f.context.decodeAudioData.mockReturnValueOnce(activeDecode.promise)
    const active = f.session.load(new Blob(['active']))
    const activeCancelled = expect(active).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(f.context.decodeAudioData).toHaveBeenCalledTimes(3))
    const queued = f.session.load(new Blob(['queued']))
    const queuedCancelled = expect(queued).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    await Promise.resolve()
    f.session.dispose()
    await activeCancelled
    await queuedCancelled
    activeDecode.resolve({ duration: 20 } as AudioBuffer)
    await Promise.resolve()
    await Promise.resolve()
    expect(f.context.decodeAudioData).toHaveBeenCalledTimes(3)
  })

  it('does not cancel a worklet connection when another file is loaded during initialization', async () => {
    const f = fixture()
    const ready = deferred<boolean>()
    f.analysis.connect.mockReturnValueOnce(ready.promise)
    const oldLoad = f.session.load(new Blob(['first']))
    const cancelled = expect(oldLoad).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(f.analysis.connect).toHaveBeenCalledOnce())
    const newLoad = f.session.load(new Blob(['second']))
    expect(f.analysis.reset).not.toHaveBeenCalled()
    ready.resolve(true)
    await newLoad
    await cancelled
    expect(f.analysis.connect).toHaveBeenCalledOnce()
    expect(f.analysis.reset).toHaveBeenCalledOnce()
  })

  it('releases every owned resource and rejects a decode that completes after disposal', async () => {
    const f = fixture()
    const decoded = deferred<AudioBuffer>()
    f.context.decodeAudioData.mockReturnValueOnce(decoded.promise)
    const loading = f.session.load(new Blob(['music']))
    const cancelled = expect(loading).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(f.context.decodeAudioData).toHaveBeenCalledOnce())
    f.session.dispose()
    f.session.dispose()
    decoded.resolve({ duration: 90 } as AudioBuffer)
    await cancelled
    expect(f.analysis.dispose).toHaveBeenCalledOnce()
    expect(f.nodes.every(node => node.disconnect.mock.calls.length === 1)).toBe(true)
    expect(f.analyser.disconnect).toHaveBeenCalledOnce()
    expect(f.context.close).toHaveBeenCalledOnce()
    expect(f.session.sample()).toEqual({ frame: null, legacyAmplitude: 0, audioTime: 0, loaded: false, playing: false })
    await expect(f.session.play()).rejects.toThrow('disposed')
  })
})

describe('bounded parent-only audio loading', () => {
  it('fetches URL audio without credentials, redirects or a referrer', async () => {
    const f = fixture()
    f.fetchSource.mockResolvedValue(new Response('audio'))
    await f.session.load('https://media.example.test/music.mp3')
    expect(f.fetchSource).toHaveBeenCalledWith('https://media.example.test/music.mp3', expect.objectContaining({
      credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store', signal: expect.any(AbortSignal),
    }))
    expect(f.session.getState().loaded).toBe(true)
  })

  it.each(['data:audio/mp3;base64,YWJj', 'javascript:alert(1)', 'https://user:pass@media.example.test/audio.mp3', '/api/private-audio'])('rejects an unsafe or unresolved source: %s', async url => {
    const f = fixture()
    await expect(f.session.load(url)).rejects.toBeDefined()
    expect(f.fetchSource).not.toHaveBeenCalled()
    expect(f.createContext).not.toHaveBeenCalled()
  })

  it('rejects oversized local files before decoding or reading bytes', async () => {
    const f = fixture()
    const file = new Blob(['music'])
    Object.defineProperty(file, 'size', { value: MAX_PARENT_AUDIO_BYTES + 1 })
    const reading = vi.spyOn(file, 'arrayBuffer')
    await expect(f.session.load(file)).rejects.toThrow('64 MiB')
    expect(reading).not.toHaveBeenCalled()
    expect(f.createContext).not.toHaveBeenCalled()
  })

  it('checks both declared and streamed response sizes before decoding', async () => {
    const f = fixture()
    f.fetchSource.mockResolvedValueOnce(new Response('small', { headers: { 'content-length': String(MAX_PARENT_AUDIO_BYTES + 1) } }))
    await expect(f.session.load('https://media.example.test/declared.mp3')).rejects.toThrow('64 MiB')
    const chunk = new Uint8Array(1024 * 1024)
    const cancelled = vi.fn()
    f.fetchSource.mockResolvedValueOnce(new Response(new ReadableStream({
      pull(controller) { controller.enqueue(chunk) }, cancel: cancelled,
    })))
    await expect(f.session.load('https://media.example.test/streamed.mp3')).rejects.toThrow('64 MiB')
    expect(cancelled).toHaveBeenCalledOnce()
    expect(f.createContext).not.toHaveBeenCalled()
  })

  it('aborts network work when the source is cleared', async () => {
    const f = fixture()
    const fetched = deferred<Response>()
    f.fetchSource.mockReturnValueOnce(fetched.promise)
    const loading = f.session.load('https://media.example.test/song.mp3')
    const cancelled = expect(loading).rejects.toMatchObject({ name: 'AbortError' })
    const signal = f.fetchSource.mock.calls[0][1]!.signal!
    f.session.clear()
    expect(signal.aborted).toBe(true)
    fetched.resolve(new Response('music'))
    await cancelled
    expect(f.createContext).not.toHaveBeenCalled()
  })
})

describe('bounded audio measurements for the renderer bridge', () => {
  it('combines intervening hits at 30 Hz, uses the audio clock and does not repeat hit frames', async () => {
    const f = fixture()
    await f.session.load(new Blob(['music']))
    await f.session.play()
    f.context.currentTime = 1
    f.queue([frame(0.97, 8), frame(0.99, 12)])
    const result = f.session.sample()
    expect(result).toMatchObject({ audioTime: 1, playing: true, loaded: true, legacyAmplitude: 128 / 255 })
    expect(result.frame).toMatchObject({ sequence: 1, time: 0.99, levels: { overall: 0.5 } })
    expect(result.frame!.hits).toHaveLength(16)
    result.frame!.levels.overall = 0
    f.context.currentTime += 1 / 60
    f.queue([frame(1.01)])
    expect(f.session.sample().frame).toBeNull()
    expect(f.analysis.drain).toHaveBeenCalledOnce()
    f.context.currentTime += 1 / 60
    expect(f.session.sample().frame).toMatchObject({ sequence: 2, levels: { overall: 0.5 } })
    f.context.currentTime += 1 / 30
    expect(f.session.sample().frame).toBeNull()
  })

  it('clears reactions across pauses/seeks and keeps bridge sequence increasing after analysis resets', async () => {
    const f = fixture()
    f.session.setSensitivity(2)
    await f.session.load(new Blob(['music']))
    expect(f.analysis.setSensitivity).toHaveBeenCalledWith(2)
    await f.session.play()
    f.queue([frame(0)])
    expect(f.session.sample().frame?.sequence).toBe(1)
    f.queue([frame(0.01)])
    f.session.pause()
    expect(f.session.sample()).toMatchObject({ frame: null, legacyAmplitude: 0, playing: false })
    await f.session.play()
    expect(f.session.sample().frame).toBeNull()
    f.session.seek(5)
    f.context.currentTime = 2
    f.queue([frame(2)])
    expect(f.session.sample().frame?.sequence).toBe(2)
    f.session.clear()
    expect(f.session.sample()).toMatchObject({ frame: null, loaded: false, legacyAmplitude: 0 })
  })

  it('drops stale or future frames and hits after a stall so the bridge stays valid', async () => {
    const f = fixture()
    await f.session.load(new Blob(['music']))
    await f.session.play()
    f.context.currentTime = 4
    f.queue([frame(2), { ...frame(3.8), hits: [
      { band: 'bass', time: 2.9, strength: 1 },
      { band: 'bass', time: 3.5, strength: 0.6 },
      { band: 'bass', time: 4.1, strength: 1 },
    ] }, frame(4.1)])
    const measurement = f.session.sample()
    expect(measurement.frame?.time).toBe(3.8)
    expect(measurement.frame?.hits).toEqual([{ band: 'bass', time: 3.5, strength: 0.6 }])
    expect(isAudioInput(measurement)).toBe(true)
  })

  it('keeps audio time and hit timestamps valid when the context passes the bridge clock ceiling', async () => {
    const f = fixture()
    await f.session.load(new Blob(['music']))
    await f.session.play()
    f.context.currentTime = BRIDGE_LIMITS.maxTime - 0.1
    f.queue([frame(f.context.currentTime)])
    const before = f.session.sample()
    expect(isAudioInput(before)).toBe(true)
    f.context.currentTime = BRIDGE_LIMITS.maxTime + 0.5
    f.queue([frame(BRIDGE_LIMITS.maxTime - 0.01), frame(BRIDGE_LIMITS.maxTime + 0.3)])
    const after = f.session.sample()
    expect(isAudioInput(after)).toBe(true)
    expect(after.audioTime).toBeCloseTo(0.5)
    expect(after.frame?.time).toBeCloseTo(0.3)
    expect(after.frame?.hits).toHaveLength(1)
    expect(after.frame?.hits[0].time).toBeCloseTo(0.3)
    expect(after.frame!.sequence).toBeGreaterThan(before.frame!.sequence)
  })
})

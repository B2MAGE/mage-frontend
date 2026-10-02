import engineSource from '@notrac/mage?raw'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Engine = Record<string, unknown>
type BufferValue = { name: string }
type LoadRequest = { path: string; succeed: (buffer: BufferValue) => void; fail: () => void }
type DecodeRequest = { succeed: (buffer: BufferValue) => void; fail: () => void }

function installedMethod(name: string, dependencies: Record<string, unknown> = {}) {
  const classStart = engineSource.indexOf('var MAGEEngine = class MAGEEngine {')
  const start = engineSource.indexOf(`\n\t${name}(`, classStart)
  const end = engineSource.indexOf('\n\t}', start)
  if (start < classStart || end <= start) throw new Error(`Missing installed engine method ${name}`)
  const body = engineSource.slice(start + 2, end + 3).replaceAll('this.#', 'this.')
  return new Function(...Object.keys(dependencies), `return function ${body}`)(...Object.values(dependencies)) as (this: Engine, ...args: unknown[]) => unknown
}

function fixture() {
  const requests: LoadRequest[] = []
  const decodes: DecodeRequest[] = []
  const readers: Reader[] = []
  const fileInput = document.createElement('input')
  fileInput.id = 'file'
  fileInput.type = 'file'
  fileInput.click = vi.fn()
  document.body.append(fileInput)
  const context = {
    decodeAudioData: vi.fn((bytes: ArrayBuffer, success: (buffer: BufferValue) => void, failure: () => void) => new Promise<BufferValue>((resolve, reject) => {
      void bytes
      decodes.push({
        succeed(buffer) { success(buffer); resolve(buffer) },
        fail() { failure(); reject(new Error('decode failed')) },
      })
    })),
  }
  class Audio {
    context = context
    buffer: BufferValue | null = null
    isPlaying = false
    pause = vi.fn()
    stop = vi.fn()
    disconnect = vi.fn()
    getVolume = vi.fn(() => 1)
    setVolume = vi.fn()
    setLoop = vi.fn()
    setBuffer = vi.fn((value: BufferValue | null) => { this.buffer = value })
  }
  class Loader {
    load(path: string, succeed: LoadRequest['succeed'], progress: unknown, fail: LoadRequest['fail']) {
      void progress
      requests.push({ path, succeed, fail })
    }
  }
  class Reader {
    readyState = 0
    result = new ArrayBuffer(2)
    listeners = new Map<string, (event: { target: Reader }) => void>()
    abort = vi.fn(() => { this.readyState = 2 })
    constructor() { readers.push(this) }
    addEventListener(name: string, callback: (event: { target: Reader }) => void) { this.listeners.set(name, callback) }
    readAsArrayBuffer() { this.readyState = 1 }
    complete() { this.readyState = 2; this.listeners.get('load')?.({ target: this }) }
    fail() { this.readyState = 2; this.listeners.get('error')?.({ target: this }) }
  }
  const dependencies = { Audio, AudioLoader: Loader, AudioAnalyser: class {}, FileReader: Reader, reverseAudioBuffer: (buffer: BufferValue) => ({ name: `reverse:${buffer.name}` }) }
  const engine: Engine = {
    listener: { context }, audio: null, reversedAudio: null, audioLoadGeneration: 0,
    isDisposed: false, isRunning: false, animationFrameId: null,
  }
  return {
    engine, requests, decodes, readers, context, fileInput,
    load: (path?: string) => installedMethod('loadAudio', dependencies).call(engine, path),
    unload: () => installedMethod('unloadAudio').call(engine),
    dispose: () => installedMethod('dispose').call(engine),
    audio: () => engine.audio as Audio | null,
    choose() {
      Object.defineProperty(fileInput, 'files', { configurable: true, value: [new File(['samples'], 'test.wav')] })
      fileInput.dispatchEvent(new Event('change'))
    },
  }
}

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren() })

describe('installed engine asynchronous audio loading', () => {
  it('keeps fast track B when slower track A completes last', () => {
    const player = fixture()
    player.load('A.wav')
    const oldAudio = player.audio()!
    player.load('B.wav')
    player.requests[1].succeed({ name: 'B' })
    player.requests[0].succeed({ name: 'A' })
    expect(player.audio()!.buffer).toEqual({ name: 'B' })
    expect((player.engine.reversedAudio as { buffer: BufferValue }).buffer).toEqual({ name: 'reverse:B' })
    expect(oldAudio.setBuffer).not.toHaveBeenCalled()
  })

  it.each(['unload', 'dispose'] as const)('ignores URL callbacks after %s without recreating audio', action => {
    const player = fixture()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    player.load('A.wav')
    player[action]()
    expect(() => player.requests[0].succeed({ name: 'A' })).not.toThrow()
    player.requests[0].fail()
    expect(player.audio()).toBeNull()
    expect(log).not.toHaveBeenCalled()
  })

  it('removes an abandoned file-picker listener before a new load', () => {
    const player = fixture()
    player.load()
    player.load('B.wav')
    player.choose()
    expect(player.readers).toHaveLength(0)
    player.requests[0].succeed({ name: 'B' })
    expect(player.audio()!.buffer).toEqual({ name: 'B' })
  })

  it('aborts an obsolete FileReader and ignores its late load/error events', () => {
    const player = fixture()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    player.load()
    player.choose()
    const reader = player.readers[0]
    player.load('B.wav')
    expect(reader.abort).toHaveBeenCalledOnce()
    reader.complete()
    reader.fail()
    expect(player.context.decodeAudioData).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })

  it('ignores a decoded uploaded track after a replacement URL track is selected', async () => {
    const player = fixture()
    player.load()
    player.choose()
    player.readers[0].complete()
    player.load('B.wav')
    player.requests[0].succeed({ name: 'B' })
    player.decodes[0].succeed({ name: 'uploaded A' })
    await Promise.resolve()
    expect(player.audio()!.buffer).toEqual({ name: 'B' })
  })

  it.each(['unload', 'dispose'] as const)('ignores decode success after %s', action => {
    const player = fixture()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    player.load()
    player.choose()
    player.readers[0].complete()
    player[action]()
    expect(() => player.decodes[0].succeed({ name: 'obsolete' })).not.toThrow()
    expect(player.audio()).toBeNull()
    player.load()
    if (action === 'dispose') {
      expect(player.readers).toHaveLength(1)
    }
    expect(log).not.toHaveBeenCalled()
  })

  it.each(['unload', 'dispose'] as const)('consumes decode rejection after %s', async action => {
    const player = fixture()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    player.load()
    player.choose()
    player.readers[0].complete()
    player[action]()
    player.decodes[0].fail()
    await Promise.resolve()
    expect(log).not.toHaveBeenCalled()
    expect(player.audio()).toBeNull()
  })

  it('still applies a current uploaded buffer and reports a current failure once', async () => {
    const player = fixture()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    player.load()
    player.choose()
    player.readers[0].complete()
    player.decodes[0].succeed({ name: 'current upload' })
    expect(player.audio()!.buffer).toEqual({ name: 'current upload' })
    player.load()
    player.choose()
    player.readers[1].complete()
    player.decodes[1].fail()
    await Promise.resolve()
    expect(log).toHaveBeenCalledTimes(1)
  })
})

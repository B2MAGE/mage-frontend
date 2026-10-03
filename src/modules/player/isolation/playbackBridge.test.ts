import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIsolatedPlaybackHost } from './playbackHost'
import { installPlaybackRuntime } from '../../../isolated-renderer/playbackRuntime'
import type { PlaybackEngine, PlaybackLoader } from '../../../isolated-renderer/playbackEngine'
import type { CaptureRequest, PlaybackMessage, PlaybackPayloads } from './playbackProtocol'

/** Both production endpoints run here; only the browser's port transport and GPU are fake. */
class LinkedPort {
  peer: LinkedPort | null = null
  closed = false
  onmessage: ((event: MessageEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  sent: PlaybackMessage[] = []
  start() {}
  close() { this.closed = true }
  postMessage(data: PlaybackMessage, transfer: Transferable[] = []) {
    if (this.closed) throw new Error('Port closed')
    const copy = structuredClone(data, { transfer })
    // Node's structuredClone creates Node-realm buffers. A real browser port
    // creates them in the recipient realm, whose ArrayBuffer validator is used.
    if (copy.type === 'captured') {
      const bytes = new ArrayBuffer(copy.payload.bytes.byteLength)
      new Uint8Array(bytes).set(new Uint8Array(copy.payload.bytes))
      copy.payload.bytes = bytes
    }
    this.sent.push(copy)
    const receiver = this.peer
    queueMicrotask(() => {
      if (receiver && !receiver.closed) receiver.onmessage?.(new MessageEvent('message', { data: copy }))
    })
  }
}
const channels: { port1: LinkedPort; port2: LinkedPort }[] = []
const cleanups: (() => void)[] = []
const origin = 'http://127.0.0.1:5178'
const scene = { visualizer: { shader: 'sphere(0.5);' }, intent: { time_multiplier: 0.5 } }

function raster(): PlaybackPayloads['captured'] {
  const bytes = new ArrayBuffer(33), data = new Uint8Array(bytes), view = new DataView(bytes)
  data.set([137, 80, 78, 71, 13, 10, 26, 10]); view.setUint32(8, 13)
  data.set([73, 72, 68, 82], 12); view.setUint32(16, 10); view.setUint32(20, 10)
  return { bytes, type: 'image/png', width: 10, height: 10 }
}
const captureRequest: CaptureRequest = { width: 10, height: 10, quality: 0.8, type: 'image/png' }
function makeEngine() {
  return {
    dispose: vi.fn(), playback: vi.fn<PlaybackEngine['playback']>(), resize: vi.fn<PlaybackEngine['resize']>(),
    input: vi.fn<PlaybackEngine['input']>(), synthetic: vi.fn<PlaybackEngine['synthetic']>(),
    zoom: vi.fn<PlaybackEngine['zoom']>(),
    capture: vi.fn<PlaybackEngine['capture']>().mockImplementation(async () => raster()),
  }
}
async function flushMessages() {
  for (let index = 0; index < 12; index++) await Promise.resolve()
}
function fixture() {
  const parent = window
  const child = Object.assign(new EventTarget(), { parent }) as unknown as Window
  const engines: ReturnType<typeof makeEngine>[] = []
  const requests: Parameters<PlaybackLoader>[0][] = []
  const loadScene = vi.fn<PlaybackLoader>().mockImplementation(async request => {
    requests.push(request)
    const engine = makeEngine()
    engines.push(engine)
    request.onFrame()
    return engine
  })
  const runtime = installPlaybackRuntime({ canvas: document.createElement('canvas'), statusElement: document.createElement('p'),
    allowedParentOrigins: [origin], targetWindow: child, loadScene })
  const container = document.createElement('div')
  document.body.append(container)
  const failure = vi.fn(), status = vi.fn(), bitmapClose = vi.fn()
  const decode = vi.fn().mockResolvedValue({ width: 10, height: 10, close: bitmapClose } as unknown as ImageBitmap)
  const host = createIsolatedPlaybackHost({ container, rendererUrl: 'http://localhost:5181/index.html',
    startupTimeoutMs: 1000, progressTimeoutMs: 1000, onStatus: status, onFailure: failure, decodeCapture: decode })
  const frame = container.querySelector('iframe')!
  const bootstrap = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((...args: unknown[]) => {
    child.dispatchEvent(new MessageEvent('message', { data: structuredClone(args[0]), source: parent, origin,
      ports: args[2] as MessagePort[] }))
  })
  frame.dispatchEvent(new Event('load'))
  cleanups.push(() => { host.dispose(); runtime.dispose(); container.remove() })
  const ports = channels.at(-1)!
  return { host, runtime, frame, failure, status, decode, bitmapClose, bootstrap, ports, engines, requests, loadScene }
}

beforeEach(() => {
  vi.useFakeTimers(); vi.stubEnv('DEV', true)
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { href: `${origin}/` } }))
  vi.stubGlobal('MessageChannel', class {
    port1 = new LinkedPort(); port2 = new LinkedPort()
    constructor() { this.port1.peer = this.port2; this.port2.peer = this.port1; channels.push(this) }
  })
  channels.length = 0
})
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  document.body.replaceChildren(); vi.clearAllTimers(); vi.useRealTimers()
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs()
})

describe('production parent and child playback bridge together', () => {
  it('bootstraps the exact frame, loads a scene and actually starts default playback', async () => {
    const f = fixture()
    await f.host.ready
    await f.host.loadScene(scene)
    await flushMessages()
    expect(f.bootstrap).toHaveBeenCalledOnce()
    expect((f.bootstrap.mock.calls[0] as unknown[])[2]).toEqual([f.ports.port2])
    expect(f.engines).toHaveLength(1)
    expect(f.engines[0].playback).toHaveBeenLastCalledWith(true)
    expect(f.status).toHaveBeenLastCalledWith('playing')
    expect(f.requests[0].scene).toMatchObject({ kind: 'custom', scene })
    expect(f.ports.port1.sent.filter(message => message.type === 'playback')).toHaveLength(1)
    expect(f.failure).not.toHaveBeenCalled()
  })

  it('replays the paused state, dimensions and simulated beat after switching scenes', async () => {
    const f = fixture()
    await f.host.ready; await f.host.loadScene(scene); await flushMessages()
    f.host.setPlayback(false); f.host.setSynthetic(true, 17, 1.5); f.host.resize(600, 400)
    await vi.advanceTimersByTimeAsync(34)
    await f.host.loadScene({ visualizer: { shader: 'box(0.5,0.5,0.5);' } })
    await vi.advanceTimersByTimeAsync(34)
    expect(f.requests[0].signal.aborted).toBe(true)
    expect(f.engines[0].dispose).toHaveBeenCalledOnce()
    expect(f.engines[1].playback).toHaveBeenLastCalledWith(false)
    expect(f.engines[1].synthetic).toHaveBeenLastCalledWith({ enabled: true, seed: 17, tempoScale: 1.5 })
    expect(f.engines[1].resize).toHaveBeenLastCalledWith({ width: 600, height: 400, pixelRatio: 1 })
    await vi.advanceTimersByTimeAsync(2500)
    expect(f.failure).not.toHaveBeenCalled()
    expect(f.status).toHaveBeenLastCalledWith('paused')
  })

  it('delivers bounded numeric audio, clock and pointer input without media metadata', async () => {
    const f = fixture()
    await f.host.ready; await f.host.loadScene(scene); await flushMessages()
    const input: PlaybackPayloads['input'] = { time: 3, pointer: { x: 0.5, y: -0.2, down: true },
      audio: { loaded: true, playing: true, audioTime: 5, legacyAmplitude: 0.4,
        frame: { time: 4.99, sequence: 1, levels: { bass: 0.8, mid: 0.2, treble: 0.1, overall: 0.5 },
          hits: [{ band: 'bass', time: 4.99, strength: 0.9 }] } } }
    f.host.update(input)
    await vi.advanceTimersByTimeAsync(34)
    expect(f.engines[0].input).toHaveBeenCalledExactlyOnceWith(input)
    const transported = f.ports.port1.sent.filter(message => message.type === 'input')
    expect(transported).toHaveLength(1)
    expect(transported[0].payload).toEqual(input)
    expect(JSON.stringify(transported)).not.toMatch(/blob:|audioPath|sourcePath|token|credentials/)
    f.requests[0].onFrame(); await flushMessages()
    expect(f.failure).not.toHaveBeenCalled()
  })

  it('transfers requested raster bytes, decodes them in the parent and closes the bitmap', async () => {
    const f = fixture()
    await f.host.ready; await f.host.loadScene(scene); await flushMessages()
    const blob = await f.host.capture(captureRequest)
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(33)
    expect(f.engines[0].capture).toHaveBeenCalledExactlyOnceWith(captureRequest)
    expect(f.decode).toHaveBeenCalledOnce()
    expect(f.bitmapClose).toHaveBeenCalledOnce()
    expect(f.failure).not.toHaveBeenCalled()
  })

  it('rejects stale captures on scene change and pending captures on disposal', async () => {
    const f = fixture()
    await f.host.ready; await f.host.loadScene(scene); await flushMessages()
    let finishOld!: (result: PlaybackPayloads['captured']) => void
    f.engines[0].capture.mockReturnValue(new Promise(resolve => { finishOld = resolve }))
    const pending = f.host.capture(captureRequest), oldRejected = expect(pending).rejects.toThrow('Scene changed.')
    await flushMessages()
    await f.host.loadScene({ visualizer: { shader: 'sphere(0.8);' } }); await flushMessages()
    await oldRejected
    finishOld(raster()); await flushMessages()
    expect(f.decode).not.toHaveBeenCalled()
    expect(f.ports.port2.sent.filter(message => message.type === 'captured')).toEqual([])
    let finishCurrent!: (result: PlaybackPayloads['captured']) => void
    f.engines[1].capture.mockReturnValue(new Promise(resolve => { finishCurrent = resolve }))
    const current = f.host.capture(captureRequest), currentRejected = expect(current).rejects.toThrow('Isolated player stopped.')
    await flushMessages()
    f.host.dispose(); await flushMessages(); await currentRejected
    finishCurrent(raster()); await flushMessages()
    expect(f.requests[1].signal.aborted).toBe(true)
    expect(f.engines[1].dispose).toHaveBeenCalledOnce()
    expect(f.frame.isConnected).toBe(false)
    expect(f.ports.port1.closed).toBe(true); expect(f.ports.port2.closed).toBe(true)
    expect(f.decode).not.toHaveBeenCalled()
    expect(f.failure).not.toHaveBeenCalled()
  })
})

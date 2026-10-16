import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { customDocument } from '@shared/test/sceneDocument'
import { createIsolatedPlaybackHost, type PlaybackHostDiagnostic } from './playbackHost'
import { playbackMessage, type PlaybackPayloads, type PlaybackType } from './playbackProtocol'
import { isSceneReplacementError, type SceneActivation } from './sceneReplacement'

const session = 'ec40c660-205d-4b63-b6b3-ac3888f8c9aa'
const scene = customDocument({ visualizer: { shader: 'sphere(1);' } })
class Port {
  onmessage: ((event: MessageEvent) => void) | null = null; onmessageerror: (() => void) | null = null
  postMessage = vi.fn(); close = vi.fn(); start = vi.fn()
}
let port: Port
function setup(progressTimeoutMs = 1000) {
  const container = document.createElement('div'); document.body.append(container)
  const onFailure = vi.fn(), onStatus = vi.fn()
  const diagnostics: PlaybackHostDiagnostic[] = []
  const host = createIsolatedPlaybackHost({ container, rendererUrl: 'http://127.0.0.1:5181/', stagedScenes: true,
    startupTimeoutMs: 1000, progressTimeoutMs, onFailure, onStatus, onDiagnostic: event => diagnostics.push(event) })
  const frame = container.querySelector('iframe')!
  const bootstrap = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
  frame.dispatchEvent(new Event('load'))
  function reply<T extends PlaybackType>(type: T, payload: PlaybackPayloads[T], generation = 1, requestId = 0) {
    port.onmessage?.({ data: playbackMessage(type, session, generation, requestId, payload) } as MessageEvent)
  }
  reply('ready', null, 0)
  const lastLoad = () => port.postMessage.mock.calls.filter(([message]) => message.type === 'load').at(-1)![0]
  function prepared(request = lastLoad()) {
    for (const phase of ['compiler-download', 'compiler-startup', 'compiling', 'graphics-download', 'graphics-startup'] as const)
      reply('load-phase', { phase, attempt: 0 }, request.generation, request.requestId)
    reply('prepared', null, request.generation, request.requestId)
  }
  async function load(activation?: SceneActivation) {
    const promise = host.loadScene(scene, 'preview', activation); await Promise.resolve()
    const request = lastLoad(); prepared(request); reply('loaded', null, request.generation, request.requestId); await promise
    return request
  }
  return { host, port, frame, bootstrap, onFailure, onStatus, diagnostics, reply, prepared, lastLoad, load }
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubEnv('DEV', true); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.stubGlobal('window', { location: { href: 'http://localhost:5178/' }, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(session)
  vi.stubGlobal('MessageChannel', class { port1 = new Port(); port2 = new Port(); constructor() { port = this.port1 } })
})
afterEach(() => { document.body.replaceChildren(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('staged playback host', () => {
  it('opts into staged scenes and approves even the first scene before activation', async () => {
    const f = setup(), beforeActivate = vi.fn(), onActivated = vi.fn()
    const loading = f.host.loadScene(scene, 'preview', { beforeActivate, onActivated }); await Promise.resolve()
    const request = f.lastLoad()
    expect(f.bootstrap.mock.calls[0][0].payload.stagedScenes).toBe(true)
    expect(beforeActivate).not.toHaveBeenCalled()
    f.prepared(request)
    expect(beforeActivate).toHaveBeenCalledOnce(); expect(onActivated).not.toHaveBeenCalled()
    expect(f.port.postMessage.mock.calls.at(-1)![0]).toMatchObject({ type: 'activate', generation: request.generation })
    f.reply('loaded', null, request.generation, request.requestId); await loading
    expect(onActivated).toHaveBeenCalledOnce(); expect(f.onFailure).not.toHaveBeenCalled(); f.host.dispose()
  })
  it('preserves healthy active playback and independent progress during candidate compilation failure', async () => {
    const f = setup(); await f.load()
    const replacement = f.host.loadScene(scene), rejected = expect(replacement).rejects.toMatchObject({ reason: 'compile', retained: true })
    await Promise.resolve(); const request = f.lastLoad()
    for (let index = 1; index <= 8; index++) { await vi.advanceTimersByTimeAsync(250); f.reply('progress', { frames: index }, 1) }
    f.host.setPlayback(false)
    expect(f.port.postMessage.mock.calls.at(-1)![0]).toMatchObject({ type: 'playback', generation: 1 })
    f.reply('candidate-error', { code: 'compile', retained: true }, request.generation, request.requestId); await rejected
    expect(f.frame.isConnected).toBe(true); expect(f.onFailure).not.toHaveBeenCalled()
    expect(f.onStatus).toHaveBeenLastCalledWith('paused'); f.host.dispose()
  })
  it.each([false, true])('keeps exact candidate failure evidence for Retry/retention with active scene=%s', async active => {
    const f = setup(); if (active) await f.load()
    const loading = f.host.loadScene(scene), rejected = expect(loading).rejects.toMatchObject({ reason: 'compile-timeout', retained: active })
    await Promise.resolve(); const request = f.lastLoad()
    for (const phase of ['compiler-download', 'compiler-startup', 'compiling'] as const)
      f.reply('load-phase', { phase, attempt: 0 }, request.generation, request.requestId)
    f.reply('candidate-error', { code: 'compile-timeout', retained: active }, request.generation, request.requestId); await rejected
    expect(f.diagnostics).toContainEqual(expect.objectContaining({ type: 'operation', operation: 'load', generation: request.generation,
      requestId: request.requestId, phase: 'failed', reason: 'timeout', failureReason: 'compile-timeout', retained: active }))
    expect(f.onFailure).not.toHaveBeenCalled(); f.host.dispose()
  })
  it.each(['context-lost', 'progress-timeout'] as const)('attributes %s to the active scene while retaining separate candidate evidence', async failure => {
    const f = setup(), first = await f.load()
    const replacement = f.host.loadScene(scene), rejected = expect(replacement).rejects.toThrow(/stopped/)
    await Promise.resolve(); const candidate = f.lastLoad()
    for (const phase of ['compiler-download', 'compiler-startup', 'compiling'] as const)
      f.reply('load-phase', { phase, attempt: 0 }, candidate.generation, candidate.requestId)
    if (failure === 'context-lost') f.reply('error', { code: failure }, first.generation, first.requestId)
    else await vi.advanceTimersByTimeAsync(1250)
    await rejected
    expect(f.diagnostics.at(-1)).toMatchObject({ type: 'failure', reason: failure, generation: first.generation, requestId: first.requestId, phase: null,
      activeGeneration: first.generation, activeRequestId: first.requestId, candidateGeneration: candidate.generation,
      candidateRequestId: candidate.requestId, candidatePhase: 'compiling' })
  })
  it('permits an existing graphics session to skip only its already-completed engine download', async () => {
    const f = setup(); await f.load()
    const replacement = f.host.loadScene(scene); await Promise.resolve(); const request = f.lastLoad()
    for (const phase of ['compiler-download', 'compiler-startup', 'compiling', 'graphics-startup'] as const)
      f.reply('load-phase', { phase, attempt: 0 }, request.generation, request.requestId)
    f.reply('prepared', null, request.generation, request.requestId)
    f.reply('loaded', null, request.generation, request.requestId); await replacement
    expect(f.onFailure).not.toHaveBeenCalled(); expect(f.frame.isConnected).toBe(true); f.host.dispose()
  })
  it.each([false, true])('rejects skipped required phase transitions with active scene=%s', async active => {
    const f = setup(); if (active) await f.load()
    const replacement = f.host.loadScene(scene), failed = expect(replacement).rejects.toThrow(/stopped/)
    await Promise.resolve(); const request = f.lastLoad()
    const phases = active ? ['compiler-download', 'compiler-startup', 'graphics-startup'] as const
      : ['compiler-download', 'compiler-startup', 'compiling', 'graphics-startup'] as const
    for (const phase of phases) f.reply('load-phase', { phase, attempt: 0 }, request.generation, request.requestId)
    await failed; expect(f.onFailure).toHaveBeenCalledExactlyOnceWith('runtime')
  })
  it('rejects an unhealthy candidate startup even while old frames remain healthy', async () => {
    const f = setup(); await f.load()
    const replacement = f.host.loadScene(scene), rejected = expect(replacement).rejects.toMatchObject({ reason: 'startup-timeout', retained: true })
    await Promise.resolve(); const request = f.lastLoad()
    for (const phase of ['compiler-download', 'compiler-startup', 'compiling', 'graphics-download', 'graphics-startup'] as const)
      f.reply('load-phase', { phase, attempt: 0 }, request.generation, request.requestId)
    for (let index = 1; index <= 4; index++) { await vi.advanceTimersByTimeAsync(250); f.reply('progress', { frames: index }, 1) }
    await rejected
    expect(f.port.postMessage.mock.calls.some(([message]) => message.type === 'cancel-load' && message.generation === 2)).toBe(true)
    expect(f.onFailure).not.toHaveBeenCalled(); expect(f.frame.isConnected).toBe(true); f.host.dispose()
  })
  it('retains active context-loss and silence supervision while a candidate is preparing', async () => {
    const f = setup(); await f.load()
    const replacement = f.host.loadScene(scene), rejected = expect(replacement).rejects.toThrow(/stopped/)
    await Promise.resolve()
    f.reply('error', { code: 'context-lost' }, 1, 1)
    await rejected; expect(f.onFailure).toHaveBeenCalledExactlyOnceWith('context-lost')
    const g = setup(); await g.load()
    const next = g.host.loadScene(scene), stopped = expect(next).rejects.toThrow(/stopped/)
    await Promise.resolve(); await vi.advanceTimersByTimeAsync(1250); await stopped
    expect(g.onFailure).toHaveBeenCalledExactlyOnceWith('progress-timeout')
  })
  it('rejects a revoked or superseded candidate at the activation boundary without stopping the old scene', async () => {
    const f = setup(); await f.load()
    const onActivated = vi.fn()
    const replacement = f.host.loadScene(scene, 'preview', { beforeActivate() { throw new Error('Permission changed.') }, onActivated })
    const rejected = expect(replacement).rejects.toThrow('Permission changed.')
    await Promise.resolve(); const request = f.lastLoad(); f.prepared(request); await rejected
    expect(onActivated).not.toHaveBeenCalled()
    expect(f.port.postMessage.mock.calls.some(([message]) => message.type === 'activate' && message.generation === 2)).toBe(false)
    expect(f.onFailure).not.toHaveBeenCalled(); expect(f.frame.isConnected).toBe(true); f.host.dispose()
  })
  it('finishes an already-posted commit before dispatching only the newest queued scene', async () => {
    const f = setup(), committed: number[] = []; await f.load()
    const second = f.host.loadScene(scene, 'preview', { beforeActivate() {}, onActivated() { committed.push(2) } })
    await Promise.resolve(); const two = f.lastLoad(); f.prepared(two)
    expect(f.host.cancelPendingLoad()).toBeNull()
    const third = f.host.loadScene(scene), stale = expect(third).rejects.toThrow('Scene changed.')
    const fourth = f.host.loadScene(scene, 'preview', { beforeActivate() {}, onActivated() { committed.push(4) } })
    await Promise.resolve()
    expect(f.port.postMessage.mock.calls.filter(([message]) => message.type === 'load')).toHaveLength(2)
    f.reply('loaded', null, two.generation, two.requestId); await second; await stale; await Promise.resolve()
    expect(committed).toEqual([2])
    const four = f.lastLoad(); expect(four.generation).toBe(4)
    f.prepared(four); f.reply('loaded', null, four.generation, four.requestId); await fourth
    expect(committed).toEqual([2, 4]); expect(f.onFailure).not.toHaveBeenCalled(); f.host.dispose()
  })
  it('does not abandon uncertain activation ownership when its acknowledgment is missing', async () => {
    const f = setup(); await f.load()
    const second = f.host.loadScene(scene), stopped = expect(second).rejects.toThrow(/stopped/)
    await Promise.resolve(); f.prepared()
    for (let index = 1; index <= 4; index++) { await vi.advanceTimersByTimeAsync(250); f.reply('progress', { frames: index }, 1) }
    await stopped; expect(f.onFailure).toHaveBeenCalledExactlyOnceWith('startup-timeout')
  })
  it('never treats invalid handshakes or ownership claims as a harmless scene error', async () => {
    const f = setup(); const first = f.host.loadScene(scene), rejected = expect(first).rejects.toThrow(/stopped/)
    await Promise.resolve(); const request = f.lastLoad()
    f.reply('loaded', null, request.generation, request.requestId); await rejected
    expect(f.onFailure).toHaveBeenCalledExactlyOnceWith('runtime')
    const g = setup(); await g.load()
    const next = g.host.loadScene(scene), failed = expect(next).rejects.toThrow(/stopped/)
    await Promise.resolve(); const replacement = g.lastLoad()
    g.reply('candidate-error', { code: 'compile', retained: false }, replacement.generation, replacement.requestId); await failed
    expect(g.onFailure).toHaveBeenCalledExactlyOnceWith('runtime')
    expect(isSceneReplacementError(new Error('fake'))).toBe(false)
  })
})

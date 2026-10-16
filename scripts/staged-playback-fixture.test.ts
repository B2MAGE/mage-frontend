import { afterEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { STAGED_SETUP, isStagedSetup, isStagedMarker, fixedStagedScene, stagedPlaybackFixture, type StagedCase } from './staged-playback-fixture'
import { playbackMessage, sceneForBridge } from '../src/modules/player/isolation/playbackProtocol'
import type { PlaybackEngine, PlaybackLoader, PreparePlaybackSceneOptions } from '../src/isolated-renderer/playbackEngine'

const session = '26e6ed65-9fe6-4c26-90cc-8f43d193f692', nonce = 'a'.repeat(32)
const releases: (() => void)[] = []
afterEach(() => { releases.splice(0).forEach(release => release()); vi.useRealTimers(); vi.restoreAllMocks() })
async function fixture(check: StagedCase) {
  const dom = new JSDOM('<canvas></canvas>', { url: 'http://localhost:5181/' }); releases.push(() => dom.window.close())
  const canvas = dom.window.document.querySelector('canvas')!
  const prepared = { activate: vi.fn(), discard: vi.fn() }
  const prepare = vi.fn(async () => prepared)
  const engine = { prepareScene: prepare } as unknown as PlaybackEngine
  const realLoader = vi.fn<PlaybackLoader>(async () => engine)
  const port = { postMessage: vi.fn(), close: vi.fn(), start: vi.fn(), onmessage: null, onmessageerror: null }
  const evidence = { postMessage: vi.fn(), close: vi.fn() }
  const connection = { data: playbackMessage('connect', session, 0, 0, { startupPhases: true, stagedScenes: true }), ports: [port] } as unknown as MessageEvent
  const adapted = stagedPlaybackFixture({ type: STAGED_SETUP, case: check, nonce }, evidence as unknown as MessagePort, connection, realLoader)
  const abort = new AbortController()
  const options = { canvas, scene: {}, profile: 'preview', signal: abort.signal, sceneRevision: 1, onFrame() {}, onError() {} } as Parameters<PlaybackLoader>[0]
  const active = await adapted.loadScene(options)
  const request: PreparePlaybackSceneOptions = { scene: {}, profile: 'preview', signal: abort.signal, sceneRevision: 2 }
  return { canvas, active, adapted, request, abort, options, realLoader, prepare, prepared, evidence, port }
}
describe('diagnostics-only staged faults', () => {
  it('uses current-format scenes so rejection tests reach the compiler rather than failing the bridge schema', () => {
    expect(() => sceneForBridge(fixedStagedScene())).not.toThrow()
    expect(() => sceneForBridge(fixedStagedScene('notARealShaderPrimitive(0.7);'))).not.toThrow()
  })
  it('accepts only fixed cases and bounded markers without reading getters', () => {
    const setup = { type: STAGED_SETUP, case: 'first-frame-failure', nonce }
    expect(isStagedSetup(setup)).toBe(true)
    const getter = vi.fn(() => nonce)
    for (const value of [{ ...setup, code: 'arbitrary' }, { ...setup, case: 'run' }, { ...setup, nonce: 'x' },
      { ...setup, get nonce() { return getter() } }]) expect(isStagedSetup(value)).toBe(false)
    expect(getter).not.toHaveBeenCalled()
    expect(isStagedMarker({ case: setup.case, nonce, event: 'armed' })).toBe(true)
    expect(isStagedMarker({ case: setup.case, nonce, event: 'arbitrary reason' })).toBe(false)
  })
  it('does not inject a compiler result or alter initial scene loading', async () => {
    const f = await fixture('compile-failure')
    expect(f.realLoader).toHaveBeenCalledOnce(); expect(f.realLoader.mock.calls[0][0]).toBe(f.options)
    await expect(f.active.prepareScene!(f.request)).resolves.toBe(f.prepared)
    expect(f.prepare).toHaveBeenCalledExactlyOnceWith(f.request); expect(f.prepared.discard).not.toHaveBeenCalled()
  })
  it('injects one post-first-use rejection and releases its prepared resources', async () => {
    const f = await fixture('first-frame-failure')
    await expect(f.active.prepareScene!(f.request)).rejects.toThrow('Fixed first-use')
    expect(f.prepare).toHaveBeenCalledOnce(); expect(f.prepared.discard).toHaveBeenCalledOnce()
    expect(f.prepared.activate).not.toHaveBeenCalled()
    expect(f.evidence.postMessage).toHaveBeenCalledWith({ case: 'first-frame-failure', nonce, event: 'first-frame-rejected' })
    await expect(f.active.prepareScene!({ ...f.request, sceneRevision: 3 })).resolves.toBe(f.prepared)
  })
  it('delays one real prepared result so the runtime can reject its obsolete completion', async () => {
    vi.useFakeTimers(); const f = await fixture('obsolete-candidate')
    let settled = false
    const candidate = f.active.prepareScene!(f.request).then(value => { settled = true; return value })
    await Promise.resolve(); f.abort.abort(); expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(750)
    await expect(candidate).resolves.toBe(f.prepared)
    expect(f.evidence.postMessage.mock.calls.map(([marker]) => marker.event)).toEqual(['armed', 'candidate-held', 'candidate-released'])
  })
  it('drops only selected optional replies and preserves ordinary playback messages', async () => {
    const f = await fixture('optional-timeouts'), adapted = f.adapted.initialConnection.ports[0]
    adapted.postMessage(playbackMessage('capabilities-result', session, 1, 2, { supportedTargets: [] }))
    adapted.postMessage(playbackMessage('captured', session, 1, 3, { bytes: new ArrayBuffer(1), type: 'image/png', width: 1, height: 1 }))
    const progress = playbackMessage('progress', session, 1, 0, { frames: 20 })
    adapted.postMessage(progress)
    expect(f.port.postMessage).toHaveBeenCalledExactlyOnceWith(progress, [])
    expect(f.evidence.postMessage.mock.calls.map(([marker]) => marker.event)).toEqual(['armed', 'optional-reply-dropped', 'optional-reply-dropped'])
    adapted.close(); expect(f.port.close).toHaveBeenCalledOnce(); expect(f.evidence.close).toHaveBeenCalledOnce()
  })
  it('uses the real context-loss extension and waits for actual session cancellation', async () => {
    const f = await fixture('context-loss'), loseContext = vi.fn()
    vi.spyOn(f.canvas, 'getContext').mockReturnValue({ getExtension: () => ({ loseContext }) } as unknown as WebGL2RenderingContext)
    const work = f.active.prepareScene!(f.request), rejected = expect(work).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve(); expect(loseContext).toHaveBeenCalledOnce()
    expect(f.evidence.postMessage).toHaveBeenCalledWith({ case: 'context-loss', nonce, event: 'context-loss-requested' })
    f.abort.abort(); await rejected
  })
  it('reports unavailable context-loss support without inventing a loss event', async () => {
    const f = await fixture('context-loss'); vi.spyOn(f.canvas, 'getContext').mockReturnValue(null)
    await expect(f.active.prepareScene!(f.request)).rejects.toThrow('unavailable')
    expect(f.prepared.discard).toHaveBeenCalledOnce()
    expect(f.evidence.postMessage).toHaveBeenCalledWith({ case: 'context-loss', nonce, event: 'context-loss-unavailable' })
  })
})

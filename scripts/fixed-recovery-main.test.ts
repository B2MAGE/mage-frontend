import { afterEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { fixedRecoveryConnection } from '../src/modules/player/isolation/fixedRecoveryProtocol'
import { playbackMessage } from '../src/modules/player/isolation/playbackProtocol'

const mocks = vi.hoisted(() => ({ sample: vi.fn(), playback: vi.fn(), worker: vi.fn(), recovery: vi.fn() }))
vi.mock('../src/isolated-renderer/boundary', () => ({ verifyOpaqueSandbox: () => true }))
vi.mock('../src/isolated-renderer/runtime', () => ({ installRendererRuntime: mocks.sample }))
vi.mock('../src/isolated-renderer/sample', () => ({ loadKnownSample: vi.fn() }))
vi.mock('../src/isolated-renderer/playbackRuntime', () => ({ installPlaybackRuntime: mocks.playback }))
vi.mock('../src/isolated-renderer/playbackEngine', () => ({ loadPlaybackEngine: vi.fn() }))
vi.mock('./worker-check-child', () => ({ installFixedWorkerCheck: mocks.worker }))
vi.mock('./fixed-recovery-child', () => ({ installFixedRecoveryCheck: mocks.recovery }))
let dom: JSDOM | null = null
afterEach(() => { dom?.window.close(); dom = null; vi.unstubAllGlobals(); vi.clearAllMocks() })
describe('fixed recovery selection', () => {
  it('authenticates the narrow bootstrap and commits to exactly one runtime', async () => {
    vi.resetModules()
    dom = new JSDOM('<canvas id="renderer-canvas"></canvas><p id="renderer-status"></p>')
    vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document); vi.stubGlobal('HTMLCanvasElement', dom.window.HTMLCanvasElement)
    const origin = 'http://127.0.0.1:5178', parent = {}, session = 'a'.repeat(32)
    vi.stubGlobal('__MAGE_RENDERER_PARENT_ORIGINS__', [origin])
    Object.defineProperty(dom.window, 'parent', { value: parent })
    await import('./diagnostics-renderer-main')
    const send = (data: unknown, source: unknown = parent, senderOrigin = origin, ports: unknown[] = [{}]) => {
      dom!.window.dispatchEvent(Object.assign(new dom!.window.Event('message'), { data, source, origin: senderOrigin, ports }))
    }
    const connection = fixedRecoveryConnection(session, { case: 'message-flood', nonce: 'b'.repeat(32) })
    send({ ...connection, source: 'arbitrary code' }); send(connection, {}); send(connection, parent, 'https://other.example'); send(connection, parent, origin, [])
    expect(Object.values(mocks).every(mock => mock.mock.calls.length === 0)).toBe(true)
    const port = { start: vi.fn(), close: vi.fn(), postMessage: vi.fn(), onmessage: null as ((event: { data: unknown }) => void) | null }
    const playbackPort = { start: vi.fn(), close: vi.fn(), postMessage: vi.fn(), onmessage: null, onmessageerror: null }
    send({ type: 'mage-local-recovery-setup', case: 'message-flood', nonce: 'b'.repeat(32) }, parent, origin, [port])
    send(playbackMessage('connect', session, 0, 0, null), parent, origin, [playbackPort])
    expect(mocks.recovery).toHaveBeenCalledOnce()
    const adapted = mocks.recovery.mock.calls[0][0].initialConnection.ports[0] as MessagePort
    const marker = { ...connection, type: 'marker', event: 'action', atMs: 1 }
    const failure = playbackMessage('error', session, 1, 1, { code: 'render' })
    adapted.postMessage(marker); adapted.postMessage(failure); adapted.close()
    expect(port.postMessage).toHaveBeenCalledWith(marker)
    expect(playbackPort.postMessage).not.toHaveBeenCalled(); expect(playbackPort.close).not.toHaveBeenCalled()
    port.onmessage!({ data: { ack: 1 } })
    expect(playbackPort.postMessage).toHaveBeenCalledWith(failure, [])
    expect(playbackPort.close).toHaveBeenCalledOnce()
    send(connection); send(playbackMessage('connect', session, 0, 0, null))
    expect(Object.values(mocks).reduce((count, mock) => count + mock.mock.calls.length, 0)).toBe(1)
  })
})

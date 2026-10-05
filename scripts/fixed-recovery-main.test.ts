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
    const origin = 'https://mage.peterbucci.com', parent = {}, session = 'a'.repeat(32)
    vi.stubGlobal('__MAGE_RENDERER_PARENT_ORIGINS__', [origin])
    Object.defineProperty(dom.window, 'parent', { value: parent })
    await import('../src/isolated-renderer/main')
    const send = (data: unknown, source: unknown = parent, senderOrigin = origin, ports: unknown[] = [{}]) => {
      dom!.window.dispatchEvent(Object.assign(new dom!.window.Event('message'), { data, source, origin: senderOrigin, ports }))
    }
    const connection = fixedRecoveryConnection(session, { case: 'message-flood', nonce: 'b'.repeat(32) })
    send({ ...connection, source: 'arbitrary code' }); send(connection, {}); send(connection, parent, 'https://other.example'); send(connection, parent, origin, [])
    expect(Object.values(mocks).every(mock => mock.mock.calls.length === 0)).toBe(true)
    send(connection)
    expect(mocks.recovery).toHaveBeenCalledOnce()
    send(connection); send(playbackMessage('connect', session, 0, 0, null))
    expect(Object.values(mocks).reduce((count, mock) => count + mock.mock.calls.length, 0)).toBe(1)
  })
})

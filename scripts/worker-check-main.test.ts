import { afterEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { rendererMessage } from '../src/modules/player/isolation/protocol'
import { playbackMessage } from '../src/modules/player/isolation/playbackProtocol'
import { WORKER_CHECK_PROTOCOL } from './worker-check-fixture'

const mocks = vi.hoisted(() => ({ sample: vi.fn(), playback: vi.fn(), fixed: vi.fn() }))
vi.mock('../src/isolated-renderer/boundary', () => ({ verifyOpaqueSandbox: () => true }))
vi.mock('../src/isolated-renderer/runtime', () => ({ installRendererRuntime: mocks.sample }))
vi.mock('../src/isolated-renderer/sample', () => ({ loadKnownSample: vi.fn() }))
vi.mock('../src/isolated-renderer/playbackRuntime', () => ({ installPlaybackRuntime: mocks.playback }))
vi.mock('../src/isolated-renderer/playbackEngine', () => ({ loadPlaybackEngine: vi.fn() }))
vi.mock('./worker-check-child', () => ({ installFixedWorkerCheck: mocks.fixed }))
let dom: JSDOM | null = null
afterEach(() => { dom?.window.close(); dom = null; vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('renderer protocol selection remains compatible', () => {
  const nonce = 'a'.repeat(32), origin = 'https://mage.peterbucci.com'
  const fixed = { protocol: WORKER_CHECK_PROTOCOL, version: 1, type: 'connect', nonce }
  async function open() {
    vi.resetModules()
    dom = new JSDOM('<canvas id="renderer-canvas"></canvas><p id="renderer-status"></p>')
    vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document); vi.stubGlobal('HTMLCanvasElement', dom.window.HTMLCanvasElement)
    vi.stubGlobal('__MAGE_RENDERER_PARENT_ORIGINS__', [origin])
    const parent = {}
    Object.defineProperty(dom.window, 'parent', { value: parent })
    await import('../src/isolated-renderer/main')
    return (data: unknown, senderOrigin = origin, source: unknown = parent, ports: unknown[] = [{}]) => {
      const event = Object.assign(new dom!.window.Event('message'), { data, origin: senderOrigin, source, ports })
      dom!.window.dispatchEvent(event)
    }
  }

  it.each([
    ['sample', rendererMessage('connect', nonce)],
    ['playback', playbackMessage('connect', nonce, 0, 0, null)],
    ['fixed', fixed],
  ] as const)('selects %s once and does not run another protocol in that frame', async (kind, message) => {
    const send = await open()
    expect(mocks.sample).not.toHaveBeenCalled(); expect(mocks.playback).not.toHaveBeenCalled(); expect(mocks.fixed).not.toHaveBeenCalled()
    send(message)
    expect(mocks[kind]).toHaveBeenCalledOnce()
    send(fixed); send(rendererMessage('connect', nonce)); send(playbackMessage('connect', nonce, 0, 0, null))
    expect(Object.values(mocks).reduce((count, mock) => count + mock.mock.calls.length, 0)).toBe(1)
  })

  it('does not select the fixed protocol for another origin, another window, missing port or arbitrary source', async () => {
    const send = await open()
    send(fixed, 'https://other.example'); send(fixed, origin, {})
    send(fixed, origin, dom!.window.parent, [])
    send({ ...fixed, source: 'sphere(1)' })
    expect(mocks.fixed).not.toHaveBeenCalled()
    send(fixed)
    expect(mocks.fixed).toHaveBeenCalledOnce()
  })
})

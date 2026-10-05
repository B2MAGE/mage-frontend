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

describe('published renderer accepts ordinary playback only', () => {
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

  it('ignores retired sample and diagnostic connections, then accepts playback once', async () => {
    const send = await open()
    send(fixed); send(rendererMessage('connect', nonce))
    send({ protocol: 'mage-fixed-renderer-recovery', version: 1, type: 'connect', session: nonce, nonce, case: 'context-loss' })
    expect(Object.values(mocks).every(mock => mock.mock.calls.length === 0)).toBe(true)
    send(playbackMessage('connect', nonce, 0, 0, null))
    expect(mocks.playback).toHaveBeenCalledOnce()
    send(playbackMessage('connect', nonce, 0, 0, null)); send(fixed)
    expect(Object.values(mocks).reduce((count, mock) => count + mock.mock.calls.length, 0)).toBe(1)
  })

  it('requires the configured parent, exact playback payload and one private port', async () => {
    const send = await open(), message = playbackMessage('connect', nonce, 0, 0, null)
    send(message, 'https://other.example'); send(message, origin, {})
    send(message, origin, dom!.window.parent, []); send({ ...message, source: 'sphere(1)' })
    expect(mocks.playback).not.toHaveBeenCalled()
    send(message)
    expect(mocks.playback).toHaveBeenCalledOnce()
  })
})

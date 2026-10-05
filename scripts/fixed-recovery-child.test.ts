import { afterEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { installFixedRecoveryCheck } from './fixed-recovery-child'
import { fixedRecoveryConnection, fixedRecoveryScene, isFixedRecoveryConnection, isFixedRecoveryMarker, type FixedRecoveryCase } from '../src/modules/player/isolation/fixedRecoveryProtocol'
import { playbackMessage } from '../src/modules/player/isolation/playbackProtocol'
import type { PlaybackLoader } from '../src/isolated-renderer/playbackEngine'

const origin = 'https://mage.peterbucci.com', session = '26e6ed65-9fe6-4c26-90cc-8f43d193f692', nonce = 'a'.repeat(32)
const releases: (() => void)[] = []
afterEach(() => { releases.splice(0).forEach(release => release()); vi.useRealTimers(); vi.restoreAllMocks() })
function setup(fixedCase: FixedRecoveryCase = 'window-message', overrides: Partial<MessageEvent> = {}) {
  vi.useFakeTimers()
  const dom = new JSDOM('<canvas></canvas><p></p>')
  releases.push(() => dom.window.close())
  const canvas = dom.window.document.querySelector('canvas')!, statusElement = dom.window.document.querySelector('p')!
  const target = Object.assign(new EventTarget(), { parent: { postMessage: vi.fn() } }) as unknown as Window
  const port = { postMessage: vi.fn(), close: vi.fn(), start: vi.fn(), onmessage: null as ((event: MessageEvent) => void) | null,
    onmessageerror: null as (() => void) | null }
  const engine = { dispose: vi.fn(), resize: vi.fn(), input: vi.fn(), playback: vi.fn(), synthetic: vi.fn(), audioResponse: vi.fn(), zoom: vi.fn(),
    capabilities: vi.fn(() => ({ supportedTargets: ['size' as const] })), capture: vi.fn(async () => ({ bytes: new ArrayBuffer(12), type: 'image/png' as const, width: 10, height: 10 })) }
  const loadScene = vi.fn<PlaybackLoader>(async options => {
    options.canvas.addEventListener('webglcontextlost', options.onError)
    return engine
  })
  const connection = fixedRecoveryConnection(session, { case: fixedCase, nonce })
  const initialConnection = { source: target.parent, origin, data: connection, ports: [port], ...overrides } as unknown as MessageEvent
  const check = installFixedRecoveryCheck({ canvas, statusElement, targetWindow: target, allowedParentOrigins: [origin], initialConnection }, loadScene)
  if (check) releases.push(check.dispose)
  let request = 0
  const send = (type: 'load' | 'capture' | 'dispose', payload: unknown) => port.onmessage?.({ data: playbackMessage(type, session, 1, ++request, payload as never) } as MessageEvent)
  const load = async () => { send('load', { scene: { visualizer: { shader: 'private arbitrary source ignored' } }, profile: 'full' }); await Promise.resolve(); await Promise.resolve() }
  const messages = () => port.postMessage.mock.calls.map(([message]) => message)
  return { check, target, port, canvas, dom, engine, loadScene, load, send, messages }
}

describe('fixed recovery bootstrap and child', () => {
  it('rejects malformed cases, arbitrary code/URLs, wrong identities and getters without executing them', () => {
    const valid = fixedRecoveryConnection(session, { case: 'context-loss', nonce })
    expect(isFixedRecoveryConnection(valid)).toBe(true)
    const getter = vi.fn(() => nonce)
    for (const value of [{ ...valid, code: 'sphere(1);' }, { ...valid, url: '/api' }, { ...valid, case: 'run' }, { ...valid, version: 2 },
      { ...valid, nonce: 'x' }, { ...valid, session: '' }, { ...valid, get nonce() { return getter() } }]) expect(isFixedRecoveryConnection(value)).toBe(false)
    expect(getter).not.toHaveBeenCalled()
    for (const overrides of [{ origin: 'https://other.example' }, { source: {} as Window }, { ports: [] }]) {
      const f = setup('context-loss', overrides)
      expect(f.check).toBeNull(); expect(f.port.postMessage).not.toHaveBeenCalled(); expect(f.loadScene).not.toHaveBeenCalled()
    }
  })
  it('uses only its fixed bounded scene and preserves capture transfer ownership', async () => {
    const f = setup()
    await f.load()
    expect(f.loadScene.mock.calls[0][0]).toMatchObject({ scene: fixedRecoveryScene(), profile: 'preview' })
    expect(JSON.stringify(f.loadScene.mock.calls)).not.toContain('private arbitrary source')
    f.send('capture', { width: 10, height: 10, type: 'image/png', quality: 0.8 })
    await Promise.resolve(); await Promise.resolve()
    const capture = f.port.postMessage.mock.calls.find(([message]) => message.type === 'captured')!
    expect(capture[1]).toEqual([capture[0].payload.bytes])
    f.check!.dispose()
    expect(f.loadScene.mock.calls[0][0].signal.aborted).toBe(true)
    expect(f.port.close).toHaveBeenCalledOnce(); expect(f.engine.dispose).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('suppresses only ready and reports the actual fixed connection without allocating graphics', () => {
    const f = setup('missing-ready')
    expect(f.messages()).toEqual([expect.objectContaining({ type: 'marker', event: 'connected', case: 'missing-ready' })])
    expect(f.messages().every(isFixedRecoveryMarker)).toBe(true)
    expect(f.loadScene).not.toHaveBeenCalled()
  })
  it('sends the spoof only through window and sends ordered action proof through the private port', async () => {
    const f = setup()
    await f.load(); await vi.advanceTimersByTimeAsync(150)
    expect(f.target.parent.postMessage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'error', session, payload: { code: 'render' } }), '*')
    expect(f.messages().filter(message => message.type === 'error')).toEqual([])
    expect(f.messages().filter(message => message.type === 'marker').map(message => message.event)).toEqual(['connected', 'action'])
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['unknown-message', 'message-flood'] as const)('emits the fixed %s only after load, once and within its bound', async fixedCase => {
    const f = setup(fixedCase)
    await f.load()
    expect(f.messages().some(message => message.type === 'navigate')).toBe(false)
    await vi.advanceTimersByTimeAsync(150)
    const messages = f.messages(), action = messages.findIndex(message => message.type === 'marker' && message.event === 'action')
    expect(messages.slice(action + 1)).toHaveLength(fixedCase === 'message-flood' ? 50 : 1)
    expect(messages.at(-1).type).toBe(fixedCase === 'message-flood' ? 'progress' : 'navigate')
    await vi.advanceTimersByTimeAsync(5000)
    expect(f.messages()).toHaveLength(messages.length)
  })
  it('records real context loss before the normal runtime failure, not just extension invocation', async () => {
    const f = setup('context-loss')
    const loseContext = vi.fn(() => f.canvas.dispatchEvent(new f.dom.window.Event('webglcontextlost')))
    vi.spyOn(f.canvas, 'getContext').mockReturnValue({ getExtension: () => ({ loseContext }) } as unknown as WebGLRenderingContext)
    await f.load(); await vi.advanceTimersByTimeAsync(150)
    const messages = f.messages()
    expect(loseContext).toHaveBeenCalledOnce()
    expect(messages.filter(message => message.type === 'marker').map(message => message.event)).toEqual(['connected', 'action', 'context-lost'])
    expect(messages.at(-1)).toMatchObject({ type: 'error', payload: { code: 'render' } })
    expect(f.engine.dispose).toHaveBeenCalledOnce(); expect(f.port.close).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('reports an unavailable context-loss extension without inventing observed loss', async () => {
    const f = setup('context-loss')
    vi.spyOn(f.canvas, 'getContext').mockReturnValue({ getExtension: () => null } as unknown as WebGLRenderingContext)
    await f.load(); await vi.advanceTimersByTimeAsync(150)
    expect(f.messages().filter(message => message.type === 'marker').map(message => message.event)).toEqual(['connected', 'unsupported'])
    expect(f.messages().some(message => message.type === 'error')).toBe(false)
  })
  it('page exit cancels pending actions and ignores later commands', async () => {
    const f = setup('message-flood')
    await f.load()
    f.target.dispatchEvent(new Event('pagehide'))
    const before = f.messages().length
    await vi.advanceTimersByTimeAsync(1000); await f.load()
    expect(f.messages()).toHaveLength(before)
    expect(f.loadScene).toHaveBeenCalledOnce()
    expect(f.port.close).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
  })
})

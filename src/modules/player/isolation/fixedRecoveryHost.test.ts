import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIsolatedPlaybackHost } from './playbackHost'
import { FIXED_RECOVERY_PROTOCOL, fixedRecoveryConnection, type FixedRecoveryMarker } from './fixedRecoveryProtocol'
import { playbackMessage } from './playbackProtocol'

const session = '625a276a-cc12-4235-86f5-d40c26b1d083', nonce = 'a'.repeat(32)
class Port {
  onmessage: ((event: MessageEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn(); start = vi.fn(); close = vi.fn()
  receive(data: unknown) { this.onmessage?.({ data } as MessageEvent) }
}
const channels: Array<{ port1: Port; port2: Port }> = []
beforeEach(() => {
  vi.useFakeTimers(); vi.stubEnv('DEV', true)
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { href: 'http://localhost:5178/' } }))
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.stubGlobal('MessageChannel', class { port1 = new Port(); port2 = new Port(); constructor() { channels.push(this) } })
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(session)
  channels.length = 0
})
afterEach(() => { document.body.replaceChildren(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const marker = (): FixedRecoveryMarker => ({ protocol: FIXED_RECOVERY_PROTOCOL, version: 1, type: 'marker', session,
  nonce, case: 'context-loss', event: 'connected', atMs: 0 })
function setup(fixed = true, onMarker = vi.fn()) {
  const container = document.createElement('div'); document.body.append(container)
  const failure = vi.fn(), diagnostic = vi.fn()
  const host = createIsolatedPlaybackHost({ container, rendererUrl: 'http://127.0.0.1:5181/', startupTimeoutMs: 100,
    ...(fixed ? { fixedRecoveryCheck: { case: 'context-loss', nonce } as const } : {}),
    onFailure: failure, onFixedRecoveryMarker: onMarker, onDiagnostic: diagnostic })
  const frame = container.querySelector('iframe')!
  const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
  frame.dispatchEvent(new Event('load'))
  return { host, frame, post, port: channels[0].port1, failure, diagnostic, onMarker }
}
describe('fixed recovery bootstrap in the production host', () => {
  it('uses only a validated fixed bootstrap while normal players retain the unchanged connect message', () => {
    const fixed = setup()
    expect(fixed.post).toHaveBeenCalledWith(fixedRecoveryConnection(session, { case: 'context-loss', nonce }), '*', [channels[0].port2])
    fixed.host.dispose()
    const normal = setup(false)
    expect(normal.post).toHaveBeenCalledWith(playbackMessage('connect', session, 0, 0, null), '*', [channels[1].port2])
    normal.host.dispose()
  })
  it('rejects arbitrary source/URL options before allocating a frame', () => {
    const container = document.createElement('div')
    for (const fixedRecoveryCheck of [{ case: 'context-loss', nonce, source: 'arbitrary' }, { case: 'context-loss', nonce, url: '/api' }, { case: 'unknown', nonce }]) {
      expect(() => createIsolatedPlaybackHost({ container, rendererUrl: 'http://127.0.0.1:5181/', fixedRecoveryCheck: fixedRecoveryCheck as never })).toThrow('Invalid fixed recovery check.')
    }
    expect(container.children).toHaveLength(0); expect(channels).toHaveLength(0)
  })
  it('bounded markers never satisfy readiness or liveness and throwing observers cannot prevent cleanup', async () => {
    const f = setup(true, vi.fn(() => { throw new Error('Observer failure.') }))
    let ready = false
    void f.host.ready.then(() => { ready = true }, () => {})
    f.port.receive(marker())
    await Promise.resolve()
    expect(ready).toBe(false)
    expect(f.diagnostic.mock.calls.some(([value]) => value.type === 'progress')).toBe(false)
    expect(f.onMarker).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(100)
    expect(f.failure).toHaveBeenCalledExactlyOnceWith('startup-timeout')
    expect(f.frame.isConnected).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['ordinary-player', 'wrong-session', 'wrong-nonce', 'wrong-case', 'extra-field', 'rate'] as const)('does not accept invalid fixture evidence: %s', mode => {
    const f = setup(mode !== 'ordinary-player')
    const value = mode === 'wrong-session' ? { ...marker(), session: 'b'.repeat(32) }
      : mode === 'wrong-nonce' ? { ...marker(), nonce: 'b'.repeat(32) }
        : mode === 'wrong-case' ? { ...marker(), case: 'window-message' }
          : mode === 'extra-field' ? { ...marker(), secret: 'excluded' } : marker()
    for (let count = 0; count < (mode === 'rate' ? 46 : 1); count++) f.port.receive(value)
    expect(f.failure).toHaveBeenCalledExactlyOnceWith('runtime')
    expect(f.onMarker).toHaveBeenCalledTimes(mode === 'rate' ? 45 : 0)
    expect(f.frame.isConnected).toBe(false)
    f.host.dispose()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIsolatedPlaybackHost } from './playbackHost'
import { FIXED_RECOVERY_PROTOCOL, type FixedRecoveryMarker } from './fixedRecoveryProtocol'
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
function setup() {
  const container = document.createElement('div'); document.body.append(container)
  const failure = vi.fn(), diagnostic = vi.fn()
  const host = createIsolatedPlaybackHost({ container, rendererUrl: 'http://127.0.0.1:5181/', startupTimeoutMs: 100,
    onFailure: failure, onDiagnostic: diagnostic })
  const frame = container.querySelector('iframe')!
  const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
  frame.dispatchEvent(new Event('load'))
  return { host, frame, post, port: channels[0].port1, failure, diagnostic }
}
describe('production playback host has no recovery fixture protocol', () => {
  it('always sends the normal playback connection', () => {
    const f = setup()
    expect(f.post).toHaveBeenCalledExactlyOnceWith(playbackMessage('connect', session, 0, 0, null), '*', [channels[0].port2])
    f.host.dispose()
  })
  it('does not treat diagnostic markers as readiness or liveness', async () => {
    const f = setup()
    let ready = false
    void f.host.ready.then(() => { ready = true }, () => {})
    f.port.receive(marker())
    await Promise.resolve()
    expect(ready).toBe(false)
    expect(f.failure).toHaveBeenCalledExactlyOnceWith('runtime')
    expect(f.frame.isConnected).toBe(false)
    expect(f.diagnostic.mock.calls.some(([value]) => value.type === 'progress')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})

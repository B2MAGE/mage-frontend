// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFixedRecoveryHost, FIXED_RECOVERY_SETUP } from './fixed-recovery-host'
import { FIXED_RECOVERY_PROTOCOL } from '../src/modules/player/isolation/fixedRecoveryProtocol'
import { playbackMessage } from '../src/modules/player/isolation/playbackProtocol'

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
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(session); channels.length = 0
})
afterEach(() => { document.body.replaceChildren(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
function setup() {
  const container = document.createElement('div'); document.body.append(container)
  const failure = vi.fn(), marker = vi.fn()
  const host = createFixedRecoveryHost({ container, rendererUrl: 'http://127.0.0.1:5181/', startupTimeoutMs: 100,
    fixedRecoveryCheck: { case: 'context-loss', nonce }, onFailure: failure, onFixedRecoveryMarker: marker })
  const frame = container.querySelector('iframe')!, post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
  frame.dispatchEvent(new Event('load'))
  return { host, frame, post, failure, marker, evidence: channels[0].port1, playback: channels[1].port1 }
}
describe('local recovery adapter', () => {
  it('arms fixed diagnostics separately before the unmodified real host connects', () => {
    const f = setup()
    expect(f.post.mock.calls).toEqual([
      [{ type: FIXED_RECOVERY_SETUP, case: 'context-loss', nonce }, '*', [channels[0].port2]],
      [playbackMessage('connect', session, 0, 0, null), '*', [channels[1].port2]],
    ])
    f.host.dispose()
    expect(f.evidence.close).toHaveBeenCalledOnce(); expect(f.playback.close).toHaveBeenCalledOnce()
  })
  it('keeps evidence off the real host channel and does not let it satisfy startup', async () => {
    const f = setup(), value = { protocol: FIXED_RECOVERY_PROTOCOL, version: 1, type: 'marker', session,
      nonce, case: 'context-loss', event: 'connected', atMs: 0 }
    f.evidence.receive(value)
    expect(f.marker).toHaveBeenCalledWith(value)
    expect(f.evidence.postMessage).toHaveBeenCalledWith({ ack: 1 })
    await vi.advanceTimersByTimeAsync(100)
    expect(f.failure).toHaveBeenCalledExactlyOnceWith('startup-timeout')
    expect(f.frame.isConnected).toBe(false); expect(f.evidence.close).toHaveBeenCalledOnce()
  })
  it('rejects invalid and excessive evidence', () => {
    const f = setup()
    f.evidence.receive({ protocol: FIXED_RECOVERY_PROTOCOL, version: 1, type: 'marker', session,
      nonce: 'b'.repeat(32), case: 'context-loss', event: 'connected', atMs: 0 })
    expect(f.marker).not.toHaveBeenCalled(); expect(f.frame.isConnected).toBe(false)
  })
  it('cannot create diagnostic frames on a deployed site', () => {
    const container = document.createElement('div')
    expect(() => createFixedRecoveryHost({ container, rendererUrl: 'https://renderer.example/index.html',
      fixedRecoveryCheck: { case: 'context-loss', nonce } })).toThrow('local-only')
    expect(container.childElementCount).toBe(0)
  })
})

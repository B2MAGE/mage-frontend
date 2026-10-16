// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStagedCheckHost } from './staged-playback-host'
import { STAGED_SETUP } from './staged-playback-fixture'

const session = '625a276a-cc12-4235-86f5-d40c26b1d083', nonce = session.replaceAll('-', '')
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
  const host = createStagedCheckHost({ container, rendererUrl: 'http://127.0.0.1:5181/', startupTimeoutMs: 100, downloadTimeoutMs: 100, case: 'context-loss',
    onFailure: failure, marker })
  const frame = container.querySelector('iframe')!, post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
  frame.dispatchEvent(new Event('load'))
  return { host, frame, post, failure, marker, evidence: channels[0].port1, playback: channels[1].port1 }
}
describe('local staged diagnostic adapter', () => {
  it('arms the fixed case before the real host negotiates staged playback', () => {
    const f = setup()
    expect(f.post.mock.calls[0][0]).toEqual({ type: STAGED_SETUP, case: 'context-loss', nonce })
    expect(f.post.mock.calls[1][0]).toMatchObject({ type: 'connect', payload: { startupPhases: true, workloadErrors: true, stagedScenes: true } })
    f.evidence.receive({ case: 'context-loss', nonce, event: 'armed' })
    expect(f.marker).toHaveBeenCalledOnce()
    f.host.dispose(); expect(f.evidence.close).toHaveBeenCalledOnce(); expect(f.playback.close).toHaveBeenCalledOnce()
  })
  it('does not let evidence satisfy the real playback bootstrap deadline', async () => {
    const f = setup(); f.evidence.receive({ case: 'context-loss', nonce, event: 'armed' })
    await vi.advanceTimersByTimeAsync(100)
    expect(f.failure).toHaveBeenCalledExactlyOnceWith('graphics-download'); expect(f.frame.isConnected).toBe(false)
  })
  it('rejects invalid fixed evidence and cannot arm deployed or non-development pages', () => {
    const f = setup(); f.evidence.receive({ case: 'context-loss', nonce: 'b'.repeat(32), event: 'armed' })
    expect(f.marker).not.toHaveBeenCalled(); expect(f.frame.isConnected).toBe(false)
    const container = document.createElement('div')
    expect(() => createStagedCheckHost({ container, rendererUrl: 'https://renderer.example/index.html', case: 'context-loss', marker() {} })).toThrow('local-only')
    vi.stubEnv('DEV', false)
    expect(() => createStagedCheckHost({ container, rendererUrl: 'http://127.0.0.1:5181/', case: 'context-loss', marker() {} })).toThrow('local-only')
    expect(container.childElementCount).toBe(0)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { installFixedWorkerCheck } from './worker-check-child'
import { WORKER_CHECK_PROTOCOL, type WorkerCheckSummary } from './worker-check-fixture'
import type { runFixedWorkerChecks } from './worker-check-runner'

const nonce = 'a'.repeat(32), origin = 'https://mage.peterbucci.com'
const connection = { protocol: WORKER_CHECK_PROTOCOL, version: 1, type: 'connect', nonce }
function fixture(opaque = true) {
  const denied = () => { throw new DOMException('Fixed boundary', 'SecurityError') }
  const parent = { get document() { return denied() } }
  const target = Object.assign(new EventTarget(), { parent, document: { get cookie() { return opaque ? denied() : '' } } })
  Object.defineProperty(target, 'localStorage', { get: denied })
  const status = { textContent: '' } as HTMLElement
  let resolve!: (value: WorkerCheckSummary) => void
  const run = vi.fn<typeof runFixedWorkerChecks>(() => new Promise<WorkerCheckSummary>(accept => { resolve = accept }))
  const install = (initialConnection?: MessageEvent) => installFixedWorkerCheck({ statusElement: status,
    allowedParentOrigins: [origin], targetWindow: target as unknown as Window, initialConnection }, run)
  const port = { onmessage: null as ((event: MessageEvent) => void) | null, onmessageerror: null,
    postMessage: vi.fn(), start: vi.fn(), close: vi.fn() }
  const event = (data: unknown = connection, source: unknown = parent, senderOrigin = origin, ports: unknown[] = [port]) =>
    Object.assign(new Event('message'), { data, source, origin: senderOrigin, ports }) as unknown as MessageEvent
  const send = (data: unknown = connection, source: unknown = parent, senderOrigin = origin, ports: unknown[] = [port]) => target.dispatchEvent(event(data, source, senderOrigin, ports))
  return { target, parent, status, run, port, event, send, install, complete: () => resolve({} as WorkerCheckSummary) }
}

describe('production fixed worker-check handler', () => {
  it('requires exact parent source/origin, one port, and a source-free fixed handshake', () => {
    const f = fixture(); f.install()
    f.send(connection, {}); f.send(connection, f.parent, 'https://other.example')
    f.send(connection, f.parent, origin, []); f.send(connection, f.parent, origin, [f.port, f.port])
    f.send({ ...connection, source: 'arbitrary' }); f.send({ ...connection, version: 2 })
    expect(f.run).not.toHaveBeenCalled()
    f.send()
    expect(f.run).toHaveBeenCalledOnce()
    expect(Object.keys(f.run.mock.calls[0][0]).sort()).toEqual(['emit', 'nonce', 'signal'])
    expect(f.port.postMessage).toHaveBeenCalledWith({ type: 'ready', nonce })
    f.send(); expect(f.run).toHaveBeenCalledOnce()
  })

  it('accepts the already-validated initial connection selected by the renderer', () => {
    const f = fixture(); f.install(f.event())
    expect(f.run).toHaveBeenCalledOnce()
    expect(f.port.start).toHaveBeenCalledOnce()
  })

  it.each([{ type: 'stop', nonce }, { type: 'compile', nonce, source: 'arbitrary' }])('retires on cancellation or an unrecognized private-port command', async command => {
    const f = fixture(); f.install(); f.send()
    const options = f.run.mock.calls[0][0]
    f.port.onmessage?.({ data: command } as MessageEvent)
    expect(options.signal.aborted).toBe(true)
    expect(f.port.close).toHaveBeenCalledOnce()
    const count = f.port.postMessage.mock.calls.length, text = f.status.textContent
    options.emit({ phase: 'stall', kind: 'started', value: null, atMs: 1 }); f.complete(); await Promise.resolve()
    expect(f.port.postMessage).toHaveBeenCalledTimes(count)
    expect(f.status.textContent).toBe(text)
    f.send(); expect(f.run).toHaveBeenCalledOnce()
  })

  it('does not start without the opaque boundary and disposes on pagehide', () => {
    const invalid = fixture(false); invalid.install(); invalid.send(); expect(invalid.run).not.toHaveBeenCalled()
    const f = fixture(); f.install(); f.send(); f.target.dispatchEvent(new Event('pagehide'))
    expect(f.run.mock.calls[0][0].signal.aborted).toBe(true)
    expect(f.port.close).toHaveBeenCalledOnce()
  })
})

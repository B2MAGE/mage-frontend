import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { BOUNDARY_PROBES, emptyBoundaryEvidence } from './worker-boundary'
import type { WorkerCheckSummary } from './worker-check-fixture'

const canary = vi.hoisted(() => ({ prepare: vi.fn(), read: vi.fn() }))
vi.mock('./worker-check-canary', () => ({ prepareWorkerCanary: canary.prepare, readWorkerCanary: canary.read }))
type Port = { onmessage: ((event: MessageEvent) => void) | null; onmessageerror: null; start: () => void; close: () => void; postMessage: ReturnType<typeof vi.fn> }
let dom: JSDOM, ports: Port[]
const control = { requests: 3, kinds: { fetch: 1, xhr: 1, 'import-script': 1 } }
const zero = { requests: 0, kinds: { fetch: 0, xhr: 0, 'import-script': 0 } }
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
function summary(): WorkerCheckSummary {
  const production = emptyBoundaryEvidence(), policy = emptyBoundaryEvidence()
  for (const probe of BOUNDARY_PROBES) {
    production.probes[probe] = { attempted: true, returned: true, outcome: 'pending' }
    policy.probes[probe] = { attempted: true, returned: false, outcome: 'denied' }
  }
  policy.observationTimer = true
  return { controlDelayed: true, scopeVerified: true, opaqueOriginObserved: true,
    normalStarted: true, normalCompiled: true, normalTerminated: true, completionScheduled: true, completionCompiled: true,
    completionTerminated: true, completionDelayed: false, stallStarted: true, stallEntered: true, stallEnded: false,
    stallTimedOut: true, throwStarted: true, throwRejected: true, throwTerminated: true, syntaxStarted: true, syntaxRejected: true, syntaxTerminated: true,
    abortStarted: true, abortEntered: true, abortCancelled: true, stallDurationMs: 2001, completionObservationMs: 600, abortDurationMs: 50, repeatedJobs: 2,
    boundary: { started: true, compiled: true, terminated: true, production, policy, policyObservationMs: 600 } }
}
const button = (id: string) => document.getElementById(id) as HTMLButtonElement
function report() {
  button('show-report').click()
  return JSON.parse(document.getElementById('report-json')!.textContent!)
}
async function open() { await import('./isolated-worker-check'); button('start').click(); await flush() }
function connect() {
  const frame = document.querySelector('iframe')!
  const target = { postMessage: vi.fn(), get document() { throw new DOMException('Fixed boundary', 'SecurityError') } }
  Object.defineProperty(frame, 'contentWindow', { value: target })
  frame.dispatchEvent(new dom.window.Event('load'))
  const nonce = target.postMessage.mock.calls[0][0].nonce as string
  const send = (value: object) => ports[0].onmessage?.({ data: { ...value, nonce } } as MessageEvent)
  send({ type: 'ready' })
  return send
}
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); ports = []
  canary.prepare.mockReset().mockResolvedValue(control); canary.read.mockReset().mockResolvedValue(zero)
  dom = new JSDOM(`<button id="start"></button><button id="stop"></button><button id="download"></button><button id="show-report"></button>
    <div id="player"></div><p id="status"></p><p id="summary"></p><p id="saved-runs"></p><pre id="report-json" hidden></pre>
    <table><tbody id="results"></tbody></table>`, { url: 'https://mage.peterbucci.com/player-check/worker/' })
  Object.defineProperty(dom.window.document, 'visibilityState', { value: 'visible' })
  vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document)
  vi.stubGlobal('location', dom.window.location); vi.stubGlobal('navigator', dom.window.navigator)
  vi.stubGlobal('__MAGE_WORKER_CHECK_SCOPE__', 'production'); vi.stubGlobal('__MAGE_WORKER_CHECK_PARENT__', 'https://mage.peterbucci.com')
  vi.stubGlobal('__MAGE_WORKER_CHECK_PATH__', '/player-check/worker/'); vi.stubGlobal('__MAGE_WORKER_CHECK_CHILD__', 'https://d2wwpgc7sgvmnm.cloudfront.net/index.html')
  vi.stubGlobal('MessageChannel', class {
    port1: Port = { onmessage: null, onmessageerror: null, start() {}, close() {}, postMessage: vi.fn() }
    port2 = {}
    constructor() { ports.push(this.port1) }
  })
})
afterEach(() => {
  dom.window.dispatchEvent(new dom.window.Event('pagehide')); dom.window.close()
  vi.useRealTimers(); vi.unstubAllGlobals()
})

describe('worker page bounded report acceptance', () => {
  it('does not create a child or pass when the canary positive control fails', async () => {
    canary.prepare.mockRejectedValueOnce(new Error('Private failure details must not be exported'))
    await open()
    expect(document.querySelector('iframe')).toBeNull()
    const result = report()
    expect(result.testVersion).toBe('fixed-worker-2')
    expect(result.version).toBe(2)
    expect(result.runs[0]).toMatchObject({ status: 'failed', canaryControl: null, checks: [] })
    expect(JSON.stringify(result)).not.toContain('Private failure')
  })
  it('ignores a late positive control after cancellation and aborts its requests', async () => {
    let finish!: (value: unknown) => void
    canary.prepare.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    await open()
    const signal = canary.prepare.mock.calls[0][3] as AbortSignal
    button('stop').click(); finish(control); await flush()
    expect(signal.aborted).toBe(true)
    expect(document.querySelector('iframe')).toBeNull()
    expect(report().runs[0].status).toBe('cancelled')
  })
  it.each(['missing-boundary', 'missing-policy-probe', 'missing-attempt'] as const)('rejects incomplete child evidence before counter acceptance: %s', async part => {
    await open()
    const send = connect(), value = summary()
    if (part === 'missing-boundary') Reflect.deleteProperty(value, 'boundary')
    else if (part === 'missing-policy-probe') Reflect.deleteProperty(value.boundary.policy.probes, 'cache-storage')
    else Reflect.deleteProperty(value.boundary.policy.probes.fetch, 'attempted')
    send({ type: 'complete', summary: value }); await flush()
    expect(canary.read).not.toHaveBeenCalled()
    expect(report().runs[0]).toMatchObject({ status: 'failed', canaryObserved: null, worker: null, checks: [] })
    expect(document.querySelector('iframe')).toBeNull()
  })
  it.each(['unavailable', 'escaped', 'zero'] as const)('requires independent current counter results after the child completes: %s', async outcome => {
    if (outcome === 'unavailable') canary.read.mockRejectedValueOnce(new Error('No counter'))
    else if (outcome === 'escaped') canary.read.mockResolvedValueOnce({ requests: 1, kinds: { ...zero.kinds, fetch: 1 } })
    await open()
    const send = connect()
    send({ type: 'complete', summary: summary() }); await flush()
    const result = report()
    expect(result.expectedChecks).toBe(19)
    expect(result.runs[0].status).toBe(outcome === 'zero' ? 'passed' : 'failed')
    if (outcome === 'zero') expect(result.runs[0].checks).toHaveLength(19)
    expect(document.querySelector('iframe')).toBeNull()
    expect(JSON.stringify(result)).not.toContain('mage-worker-boundary-marker')
  })
})

import { exact, isCheckEvent, isSummary, time, WORKER_CHECK_CHILD, WORKER_CHECK_PARENT, WORKER_CHECK_PATH, WORKER_CHECK_PROTOCOL,
  WORKER_CHECK_VERSION, workerCheckVerdicts, type WorkerCheckEvent, type WorkerCheckSummary } from './worker-check-fixture'

type CheckRun = { id: number; startedAt: string; finishedAt: string | null; status: 'running' | 'passed' | 'failed' | 'cancelled';
  interruptedByHiddenPage: boolean; opaqueFrameVerified: boolean; parentStallMaxGapMs: number; diagnosticsTruncated: boolean;
  events: WorkerCheckEvent[]; worker: WorkerCheckSummary | null; checks: Array<{ name: string; outcome: 'PASS' | 'FAIL' }> }
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const runs: CheckRun[] = []
let sequence = 0, dispose: (() => void) | null = null, active: CheckRun | null = null
const allowed = import.meta.env.DEV && location.href === `${WORKER_CHECK_PARENT}${WORKER_CHECK_PATH}`
const snapshot = () => ({ version: 1, testVersion: WORKER_CHECK_VERSION, exportedAt: new Date().toISOString(),
  scope: 'Local fixed compiler-worker capability and lifetime checks only. Network, GPU, application and release verification are not performed.',
  browserUserAgent: navigator.userAgent.slice(0, 512), parentOrigin: WORKER_CHECK_PARENT, rendererUrl: WORKER_CHECK_CHILD,
  parameters: { compilerDeadlineMs: 2000, finiteLoopMs: 3000, delayedCallbackMs: 250, callbackObservationMs: 600, parentTimerIntervalMs: 50, parentResponsivenessLimitMs: 1000 },
  eventLimit: 128, retainedRunLimit: 12, runs: structuredClone(runs) })
function saved() {
  element('saved-runs').textContent = `${WORKER_CHECK_VERSION}; ${runs.length} run(s) retained, up to the latest 12. Reloading clears this history.`
  element<HTMLButtonElement>('download').disabled = runs.length === 0
  element<HTMLButtonElement>('show-report').disabled = runs.length === 0
  if (!element('report-json').hidden) element('report-json').textContent = JSON.stringify(snapshot(), null, 2)
}
function finish(status: CheckRun['status']) {
  if (!active) return
  active.status = status; active.finishedAt = new Date().toISOString()
  dispose?.(); dispose = null; active = null
  element<HTMLButtonElement>('start').disabled = !allowed
  saved()
}
function stop() { finish('cancelled'); element('status').textContent = 'Checks stopped. The fixed child was removed.' }
function start() {
  if (!allowed) return
  stop(); element('results').replaceChildren(); element('summary').textContent = ''
  const current: CheckRun = { id: ++sequence, startedAt: new Date().toISOString(), finishedAt: null, status: 'running',
    interruptedByHiddenPage: document.visibilityState !== 'visible', opaqueFrameVerified: false, parentStallMaxGapMs: 0,
    diagnosticsTruncated: false, events: [], worker: null, checks: [] }
  active = current; runs.push(current); if (runs.length > 12) runs.shift()
  saved(); element<HTMLButtonElement>('start').disabled = true
  const nonce = crypto.randomUUID().replaceAll('-', ''), frame = document.createElement('iframe')
  frame.title = 'Fixed compiler worker fixture'; frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('referrerpolicy', 'no-referrer'); frame.setAttribute('credentialless', '')
  let port: MessagePort | null = null, connected = false, ready = false, stall = false, previous = performance.now()
  const isActive = () => active === current && current.status === 'running'
  function sample() {
    const next = performance.now()
    if (stall && time(next - previous)) current.parentStallMaxGapMs = Math.max(current.parentStallMaxGapMs, next - previous)
    previous = next
  }
  const heartbeat = setInterval(sample, 50)
  const fail = () => { if (isActive()) { finish('failed'); element('status').textContent = 'The fixed worker check could not complete. Save this report.' } }
  const deadline = setTimeout(fail, 15000)
  const receive = (event: MessageEvent) => {
    if (!isActive()) return
    const value = event.data
    if (!value || value.nonce !== nonce) return
    if (exact(value, ['type', 'nonce']) && value.type === 'ready' && !ready) { ready = true; element('status').textContent = 'Worker checks started.'; return }
    if (!ready) return fail()
    if (exact(value, ['type', 'nonce', 'event']) && value.type === 'event' && isCheckEvent(value.event)) {
      if (current.events.length < 128) current.events.push(value.event); else current.diagnosticsTruncated = true
      if (value.event.kind === 'phase') { stall = value.event.phase === 'stall'; previous = performance.now(); element('status').textContent = `Worker check: ${value.event.phase}.` }
      return
    }
    if (exact(value, ['type', 'nonce', 'summary']) && value.type === 'complete' && isSummary(value.summary)) {
      sample(); current.worker = value.summary
      current.checks = [{ name: 'Separate child has an opaque origin', passed: current.opaqueFrameVerified }, ...workerCheckVerdicts(value.summary, current.parentStallMaxGapMs)]
        .map(check => ({ name: check.name, outcome: check.passed ? 'PASS' : 'FAIL' }))
      for (const check of current.checks) { const row = element<HTMLTableSectionElement>('results').insertRow(); row.insertCell().textContent = check.name; const result = row.insertCell(); result.textContent = check.outcome; result.dataset.result = check.outcome }
      const passed = current.checks.filter(check => check.outcome === 'PASS').length
      element('summary').textContent = `${passed} passed; ${current.checks.length - passed} failed. Maximum parent gap during stall: ${Math.round(current.parentStallMaxGapMs)}ms.`
      const accepted = passed === current.checks.length && !current.interruptedByHiddenPage
      element('status').textContent = current.interruptedByHiddenPage ? 'Page hidden during this run; results are not accepted. Rerun visibly.' : 'Fixed worker checks finished. This does not approve browser release.'
      finish(accepted ? 'passed' : 'failed'); return
    }
    fail()
  }
  const load = () => {
    if (!isActive()) return
    if (connected || !frame.contentWindow) return fail()
    connected = true
    try { void frame.contentWindow.document } catch (error) { current.opaqueFrameVerified = (error as DOMException).name === 'SecurityError' }
    const channel = new MessageChannel(); port = channel.port1; port.onmessage = receive; port.onmessageerror = fail; port.start()
    frame.contentWindow.postMessage({ protocol: WORKER_CHECK_PROTOCOL, version: 1, type: 'connect', nonce }, '*', [channel.port2])
  }
  dispose = () => {
    clearTimeout(deadline); clearInterval(heartbeat)
    try { port?.postMessage({ type: 'stop', nonce }) } catch { /* Removing the owner document is final. */ }
    port?.close(); port = null; frame.removeEventListener('load', load); frame.remove()
  }
  frame.addEventListener('load', load); frame.addEventListener('error', fail, { once: true })
  frame.src = WORKER_CHECK_CHILD; element('player').append(frame)
  element('status').textContent = 'Starting the opaque child…'
}
element('start').onclick = start; element('stop').onclick = stop
element('show-report').onclick = () => { const output = element('report-json'); output.hidden = !output.hidden; output.textContent = output.hidden ? '' : JSON.stringify(snapshot(), null, 2) }
element('download').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 2) + '\n'], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = `mage-${WORKER_CHECK_VERSION}-${new Date().toISOString().replaceAll(':', '-')}.json`
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
document.addEventListener('visibilitychange', () => { if (active && document.visibilityState !== 'visible') active.interruptedByHiddenPage = true })
window.addEventListener('pagehide', stop)
element<HTMLButtonElement>('start').disabled = !allowed
if (!allowed) element('status').textContent = 'Open the exact local worker-check address without query parameters or a fragment.'
saved()

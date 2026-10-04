import { createIsolatedPlaybackHost, type IsolatedPlaybackHost } from '../src/modules/player/isolation/playbackHost'
import { boundedStallSource, portAttackSource, reportProbeSource as reportSource, THROW_PROBE_SOURCE } from './isolated-security-probes.mjs'
import { createSecurityReport } from './isolated-security-report.mjs'
import { fixedSecurityCheckConfig, isSecurityCheckLocation, securityCanaryUrl, type SecurityCheckMode } from './isolated-security-config.mjs'

export function mountIsolatedSecurityCheck(mode: SecurityCheckMode) {
const config = fixedSecurityCheckConfig(mode)
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const container = el('player'), results = el<HTMLTableSectionElement>('results'), status = el('status')
const allowed = isSecurityCheckLocation(mode, window.location.href, import.meta.env.DEV)
const renderer = config.rendererUrl
type Outcome = 'PASS' | 'FAIL' | 'PENDING'
let run = 0, host: IsolatedPlaybackHost | null = null, activeCleanup: (() => void) | null = null
const report = createSecurityReport({ mode })
let reportRun: number | null = null
const reportSnapshot = () => report.snapshot({ userAgent: navigator.userAgent, parentOrigin: location.origin, rendererUrl: renderer })
function updateSavedRuns() {
  const saved = reportSnapshot().runs
  el('saved-runs').textContent = `This tab retains ${saved.length} check run(s), up to the latest 24. The report includes earlier groups and any cancelled or incomplete runs. Fixed-fixture results do not approve release.`
  el<HTMLButtonElement>('download').disabled = saved.length === 0
  el<HTMLButtonElement>('show-report').disabled = saved.length === 0
  if (!el('report-json').hidden) el('report-json').textContent = JSON.stringify(reportSnapshot(), null, 2)
}
const rows: { name: string; outcome: Outcome; evidence: string }[] = []
function row(token: number, name: string, outcome: Outcome, evidence: string, exportEvidence = evidence) {
  if (token !== run) return
  rows.push({ name, outcome, evidence })
  if (reportRun !== null) report.add(reportRun, { name, outcome, evidence: exportEvidence })
  const tr = results.insertRow()
  for (const text of [name, outcome, evidence]) tr.insertCell().textContent = text
  tr.cells[1].dataset.result = outcome
  el('summary').textContent = `${rows.filter(value => value.outcome === 'PASS').length} passed; ${rows.filter(value => value.outcome === 'FAIL').length} failed. Browser: ${navigator.userAgent}`
}
function stop() {
  if (reportRun !== null) { report.finish(reportRun, true); reportRun = null; updateSavedRuns() }
  run++; activeCleanup?.(); activeCleanup = null; host?.dispose(); host = null
  status.textContent = 'Checks stopped. The test player was removed.'
  for (const id of ['boundary', 'failures', 'stall']) el<HTMLButtonElement>(id).disabled = !allowed
}
function begin(group: 'boundary' | 'failures' | 'stall') {
  stop(); rows.length = 0; results.replaceChildren(); el('summary').textContent = ''
  reportRun = report.start(group)
  if (document.visibilityState !== 'visible') report.markHidden(reportRun)
  updateSavedRuns()
  for (const id of ['boundary', 'failures', 'stall']) el<HTMLButtonElement>(id).disabled = true
  return run
}
function assertCurrent(token: number) { if (token !== run) throw new Error('Checks stopped.') }
function sleep(ms: number) { return new Promise<void>(resolve => setTimeout(resolve, ms)) }
const newNonce = () => crypto.randomUUID().replaceAll('-', '')
function scene(code: string) {
  return { visualizer: { shader: `setMaxIterations(48); setStepSize(0.7); color(0.35,0.2,0.8); sphere(0.5);\n${code}`, skyboxPreset: 6, scale: 1 },
    controls: { position0: { x: 0, y: 0, z: 4 }, target0: { x: 0, y: 0, z: 0 }, zoom0: 1 },
    intent: { autoRotate: false, time_multiplier: 0.5 }, fx: { bloom: { enabled: false }, passes: { outputPass: true } } }
}
async function register(nonce: string) {
  const response = await fetch(`${config.canaryPrefix}register?nonce=${nonce}`, { method: 'POST', credentials: 'omit', cache: 'no-store' })
  if (!response.ok || (await response.json()).registered !== true) throw new Error('The fixed-probe canary could not register this check. The check service must be available before results can be accepted.')
}
async function countRequests(nonce: string) {
  const response = await fetch(`${config.canaryPrefix}results?nonce=${nonce}`, { credentials: 'omit', cache: 'no-store' })
  if (!response.ok) throw new Error('Canary evidence is unavailable.')
  const value = await response.json() as { requests: number; kinds: Record<string, number> }
  if (!Number.isInteger(value.requests) || value.requests < 0 || !value.kinds) throw new Error('Canary evidence is invalid.')
  return value
}
const canary = (nonce: string, kind: string) => securityCanaryUrl(mode, nonce, kind)
async function player(token: number, startupTimeoutMs = mode === 'deployed' ? 15000 : 5000) {
  assertCurrent(token); host?.dispose(); host = null
  let failed = false
  const instance = createIsolatedPlaybackHost({ container, rendererUrl: renderer, startupTimeoutMs, progressTimeoutMs: 1000,
    useInlineFrameStyles: false, onFailure() { failed = true }, onStatus(value) { if (token === run) status.textContent = `Test player: ${value}.` } })
  host = instance
  await instance.ready; assertCurrent(token)
  return { instance, frame: container.querySelector('iframe')!, failed: () => failed }
}
function diagnostics(frame: HTMLIFrameElement, nonce: string, token: number) {
  const source = frame.contentWindow
  let resolved = false
  let resolve!: (value: Record<string, boolean>) => void, reject!: (error: Error) => void
  const promise = new Promise<Record<string, boolean>>((accept, fail) => { resolve = accept; reject = fail })
  void promise.catch(() => {})
  const timeout = setTimeout(() => { cleanup(); reject(new Error('The probe did not report a result.')) }, 6000)
  function receive(event: MessageEvent) {
    if (token !== run || event.source !== source || event.origin !== 'null') return
    const value = event.data
    if (!value || Object.keys(value).sort().join(',') !== 'checks,nonce,type' || value.type !== 'mage-isolation-probe' || value.nonce !== nonce
      || !value.checks || typeof value.checks !== 'object' || Array.isArray(value.checks)) return
    const entries = Object.entries(value.checks)
    if (!entries.length || entries.length > 16 || entries.some(([key, check]) => !/^[a-z-]{1,40}$/.test(key) || typeof check !== 'boolean')) return
    resolved = true; cleanup(); resolve(value.checks)
  }
  function cleanup() { clearTimeout(timeout); window.removeEventListener('message', receive); if (activeCleanup === cancel) activeCleanup = null }
  function cancel() { cleanup(); if (!resolved) reject(new Error('Checks stopped.')) }
  window.addEventListener('message', receive); activeCleanup = cancel
  return { promise, cancel }
}
async function boundaryChecks(token: number) {
  const nonce = newNonce(); await register(nonce)
  const p = await player(token), probe = diagnostics(p.frame, nonce, token)
  let parentBlocked = false
  try { void p.frame.contentWindow!.document } catch (error) { parentBlocked = (error as DOMException).name === 'SecurityError' }
  const code = `(function(){
    const checks={};
    const denied=(name,read)=>{try{read();checks[name]=false}catch(error){checks[name]=error&&error.name==='SecurityError'}};
    denied('parent-dom',()=>globalThis.parent.document);
    denied('child-cookie',()=>globalThis.document.cookie);
    denied('local-storage',()=>globalThis.localStorage);
    denied('session-storage',()=>globalThis.sessionStorage);
    denied('indexed-db',()=>globalThis.indexedDB.open('mage-fixed-isolation-probe'));
    const popup=globalThis.open(${JSON.stringify(canary(nonce, 'popup'))},'_blank'); checks['popup']=popup===null; if(popup)popup.close();
    denied('parent-navigation',()=>{globalThis.top.location.href=${JSON.stringify(canary(nonce, 'parent-navigation'))}});
    ${reportSource(nonce, 'checks')}
  })();`
  try {
    await p.instance.loadScene(scene(code), 'preview')
    const checks = await probe.promise; assertCurrent(token)
    row(token, 'Parent cannot read renderer DOM', parentBlocked ? 'PASS' : 'FAIL', 'The actual parent page requires a SecurityError.')
    for (const [name, passed] of Object.entries(checks)) row(token, name, passed ? 'PASS' : 'FAIL', 'Fixed child probe reports only success/failure; no values are retained.')
    await sleep(250)
    const counts = await countRequests(nonce)
    row(token, 'No popup or parent-navigation request', counts.requests === 0 ? 'PASS' : 'FAIL', `Test canary received ${counts.requests} request(s).`)
  } finally { probe.cancel(); p.instance.dispose() }
}
async function networkChecks(token: number) {
  const nonce = newNonce(); await register(nonce)
  const p = await player(token), probe = diagnostics(p.frame, nonce, token)
  const url = (kind: string) => JSON.stringify(canary(nonce, kind))
  const code = `(function(){
    globalThis.fetch(${url('fetch')},{mode:'no-cors',credentials:'include'}).catch(()=>{});
    try{const xhr=new XMLHttpRequest();xhr.open('GET',${url('xhr')});xhr.send()}catch(error){}
    try{navigator.sendBeacon(${url('beacon')})}catch(error){}
    const image=new Image();image.src=${url('image')};
    try{const socket=new WebSocket(${JSON.stringify(securityCanaryUrl(mode, nonce, 'socket', true))});socket.onerror=()=>{};setTimeout(()=>socket.close(),250)}catch(error){}
    const form=document.createElement('form');form.action=${JSON.stringify(`${config.parentOrigin}${config.canaryPrefix}canary`)};form.method='GET';
    for(const pair of [['nonce',${JSON.stringify(nonce)}],['kind','form']]){const field=document.createElement('input');field.name=pair[0];field.value=pair[1];form.append(field)}
    document.body.append(form);try{form.submit()}catch(error){}form.remove();
    ${reportSource(nonce, "{'network-attempted':true}")}
  })();`
  try {
    await p.instance.loadScene(scene(code), 'preview'); await probe.promise; await sleep(600); assertCurrent(token)
    const counts = await countRequests(nonce)
    for (const kind of ['fetch', 'xhr', 'beacon', 'image', 'socket', 'form']) row(token, `Blocked ${kind} request`, counts.kinds[kind] === 0 ? 'PASS' : 'FAIL', `Test canary received ${counts.kinds[kind]} request(s).`)
  } finally { probe.cancel(); p.instance.dispose() }
}
async function navigationCheck(token: number) {
  const nonce = newNonce(); await register(nonce)
  const p = await player(token)
  const probe = diagnostics(p.frame, nonce, token)
  let remainedAlive = false
  void probe.promise.then(checks => { remainedAlive = checks['navigation-blocked-document-alive'] === true }, () => {})
  try {
    await p.instance.loadScene(scene(`setTimeout(()=>{try{globalThis.location.href=${JSON.stringify(canary(nonce, 'self-navigation'))}}catch(error){}setTimeout(()=>{${reportSource(nonce, "{'navigation-blocked-document-alive':true}")}},200)},100);`), 'preview').catch(() => {})
    await sleep(1600); assertCurrent(token)
    const counts = await countRequests(nonce)
    row(token, 'Self-navigation cannot reach the app', counts.requests === 0 ? 'PASS' : 'FAIL', `Parent frame-src policy; test canary received ${counts.requests} request(s).`)
    const stopped = !p.frame.isConnected && p.failed()
    row(token, 'Navigation is blocked or the child is retired', stopped || (remainedAlive && counts.requests === 0) ? 'PASS' : 'FAIL', stopped ? 'The host removed the changed document.' : 'The original document reported continued execution after the blocked attempt.')
  } finally { probe.cancel(); p.instance.dispose() }
}
async function expectedFailure(token: number, name: string, code: string | ((nonce: string) => string), timeout = 6500, requireProof = true) {
  const p = await player(token)
  const nonce = newNonce(), probe = diagnostics(p.frame, nonce, token)
  let executed = false
  void probe.promise.then(checks => { executed = checks['probe-executed'] === true }, () => {})
  const started = performance.now()
  try {
    const source = typeof code === 'function' ? code(nonce) : `${requireProof ? reportSource(nonce, "{'probe-executed':true}") : ''}${code}`
    void p.instance.loadScene(scene(source), 'preview').catch(() => {})
    while (!p.failed() && performance.now() - started < timeout) { await sleep(50); assertCurrent(token) }
    await sleep(50)
    row(token, name, p.failed() && !p.frame.isConnected && (!requireProof || executed) ? 'PASS' : 'FAIL', `Probe evidence: ${requireProof ? executed : 'fixed rejected source; no runtime-delivery claim'}; child removed: ${!p.frame.isConnected}; failure recorded: ${p.failed()}.`)
  } finally { probe.cancel(); p.instance.dispose() }
}
async function failureChecks(token: number) {
  const windowSpoof = await player(token)
  const nonce = newNonce(), proof = diagnostics(windowSpoof.frame, nonce, token)
  try {
    await windowSpoof.instance.loadScene(scene(portAttackSource('window', nonce)), 'preview')
    const checks = await proof.promise
    await sleep(400); assertCurrent(token)
    row(token, 'Window-message spoof cannot use the private port', checks['probe-executed'] && !windowSpoof.failed() && windowSpoof.frame.isConnected ? 'PASS' : 'FAIL', 'A proven valid-session error sent through window.postMessage is ignored by the production host.')
  } finally { proof.cancel(); windowSpoof.instance.dispose() }
  await expectedFailure(token, 'Thrown scene source is rejected safely', THROW_PROBE_SOURCE, 6500, false)
  await expectedFailure(token, 'Invalid source stops safely', 'this is deliberately invalid shader source;', 6500, false)
  await expectedFailure(token, 'Unrecognized child instruction is rejected', nonce => portAttackSource('spoof', nonce))
  await expectedFailure(token, 'Bounded output flood is rejected', nonce => portAttackSource('flood', nonce))
  await expectedFailure(token, 'Lost WebGL context stops safely', nonce => `setTimeout(()=>{const canvas=document.querySelector('canvas');const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');const extension=gl&&gl.getExtension('WEBGL_lose_context');if(extension){${reportSource(nonce, "{'probe-executed':true}")}setTimeout(()=>extension.loseContext(),150)}},150);`)
  await expectedFailure(token, 'Child reload stops safely', nonce => `setTimeout(()=>{${reportSource(nonce, "{'probe-executed':true}")}setTimeout(()=>globalThis.location.reload(),150)},100);`)
  assertCurrent(token)
  const missing = createIsolatedPlaybackHost({ container, rendererUrl: renderer, startupTimeoutMs: 1200, useInlineFrameStyles: false })
  host = missing
  const frame = container.querySelector('iframe')!
  // Removing the real frame before its initial load produces a genuine missing response.
  frame.remove()
  let rejected = false
  try { await missing.ready } catch { rejected = true }
  row(token, 'Missing child response expires', rejected ? 'PASS' : 'FAIL', 'Readiness rejected within the bounded startup deadline.')
  missing.dispose(); assertCurrent(token)
}
async function boundedStall(token: number) {
  const p = await player(token, mode === 'deployed' ? 15000 : 1200)
  const nonce = newNonce(), probe = diagnostics(p.frame, nonce, token)
  let executed = false
  void probe.promise.then(checks => { executed = checks['probe-executed'] === true }, () => {})
  let previous = performance.now(), largestGap = 0
  const heartbeat = setInterval(() => { const next = performance.now(); largestGap = Math.max(largestGap, next - previous); previous = next }, 50)
  try {
    // Deliver the execution marker before blocking the child; destroying a
    // frame can otherwise discard its still-queued window diagnostic.
    void p.instance.loadScene(scene(boundedStallSource(nonce)), 'preview').catch(() => {})
    await sleep(3600); assertCurrent(token)
    row(token, 'Bounded child CPU stall is removed', executed && p.failed() && !p.frame.isConnected ? 'PASS' : 'FAIL', `Three-second loop executed: ${executed}; no infinite loop or GPU stress test.`)
    row(token, 'Parent remains responsive during stall', executed && largestGap < 1000 ? 'PASS' : 'FAIL', `Largest parent timer gap: ${Math.round(largestGap)}ms. This measures this browser run only.`)
  } finally { probe.cancel(); clearInterval(heartbeat); p.instance.dispose() }
}
async function execute(group: 'boundary' | 'failures' | 'stall') {
  if (!allowed) return
  const token = begin(group)
  try {
    if (group === 'boundary') { await boundaryChecks(token); await networkChecks(token); await navigationCheck(token) }
    else if (group === 'failures') await failureChecks(token)
    else await boundedStall(token)
    assertCurrent(token)
    status.textContent = 'Checks finished. Review every failed result before enabling custom playback.'
  } catch (error) {
    if (token === run) { row(token, 'Test completion', 'FAIL', error instanceof Error ? error.message : 'The test could not complete.', 'The fixed test could not complete; see the visible result for details.'); status.textContent = 'Checks did not complete.' }
  } finally {
    if (token === run) {
      if (reportRun !== null) {
        report.finish(reportRun)
        const result = reportSnapshot().runs.find(value => value.id === reportRun)
        if (result?.interruptedByHiddenPage) status.textContent = 'This run is not accepted because the page was hidden. Keep it visible and rerun the group.'
        reportRun = null; updateSavedRuns()
      }
      host?.dispose(); host = null; activeCleanup?.(); activeCleanup = null; for (const id of ['boundary', 'failures', 'stall']) el<HTMLButtonElement>(id).disabled = false
    }
  }
}
for (const group of ['boundary', 'failures', 'stall'] as const) el<HTMLButtonElement>(group).onclick = () => void execute(group)
el<HTMLButtonElement>('stop').onclick = stop
el<HTMLButtonElement>('download').onclick = () => {
  const snapshot = reportSnapshot()
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2) + '\n'], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = `mage-${mode}-isolation-${new Date().toISOString().replaceAll(':', '-')}.json`
  document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible' && reportRun !== null) report.markHidden(reportRun) })
el<HTMLButtonElement>('show-report').onclick = () => {
  const output = el('report-json')
  output.hidden = !output.hidden
  output.textContent = output.hidden ? '' : JSON.stringify(reportSnapshot(), null, 2)
  el('show-report').textContent = output.hidden ? 'Show report JSON' : 'Hide report JSON'
}
window.addEventListener('pagehide', stop)
updateSavedRuns()
if (!allowed) { stop(); status.textContent = 'These fixed security probes can run only at their configured check page. Open the exact page address without query parameters or a fragment.' }
else { stop(); status.textContent = 'Ready. Keep this tab visible while each fixed check runs.' }
}

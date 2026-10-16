import { createStagedCheckHost } from './staged-playback-host'
import { STAGED_CASES, fixedStagedScene as scene, type StagedCase, type StagedMarker } from './staged-playback-fixture'
import { hasVerifiedParentBoundary } from './isolated-playback-boundary'
import { isSceneReplacementError } from '../src/modules/player/isolation/sceneReplacement'
import type { GraphicsDiagnostics } from '../src/modules/player/isolation/playbackProtocol'
import type { PlaybackHostDiagnostic } from '../src/modules/player/isolation/playbackHost'

type Row = { case: StagedCase; state: 'running' | 'passed' | 'failed'; evidence: string; reason: string | null;
  failures: string[]; markers: string[]; retained: boolean; boundaryVerified: boolean; framesBefore: number; framesAfter: number;
  before: GraphicsDiagnostics | null; after: GraphicsDiagnostics | null; diagnostics: PlaybackHostDiagnostic[] }
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const container = element('player'), status = element('status'), rows: Row[] = []
let host: ReturnType<typeof createStagedCheckHost> | null = null, stopped = false, inputTimer: ReturnType<typeof setInterval> | null = null
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
function render() {
  element('report').textContent = JSON.stringify({ version: 1, scope: 'Loopback staged-engine failure checks; no production or physical-phone claim.', rows }, null, 2)
  element('summary').textContent = `${rows.filter(row => row.state === 'passed').length}/${rows.length} checks passed. ${rows.reduce((count, row) => count + row.failures.length, 0)} session failures observed (one context-loss failure is expected).`
}
function dispose() {
  if (inputTimer !== null) clearInterval(inputTimer)
  inputTimer = null; host?.dispose(); host = null
}
async function waitFor(check: () => boolean, milliseconds = 5000) {
  const end = performance.now() + milliseconds
  while (!check()) {
    if (stopped || performance.now() > end) throw new Error('Expected diagnostic event did not arrive.')
    await wait(20)
  }
}
function result(error: unknown) { return isSceneReplacementError(error) ? `${error.reason}; retained=${error.retained}` : error instanceof Error ? error.message.slice(0, 160) : 'Operation rejected.' }
async function runCase(check: StagedCase) {
  const row: Row = { case: check, state: 'running', evidence: check === 'compile-failure' ? 'Actual compiler rejection of a fixed unknown function.'
    : check === 'context-loss' ? 'Actual WEBGL_lose_context request and session failure.'
      : check === 'first-frame-failure' ? 'Injected rejection after real candidate first-use draw, before activation.'
        : check === 'obsolete-candidate' ? 'Injected 750 ms delay after real candidate preparation; cancellation and newer scene use the real bridge.'
          : 'Injected dropped capture/capability replies; real host deadlines and real active frames.',
    reason: null, failures: [], markers: [], retained: false, boundaryVerified: false, framesBefore: 0, framesAfter: 0, before: null, after: null, diagnostics: [] }
  rows.push(row); render(); status.textContent = `Running ${check}…`
  let frames = 0
  const active = createStagedCheckHost({ container, rendererUrl: 'http://localhost:5181/index.html', case: check,
    startupTimeoutMs: 4000, progressTimeoutMs: 4000, useInlineFrameStyles: false,
    marker(marker: StagedMarker) { row.markers.push(marker.event) },
    onFailure(reason) { row.failures.push(reason) },
    onDiagnostic(event) {
      if (event.type === 'progress') frames++
      if (event.type !== 'watchdog' && row.diagnostics.length < 128) row.diagnostics.push(event)
    },
  })
  host = active
  try {
    await active.ready; await waitFor(() => row.markers.includes('armed'))
    active.resize(640, 360, 1)
    await active.loadScene(scene(), 'preview')
    row.boundaryVerified = hasVerifiedParentBoundary(container.querySelector('iframe'))
    if (!row.boundaryVerified) throw new Error('Separate-site sandbox not verified.')
    const frame = container.querySelector('iframe'), start = performance.now()
    inputTimer = setInterval(() => active.update({ time: (performance.now() - start) / 1000,
      audio: { audioTime: 0, frame: null, legacyAmplitude: 0, loaded: false, playing: false }, pointer: { x: 0, y: 0, down: false } }), 34)
    await wait(600); row.before = await active.requestGraphicsDiagnostics(); row.framesBefore = frames
    if (check === 'optional-timeouts') {
      const outcomes = await Promise.allSettled([active.getCapabilities(), active.capture({ width: 160, height: 90 })])
      if (outcomes.some(value => value.status !== 'rejected')) throw new Error('An optional request did not time out.')
      if (!row.diagnostics.some(event => event.type === 'operation' && event.operation === 'capabilities' && event.reason === 'timeout')
        || !row.diagnostics.some(event => event.type === 'operation' && event.operation === 'capture' && event.reason === 'timeout')) throw new Error('Expected optional deadline evidence is missing.')
    } else if (check === 'obsolete-candidate') {
      const pending = active.loadScene(scene('color(0.8,0.2,0.1); sphere(0.6);'), 'preview').then(() => null, error => error)
      await waitFor(() => row.markers.includes('candidate-held'))
      active.cancelPendingLoad()
      await active.loadScene(scene('color(0.1,0.8,0.6); sphere(0.8);'), 'preview')
      const rejected = await pending
      if (!(rejected instanceof Error) || !rejected.message.includes('Scene changed')) throw new Error('Obsolete scene did not reject.')
      await waitFor(() => row.markers.includes('candidate-released'))
    } else {
      const failed = await active.loadScene(scene(check === 'compile-failure' ? 'notARealShaderPrimitive(0.7);' : 'color(0.8,0.3,0.1); sphere(0.6);'), 'preview').then(() => null, error => error)
      row.reason = failed === null ? null : result(failed)
      if (check === 'context-loss') {
        if (!row.markers.includes('context-loss-requested') || !row.failures.includes('context-lost') || frame?.isConnected) throw new Error('Actual context loss did not retire the session.')
      } else if (!isSceneReplacementError(failed) || !failed.retained) throw new Error('Candidate failure did not preserve the active scene.')
    }
    await wait(650); row.framesAfter = frames; row.retained = Boolean(frame?.isConnected && container.querySelector('iframe') === frame)
    if (check !== 'context-loss') {
      row.after = await active.requestGraphicsDiagnostics()
      if (!row.retained || row.failures.length || frames <= row.framesBefore) throw new Error('Healthy active playback was not preserved.')
      if (!row.before || !row.after || row.after.contextsCreated !== row.before.contextsCreated || row.after.contextsDisposed !== row.before.contextsDisposed) throw new Error('Graphics session retention was not measured.')
    }
    row.state = 'passed'
  } catch (error) { row.state = 'failed'; row.reason = result(error) }
  finally { dispose(); render() }
}
async function run() {
  stopped = false; rows.length = 0
  element<HTMLButtonElement>('run').disabled = true; element<HTMLButtonElement>('stop').disabled = false
  try { for (const check of STAGED_CASES) { if (stopped) break; await runCase(check) } }
  finally {
    dispose(); element<HTMLButtonElement>('run').disabled = false; element<HTMLButtonElement>('stop').disabled = true
    element<HTMLButtonElement>('export').disabled = rows.length === 0
    status.textContent = stopped ? 'Checks stopped.' : 'Checks completed. Review the measured report.'; render()
  }
}
const allowed = import.meta.env.DEV && window.location.origin === 'http://127.0.0.1:5178'
  && window.location.pathname === '/scripts/staged-playback-check.html' && !window.location.search
if (allowed) {
  element<HTMLButtonElement>('run').disabled = false; status.textContent = 'Ready for fixed local failure checks.'
  element('run').addEventListener('click', () => { void run() })
  element('stop').addEventListener('click', () => { stopped = true; dispose() })
  element('export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([element('report').textContent ?? ''], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'mage-staged-failure-check.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0)
  })
  window.addEventListener('pagehide', () => { stopped = true; dispose() }, { once: true })
} else status.textContent = 'This check is available only in the dedicated local development harness.'

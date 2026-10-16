import { createIsolatedPlayer, type IsolatedPlayer } from '../src/modules/player/isolation/isolatedPlayer'
import type { PlaybackHostDiagnostic } from '../src/modules/player/isolation/playbackHost'
import type { GraphicsDiagnostics } from '../src/modules/player/isolation/playbackProtocol'
import { listSelectableSceneTemplates } from '../src/modules/player/templates/templateRegistry'
import { createTemplateScene } from '../src/modules/scene-editor/templateEditor'
import { hasVerifiedParentBoundary } from './isolated-playback-boundary'
import { createTestRhythm } from './test-rhythm'

const checkUrl = 'http://127.0.0.1:5178/scripts/playback-reliability-check.html'
const rendererUrl = 'http://localhost:5181/index.html'
const MAX_EVENTS = 512
const catalog = listSelectableSceneTemplates()
type AudioMode = 'legacy' | 'mapped-v1'
type Outcome = 'pending' | 'loaded' | 'superseded' | 'failed'
type LoadRow = { request: number; template: string; outcome: Outcome; elapsedMs: number | null;
  audioBefore: number; audioAfter: number | null; graphics: GraphicsDiagnostics | null; reason?: string }
type RunReport = { version: 1; run: 'sequential' | 'burst'; startedAt: string; rendererUrl: string;
  response: AudioMode; simulated: boolean; testRhythm: boolean; state: 'running' | 'completed' | 'stopped' | 'failed';
  requestedScene: string | null; activeScene: string | null; failures: string[]; retryRequired: number;
  sessionCreates: number; sessionDisposals: number; iframeStillConnected: boolean; boundaryVerified: boolean;
  parentMaxFrameGapMs: number; parentFrameSamples: number; eventsDropped: number;
  graphicsEvidence: string; finalGraphics: GraphicsDiagnostics | null; loads: LoadRow[]; diagnostics: PlaybackHostDiagnostic[] }

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const button = (id: string) => element<HTMLButtonElement>(id)
const container = element('player')
const status = element('status')
let player: IsolatedPlayer | null = null
let report: RunReport | null = null
let runGeneration = 0
let running = false
let paused = false
let capturePending = false
let captureUrl: string | null = null
let raf = 0
let lastFrame = 0
let lastRender = 0
let latestRequest = 0
let lastProgressSample = 0
let lastWatchdogSample = 0

const round = (value: number) => Math.round(value * 10) / 10
const reason = (error: unknown) => (error instanceof Error ? error.message : 'Operation failed.').slice(0,240)

function controls() {
  for (const id of ['sequential', 'burst']) button(id).disabled = running
  for (const id of ['response', 'simulate', 'rhythm']) (element(id) as HTMLInputElement).disabled = running
  button('stop').disabled = !player
  button('pause').disabled = !player
  button('capture-button').disabled = !player || capturePending
  button('export').disabled = !report
}

function render() {
  if (!report) return
  report.iframeStillConnected = Boolean(container.querySelector('iframe')?.isConnected)
  const times = report.loads.filter(row => row.outcome === 'loaded').map(row => row.elapsedMs!).sort((a,b) => a-b)
  const median = times.length ? times[Math.floor(times.length / 2)] : null
  element('summary').textContent = `${report.state} · ${times.length}/${report.loads.length} loads completed · ${report.loads.filter(row => row.outcome === 'superseded').length} superseded · ${report.retryRequired} Retry required · median load ${median ?? '—'} ms · max parent frame gap ${report.parentMaxFrameGapMs} ms`
  const rows = report.loads.map(row => {
    const tr = document.createElement('tr')
    for (const value of [row.request, row.template, row.reason ? `${row.outcome}: ${row.reason}` : row.outcome,
      row.elapsedMs ?? '—', `${round(row.audioBefore)} / ${row.audioAfter === null ? '—' : round(row.audioAfter)}`]) {
      const td = document.createElement('td'); td.textContent = String(value); tr.append(td)
    }
    return tr
  })
  element('results').replaceChildren(...rows)
  element('report').textContent = JSON.stringify(report, null, 2)
  controls()
}

function diagnose(event: PlaybackHostDiagnostic, current: number) {
  if (!report || current !== runGeneration) return
  // Keep phase/failure events; sample high-frequency progress/healthy watchdogs.
  if (event.type === 'progress') {
    if (event.at - lastProgressSample < 1000) return
    lastProgressSample = event.at
  }
  if (event.type === 'watchdog' && event.resetReason !== 'none') {
    if (event.at - lastWatchdogSample < 1000) return
    lastWatchdogSample = event.at
  }
  if (report.diagnostics.length === MAX_EVENTS) { report.diagnostics.shift(); report.eventsDropped++ }
  report.diagnostics.push(event)
}

function clearCapture() {
  const image = element<HTMLImageElement>('capture')
  image.hidden = true; image.removeAttribute('src')
  if (captureUrl) URL.revokeObjectURL(captureUrl)
  captureUrl = null
}

function stop() {
  if (player) {
    player.dispose(); player = null
    if (report) report.sessionDisposals++
  }
  runGeneration++
  running = false; capturePending = false
  cancelAnimationFrame(raf); raf = 0; lastFrame = 0
  if (report?.state === 'running') report.state = 'stopped'
  clearCapture(); controls(); render()
  status.textContent = 'Session stopped. Renderer and audio owners released.'
}

function sampleFrame(now: number) {
  if (!player || !report) return
  if (document.visibilityState === 'visible' && lastFrame) {
    report.parentMaxFrameGapMs = Math.max(report.parentMaxFrameGapMs, round(now - lastFrame))
    report.parentFrameSamples++
  }
  lastFrame = document.visibilityState === 'visible' ? now : 0
  if (now - lastRender >= 1000) {
    lastRender = now
    const audio = player.getAudioState()
    element('audio-status').textContent = audio.loaded
      ? `${audio.playing ? 'Music playing' : 'Music paused'} · ${audio.time.toFixed(1)} / ${audio.duration.toFixed(1)} seconds`
      : 'No measured music loaded.'
    render()
  }
  raf = requestAnimationFrame(sampleFrame)
}

function sceneFor(index: number, mode: AudioMode) {
  const scene = createTemplateScene(catalog[index % catalog.length].templateId)
  scene.settings.audioResponse = mode
  return scene
}

async function load(index: number, current: number): Promise<void> {
  const active = player, currentReport = report
  if (!active || !currentReport || current !== runGeneration) return
  const request = ++latestRequest
  const template = catalog[index % catalog.length]
  currentReport.requestedScene = template.label
  const row: LoadRow = { request, template: template.label, outcome: 'pending', elapsedMs: null,
    audioBefore: active.getAudioState().time, audioAfter: null, graphics: null }
  currentReport.loads.push(row)
  const started = performance.now()
  status.textContent = `Request ${request}: ${template.label}`
  render()
  try {
    // Mirrors immediate supersession in the normal controller. The bridge still
    // enforces all load-rate limits and validates the normal scene document.
    active.cancelPendingScene()
    await active.loadScene(sceneFor(index, currentReport.response), 'preview')
    // End load timing at the first-frame acknowledgement, before optional data.
    row.elapsedMs = round(performance.now() - started)
    row.outcome = current === runGeneration && request === latestRequest ? 'loaded' : 'superseded'
    if (row.outcome === 'loaded') {
      currentReport.activeScene = template.label
      currentReport.boundaryVerified = hasVerifiedParentBoundary(container.querySelector('iframe'))
      if (!currentReport.boundaryVerified) {
        active.dispose(); player = null; currentReport.sessionDisposals++; currentReport.state = 'failed'
        throw new Error('Separate-site sandbox verification failed.')
      }
      element('boundary').textContent = 'Separate-site sandbox verified. The parent cannot access the player document.'
      row.graphics = await active.requestGraphicsDiagnostics()
    }
  } catch (error) {
    row.outcome = current !== runGeneration || request !== latestRequest ? 'superseded' : 'failed'
    row.reason = reason(error)
    if (row.outcome === 'failed') currentReport.failures.push(row.reason)
  } finally {
    row.elapsedMs ??= round(performance.now() - started)
    row.audioAfter = active.getAudioState().time
    if (current === runGeneration) render()
  }
}

async function run(kind: 'sequential' | 'burst') {
  stop()
  const current = runGeneration
  const mode = element<HTMLSelectElement>('response').value as AudioMode
  report = { version: 1, run: kind, startedAt: new Date().toISOString(), rendererUrl, response: mode,
    simulated: element<HTMLInputElement>('simulate').checked, testRhythm: element<HTMLInputElement>('rhythm').checked,
    state: 'running', requestedScene: null, activeScene: null, failures: [], retryRequired: 0,
    sessionCreates: 1, sessionDisposals: 0, iframeStillConnected: false, boundaryVerified: false,
    parentMaxFrameGapMs: 0, parentFrameSamples: 0, eventsDropped: 0, finalGraphics: null, loads: [], diagnostics: [],
    graphicsEvidence: 'Graphics snapshots are opt-in observations from the isolated renderer. Null means unavailable. finalGraphics is the last successful snapshot while the final scene is alive (the final request or its completed-load snapshot); it cannot prove final context disposal after iframe removal. Session counts are separate from context counts.' }
  const currentReport = report
  running = true; paused = false; latestRequest = 0; lastProgressSample = 0; lastWatchdogSample = 0
  button('pause').textContent = 'Pause'
  try {
    player = createIsolatedPlayer({ container, rendererUrl, profile: 'preview', useInlineFrameStyles: false,
      onDiagnostic: event => diagnose(event, current),
      onStatus: state => { if (current === runGeneration) status.textContent = `Player: ${state}` },
      onFailure: failure => {
        if (current !== runGeneration) return
        currentReport.failures.push(failure); currentReport.retryRequired++; currentReport.state = 'failed'
        status.textContent = `Renderer failed: ${failure}. No automatic Retry.`; render()
      },
    })
    controls(); raf = requestAnimationFrame(sampleFrame)
    await player.ready
    if (current !== runGeneration) return
    player.setVolume(.25)
    player.setSynthetic(currentReport.simulated, 17, 1)
    if (currentReport.testRhythm) { await player.loadAudio(createTestRhythm()); await player.play() }
    if (current !== runGeneration) return
    if (kind === 'sequential') {
      for (let index = 0; index < catalog.length && current === runGeneration && currentReport.state === 'running'; index++) {
        await load(index, current)
        // A steady visible interval makes before/after measurements comparable.
        await new Promise(resolve => setTimeout(resolve, 450))
      }
    } else {
      await load(0, current)
      const pending: Promise<void>[] = []
      for (let index = 1; index <= 12 && current === runGeneration && currentReport.state === 'running'; index++) {
        // 400 ms spacing respects the unchanged four-loads-per-second budget.
        await new Promise(resolve => setTimeout(resolve, 400))
        if (current === runGeneration) pending.push(load(index, current))
      }
      await Promise.all(pending)
    }
    if (current !== runGeneration) return
    currentReport.finalGraphics = await player.requestGraphicsDiagnostics() ?? currentReport.loads.at(-1)?.graphics ?? null
    if (current !== runGeneration) return
    currentReport.state = currentReport.failures.length ? 'failed' : 'completed'
    status.textContent = `${kind} ${currentReport.state}. Requested ${currentReport.requestedScene}; active ${currentReport.activeScene}.`
  } catch (error) {
    if (current !== runGeneration) return
    currentReport.failures.push(reason(error)); currentReport.state = 'failed'
    status.textContent = reason(error)
  } finally {
    if (current === runGeneration) { running = false; controls(); render() }
  }
}

async function capture() {
  const active = player, current = runGeneration
  if (!active || capturePending) return
  capturePending = true; controls()
  try {
    const blob = await active.capture({ width: 320, height: 180, type: 'image/png' })
    if (current !== runGeneration) return
    clearCapture(); captureUrl = URL.createObjectURL(blob)
    const image = element<HTMLImageElement>('capture'); image.src = captureUrl; image.hidden = false
    status.textContent = 'Capture succeeded; the same session remains active.'
  } catch (error) { if (current === runGeneration) status.textContent = `Capture failed: ${reason(error)}` }
  finally { if (current === runGeneration) { capturePending = false; controls(); render() } }
}

if (!import.meta.env.DEV || location.href !== checkUrl) {
  status.textContent = `Run npm run manual-checks:dev and open ${checkUrl}.`
} else {
  element('address').textContent = rendererUrl
  controls(); status.textContent = 'Ready. Choose a run; nothing starts automatically.'
  button('sequential').addEventListener('click', () => { void run('sequential') })
  button('burst').addEventListener('click', () => { void run('burst') })
  button('stop').addEventListener('click', stop)
  button('capture-button').addEventListener('click', () => { void capture() })
  button('pause').addEventListener('click', () => {
    const active = player
    if (!active) return
    if (paused) void active.play().catch(error => { status.textContent = reason(error) })
    else active.pause()
    paused = !paused; button('pause').textContent = paused ? 'Play' : 'Pause'
  })
  button('export').addEventListener('click', () => {
    if (!report) return
    render()
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `mage-playback-${report.run}-${Date.now()}.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
  window.addEventListener('pagehide', stop, { once: true })
}

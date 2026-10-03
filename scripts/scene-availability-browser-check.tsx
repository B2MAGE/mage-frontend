import { createRoot } from 'react-dom/client'
import { MagePlayer, parseSceneDocument, sceneAvailabilityStore } from '@modules/player'

// There is no source editor or arbitrary payload input in this diagnostic page.
const FIXTURE_ID = 2_147_483_601
const fixture = parseSceneDocument({
  schemaVersion: 1,
  kind: 'template',
  templateId: 'reaction-rings-v1',
  templateVersion: 1,
  parameters: { scale: 1, speed: 1 },
  settings: { skybox: 6, bloom: { enabled: true, strength: 0.5, radius: 0.2, threshold: 0.1 } },
})
const preview = document.querySelector<HTMLDivElement>('#preview')!
const result = document.querySelector<HTMLPreElement>('#result')!
const requests = document.querySelector<HTMLPreElement>('#requests')!
const disable = document.querySelector<HTMLButtonElement>('#disable')!
const again = document.querySelector<HTMLButtonElement>('#again')!
const originalFetch = window.fetch.bind(window)
let fixtureDisabled = false
let startedAt: number | null = null
let removedAt: number | null = null
let contextLostAt: number | null = null
let initialCanvas: HTMLCanvasElement | null = null
let interrupted = false
let finished = false
const pageStart = performance.now()

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

window.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href)
  const statusPath = url.pathname === '/api/rendering-status'
  const scenePath = url.pathname === '/api/scene-availability'
  if (!statusPath && !scenePath) return originalFetch(input, init)
  if (init?.signal?.aborted || (input instanceof Request && input.signal.aborted)) throw new DOMException('Aborted', 'AbortError')
  if ((init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase() !== 'GET') {
    return new Response('Fixture status is read-only.', { status: 405 })
  }
  requests.textContent += `${(performance.now() - pageStart).toFixed(0)} ms  GET ${url.pathname}${url.search}  fixture=${fixtureDisabled ? 'disabled' : 'available'}\n`
  if (statusPath) return json({ enabled: true, code: 'AVAILABLE', message: null })
  const ids = (url.searchParams.get('ids') ?? '').split(',').map(Number)
  return json(ids.map((sceneId) => ({
    sceneId,
    available: sceneId === FIXTURE_ID && !fixtureDisabled,
    code: sceneId !== FIXTURE_ID ? 'SCENE_NOT_FOUND' : fixtureDisabled ? 'SCENE_DISABLED' : 'AVAILABLE',
    message: sceneId === FIXTURE_ID && !fixtureDisabled ? null : 'This fixture is unavailable.',
  })))
}

function updateResult() {
  const canvas = preview.querySelector<HTMLCanvasElement>('canvas')
  const ready = preview.querySelector('[data-state="ready"]') !== null
  if (ready && canvas && startedAt === null && canvas !== initialCanvas) {
    initialCanvas = canvas
    canvas.addEventListener('webglcontextlost', () => {
      if (startedAt !== null) contextLostAt = performance.now()
    }, { once: true })
  }
  if (startedAt === null) {
    disable.disabled = !ready
    if (ready) result.textContent = 'Ready: the bundled template is rendering.\nChoose “Disable fixture scene” to start the polling check.'
    else if (preview.querySelector('[role="alert"]')) result.textContent = `Player could not start.\n${preview.textContent?.trim()}`
    return
  }
  if (finished) return
  const elapsed = performance.now() - startedAt
  const current = sceneAvailabilityStore.getSnapshot(FIXTURE_ID)
  const unavailable = preview.querySelector('[data-state="unavailable"]') !== null
  if (initialCanvas && !initialCanvas.isConnected && !canvas && unavailable && !current.allowed) {
    removedAt = performance.now()
    const removalMs = removedAt - startedAt
    const context = initialCanvas.getContext('webgl2') ?? initialCanvas.getContext('webgl')
    const released = context?.isContextLost() === true
    const pass = removalMs <= 30_000 && !interrupted && current.code === 'SCENE_DISABLED' && released
    result.dataset.result = pass ? 'pass' : 'fail'
    result.textContent = `${pass ? 'PASS' : 'FAIL'}: ${Math.round(removalMs)} ms from fixture disable to renderer canvas removal.\n`
      + `Live permission: ${current.code}. Canvas removed: yes. Unavailable panel: yes.\n`
      + `WebGL context released: ${released ? 'yes' : 'no'}${contextLostAt === null ? '' : ` at ${Math.round(contextLostAt - startedAt)} ms`}.\n`
      + (interrupted ? 'The page lost focus or visibility during the check; reload and keep it focused.' : 'The backend and isolation release approval were not changed.')
    finished = true
    return
  }
  if (elapsed > 30_000) {
    result.dataset.result = 'fail'
    result.textContent = `FAIL: renderer shutdown was not observed within 30000 ms.\nLive permission: ${current.code}. Canvas present: ${!!canvas}. Unavailable panel: ${unavailable}.`
    finished = true
    return
  }
  result.textContent = `Waiting for the regular availability poll… ${Math.round(elapsed)} ms\n`
    + `Live permission: ${current.code}. Canvas present: ${!!canvas}.\n`
    + 'Keep this page visible and focused until the result appears.'
}

disable.addEventListener('click', () => {
  if (!initialCanvas?.isConnected || startedAt !== null) return
  startedAt = performance.now()
  fixtureDisabled = true
  disable.disabled = true
  updateResult()
})
again.addEventListener('click', () => location.reload())
window.addEventListener('blur', () => { if (startedAt !== null && !finished) interrupted = true })
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && startedAt !== null && !finished) interrupted = true
})
const observer = new MutationObserver(updateResult)
observer.observe(preview, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] })
const ticker = window.setInterval(updateResult, 250)
const root = createRoot(preview)
root.render(<MagePlayer sceneBlob={fixture} sceneKey={FIXTURE_ID} ariaLabel="Availability fixture: Ripple Rings" initialPlayback="playing" />)

window.addEventListener('pagehide', () => {
  observer.disconnect()
  clearInterval(ticker)
  root.unmount()
  sceneAvailabilityStore.dispose()
  window.fetch = originalFetch
}, { once: true })

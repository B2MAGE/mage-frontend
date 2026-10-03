import { createRoot } from 'react-dom/client'
import { MagePlayer, parseSceneDocument, sceneAvailabilityStore } from '@modules/player'
import { sceneRecovery, sceneRecoveryKey } from '../src/modules/player/recovery/sceneRecovery'

// There is no source editor or arbitrary payload input in this diagnostic page.
const FIXTURE_ID = 2_147_483_601
const target = `template:${FIXTURE_ID}` as const
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
const reenable = document.querySelector<HTMLButtonElement>('#reenable')!
const recoveryKey = sceneRecoveryKey(fixture, FIXTURE_ID)!
const originalFetch = window.fetch.bind(window)
let fixtureDisabled = false
let startedAt: number | null = null
let removedAt: number | null = null
let initialFrame: HTMLIFrameElement | null = null
let interrupted = false
let finished = false
let fixtureBlockAt: number | null = null
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
  const frame = preview.querySelector<HTMLIFrameElement>('iframe')
  const parentCanvases = preview.querySelectorAll('canvas').length
  const ready = preview.querySelector('[data-state="ready"]') !== null
  if (ready && frame && startedAt === null) initialFrame = frame
  if (startedAt === null) {
    disable.disabled = !ready || !initialFrame || parentCanvases !== 0
    if (ready) result.textContent = `Ready: the bundled template is rendering in an isolated frame. Parent canvases: ${parentCanvases}.\nChoose “Disable fixture scene” to start the polling check.`
    else if (preview.querySelector('[role="alert"]')) result.textContent = `Player could not start.\n${preview.textContent?.trim()}`
    return
  }
  if (finished) return
  const elapsed = performance.now() - startedAt
  const current = sceneAvailabilityStore.getSnapshot(target)
  const unavailable = preview.querySelector('[data-state="unavailable"]') !== null
  if (initialFrame && !initialFrame.isConnected && !frame && unavailable && !current.allowed) {
    removedAt = performance.now()
    const removalMs = removedAt - startedAt
    const pass = removalMs <= 30_000 && !interrupted && current.code === 'SCENE_DISABLED' && parentCanvases === 0
    result.dataset.result = pass ? 'pass' : 'fail'
    result.textContent = `${pass ? 'PASS' : 'FAIL'}: ${Math.round(removalMs)} ms from fixture disable to isolated frame removal.\n`
      + `Live permission: ${current.code}. Frame removed: yes. Unavailable panel: yes. Parent canvases: ${parentCanvases}.\n`
      + 'The opaque child cannot be inspected for GPU state; child disposal is covered by its lifecycle tests.\n'
      + (interrupted ? 'The page lost focus or visibility during the check; reload and keep it focused.' : 'The backend and isolation release approval were not changed.')
    finished = true
    reenable.disabled = !pass
    return
  }
  if (elapsed > 30_000) {
    result.dataset.result = 'fail'
    result.textContent = `FAIL: renderer shutdown was not observed within 30000 ms.\nLive permission: ${current.code}. Frame present: ${!!frame}. Parent canvases: ${parentCanvases}. Unavailable panel: ${unavailable}.`
    finished = true
    return
  }
  result.textContent = `Waiting for the regular availability poll… ${Math.round(elapsed)} ms\n`
    + `Live permission: ${current.code}. Frame present: ${!!frame}. Parent canvases: ${parentCanvases}.\n`
    + 'Keep this page visible and focused until the result appears.'
}

disable.addEventListener('click', () => {
  if (!initialFrame?.isConnected || startedAt !== null) return
  startedAt = performance.now()
  fixtureDisabled = true
  disable.disabled = true
  updateResult()
})
reenable.addEventListener('click', () => {
  reenable.disabled = true
  void (async () => {
    const waitUntil = async (condition: () => boolean, message: string) => {
      const start = performance.now()
      while (!condition()) {
        if (performance.now() - start > 15_000) throw new Error(message)
        await new Promise(resolve => setTimeout(resolve, 30))
      }
    }
    try {
      sceneRecovery.block(recoveryKey, 'runtime')
      fixtureBlockAt = sceneRecovery.getAutomaticBlock(recoveryKey)?.at ?? null
      fixtureDisabled = false
      await sceneAvailabilityStore.check(target)
      await waitUntil(() => !!preview.querySelector('[data-state="blocked"]'), 'Re-enable did not preserve the local recovery screen.')
      await new Promise(resolve => setTimeout(resolve, 350))
      if (!sceneAvailabilityStore.isAllowed(target) || preview.querySelector('iframe, canvas')
        || sceneRecovery.getAutomaticBlock(recoveryKey)?.at !== fixtureBlockAt) {
        throw new Error('Re-enable bypassed the local failure, or fresh permission was not granted.')
      }
      const retry = [...preview.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Retry scene')
      if (!retry || retry.disabled) throw new Error('Explicit Retry scene action is missing.')
      retry.click()
      await waitUntil(() => !!preview.querySelector('[data-state="ready"] iframe'), 'Explicit Retry did not create a new isolated player.')
      const nextFrame = preview.querySelector('iframe')
      if (nextFrame === initialFrame || initialFrame?.isConnected || preview.querySelector('canvas')) throw new Error('Retry reused the denied frame or created a parent canvas.')
      result.dataset.result = 'pass'
      result.textContent = `PASS: disable removed the isolated frame in ${Math.round(removedAt! - startedAt!)} ms.\nRe-enable required fresh permission and kept the local failure blocked.\nOnly the explicit Retry action created a new isolated frame. Parent scene canvases: 0.\nBackend settings and isolation release approval were unchanged.`
    } catch (error) {
      result.dataset.result = 'fail'
      result.textContent = `FAIL: ${String(error)}`
    }
  })()
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
  if (fixtureBlockAt !== null && sceneRecovery.getAutomaticBlock(recoveryKey)?.at === fixtureBlockAt) sceneRecovery.clear(recoveryKey)
  sceneAvailabilityStore.dispose()
  window.fetch = originalFetch
}, { once: true })

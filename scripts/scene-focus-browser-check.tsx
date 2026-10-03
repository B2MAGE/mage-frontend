import { createRoot } from 'react-dom/client'
import { MagePlayer, parseSceneDocument, sceneAvailabilityStore } from '@modules/player'

const FIXTURE_ID = 2_147_483_602
const target = `template:${FIXTURE_ID}` as const
const fixture = parseSceneDocument({ schemaVersion: 1, kind: 'template', templateId: 'reaction-rings-v1', templateVersion: 1 })
const preview = document.querySelector<HTMLDivElement>('#preview')!
const result = document.querySelector<HTMLPreElement>('#result')!
const start = document.querySelector<HTMLButtonElement>('#start')!
const resume = document.querySelector<HTMLButtonElement>('#resume')!
const deny = document.querySelector<HTMLButtonElement>('#deny')!
const originalFetch = window.fetch.bind(window)
let checking = false
let disabled = false
let busy = false
let interrupted = false
let finishReply: (() => void) | null = null
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } })
}
window.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href)
  if (url.pathname === '/api/rendering-status') return json({ enabled: false, code: 'CUSTOM_RENDERING_DISABLED' })
  if (url.pathname !== '/api/scene-availability') return originalFetch(input, init)
  if (checking) await new Promise<void>((resolve, reject) => {
    finishReply = resolve
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
  return json((url.searchParams.get('ids') ?? '').split(',').map(Number).map(sceneId => ({
    sceneId, available: sceneId === FIXTURE_ID && !disabled,
    code: sceneId === FIXTURE_ID ? disabled ? 'SCENE_DISABLED' : 'AVAILABLE' : 'SCENE_NOT_FOUND',
  })))
}

// A local, silent PCM track avoids autoplay noise and external file dependencies.
const seconds = 600
const samples = seconds * 8_000
const wav = new ArrayBuffer(44 + samples * 2)
const bytes = new DataView(wav)
const ascii = (offset: number, value: string) => [...value].forEach((letter, index) => bytes.setUint8(offset + index, letter.charCodeAt(0)))
ascii(0, 'RIFF'); bytes.setUint32(4, 36 + samples * 2, true); ascii(8, 'WAVE'); ascii(12, 'fmt ')
bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 1, true)
bytes.setUint32(24, 8_000, true); bytes.setUint32(28, 16_000, true); bytes.setUint16(32, 2, true); bytes.setUint16(34, 16, true)
ascii(36, 'data'); bytes.setUint32(40, samples * 2, true)
const audioUrl = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }))
const track = { id: 'continuity-track', name: 'Continuity test.wav', duration: seconds, sourcePath: audioUrl, sourceType: 'device' as const }
const root = createRoot(preview)
// Decode without requesting autoplay. The explicit Start button resumes the
// real player's AudioContext during the user's gesture, before any check runs.
root.render(<MagePlayer sceneBlob={fixture} sceneKey={FIXTURE_ID} initialPlayback="paused"
  playlistTracks={[track]} selectedTrackId={track.id} ariaLabel="Playback continuity: Ripple Rings" />)

const seek = () => preview.querySelector<HTMLInputElement>('input[aria-label="Seek scene audio"]')
const elapsed = () => Number(seek()?.value ?? 0)
const waitUntil = async (condition: () => boolean, message: string, timeoutMs = 4_000) => {
  const started = performance.now()
  while (!condition()) {
    if (performance.now() - started > timeoutMs) throw new Error(message)
    await sleep(30)
  }
}
async function run(denyPlayback: boolean) {
  if (busy) return
  busy = true; interrupted = false; resume.disabled = true; deny.disabled = true
  const frame = preview.querySelector<HTMLIFrameElement>('iframe')
  try {
    if (!frame || preview.querySelector('canvas')) throw new Error('Expected an isolated frame and no parent canvas.')
    const before = elapsed()
    checking = true
    window.dispatchEvent(new Event('focus'))
    await waitUntil(() => sceneAvailabilityStore.getSnapshot(target).code === 'CHECKING', 'The fresh check did not start.')
    await sleep(180)
    const pausedAt = elapsed()
    await sleep(900)
    const frozen = Math.abs(elapsed() - pausedAt) < 0.3
    const retained = frame.isConnected && preview.querySelector('iframe') === frame && !preview.querySelector('canvas')
    if (!frozen || !retained) throw new Error(`During check: same isolated frame=${retained}, audio paused=${frozen}.`)
    disabled = denyPlayback; checking = false; finishReply?.(); finishReply = null
    await waitUntil(() => sceneAvailabilityStore.getSnapshot(target).code === (denyPlayback ? 'SCENE_DISABLED' : 'AVAILABLE'), 'No fresh permission result.')
    await sleep(400)
    if (denyPlayback) {
      await waitUntil(() => !frame.isConnected && !preview.querySelector('iframe') && !!preview.querySelector('[data-state="unavailable"]'), 'Denied renderer was not removed.')
      if (preview.querySelector('canvas')) throw new Error('Unexpected parent scene canvas after denial.')
      result.textContent = 'PASS: the check retained a suspended player; confirmed denial removed its isolated frame and displayed the unavailable panel.\nParent scene canvases: 0. GPU cleanup inside the opaque child is covered by its lifecycle tests.'
    } else {
      await sleep(600)
      const after = elapsed()
      if (preview.querySelector('iframe') !== frame || preview.querySelector('canvas') || after < before || after <= pausedAt + 0.2 || after > pausedAt + 1.8) {
        throw new Error(`The player did not resume in place: before=${before}, paused=${pausedAt}, after=${after}.`)
      }
      result.textContent = `PASS: same isolated frame throughout the check; parent scene canvases: 0.\nAudio paused at ${pausedAt.toFixed(2)}s and resumed at ${after.toFixed(2)}s without restarting.\nFresh permission was required before playback resumed. Custom rendering remained disabled.`
    }
    if (interrupted) throw new Error('The page lost visibility during the check; reload and keep the page visible.')
    result.dataset.result = 'pass'
  } catch (error) {
    result.dataset.result = 'fail'; result.textContent = `FAIL: ${String(error)}`
  } finally {
    checking = false; finishReply?.(); finishReply = null; busy = false
    resume.disabled = disabled; deny.disabled = disabled
  }
}
start.addEventListener('click', () => {
  const play = preview.querySelector<HTMLButtonElement>('button[aria-label="Play scene and audio playback"]')
  if (!play || play.disabled || busy) return
  start.disabled = true
  result.textContent = 'Starting silent test audio…'
  // Keep this synchronous with the trusted button click; awaiting readiness
  // before invoking Play could lose the browser's transient activation.
  play.click()
  void waitUntil(() => elapsed() > 0.3, 'The audio clock did not start. Reload and choose Start test audio.', 8_000).then(() => {
    resume.disabled = false; deny.disabled = false
    result.textContent = 'Ready. Audio is advancing. Check pause/resume first, then confirmed denial.'
  }).catch(error => { result.dataset.result = 'fail'; result.textContent = String(error) })
})
resume.addEventListener('click', () => { void run(false) })
deny.addEventListener('click', () => { void run(true) })
document.querySelector('#again')!.addEventListener('click', () => location.reload())
document.addEventListener('visibilitychange', () => { if (busy && document.hidden) interrupted = true })
void waitUntil(() => !!seek() && !seek()!.disabled && !!preview.querySelector('iframe'), 'Isolated player or audio did not load.', 15_000).then(() => {
  start.disabled = false
  result.textContent = 'The player and silent track are loaded and paused. Choose Start test audio to allow audio playback.'
}).catch(error => { result.dataset.result = 'fail'; result.textContent = String(error) })
window.addEventListener('pagehide', () => {
  root.unmount(); sceneAvailabilityStore.dispose(); URL.revokeObjectURL(audioUrl); window.fetch = originalFetch
}, { once: true })

import { createIsolatedRendererHost, type IsolatedRendererHost } from '../src/modules/player/isolation/rendererHost'

const container = document.getElementById('player')!
const status = document.getElementById('status')!
const boundary = document.getElementById('boundary')!
const start = document.getElementById('start') as HTMLButtonElement
const stop = document.getElementById('stop') as HTMLButtonElement
const unavailable = document.getElementById('unavailable') as HTMLButtonElement
const rendererUrl = import.meta.env.VITE_ISOLATED_RENDERER_URL || 'http://localhost:5181/index.html'
document.getElementById('address')!.textContent = rendererUrl
let player: IsolatedRendererHost | null = null
let generation = 0
function launch(failure = false) {
  const current = ++generation
  player?.dispose()
  player = null
  boundary.textContent = ''
  start.disabled = true; unavailable.disabled = true; stop.disabled = false
  const url = new URL(rendererUrl)
  if (failure) url.pathname = '/unavailable.html'
  try {
    player = createIsolatedRendererHost({ container, rendererUrl: url.href, onStatus: state => {
      if (current !== generation) return
      const messages = { starting: 'Connecting to the separate player…', ready: 'Player ready.', rendering: 'Loading sample…',
        rendered: 'Sample running in the isolated player.', error: 'The separate player is unavailable. You can retry.', disposed: 'Player stopped and removed.' }
      status.textContent = messages[state]
      if (state === 'rendered') {
        // Run in the actual parent page, not an automation DOM snapshot.
        try {
          const child = container.querySelector('iframe')?.contentWindow
          if (!child) throw new Error('Missing player')
          void child.document
          boundary.textContent = 'Isolation check failed. Player stopped.'
          player?.dispose()
        } catch (error) {
          boundary.textContent = error instanceof DOMException && error.name === 'SecurityError'
            ? 'Verified: the parent page cannot access the renderer document.' : 'Isolation check could not be confirmed.'
        }
      }
      if (state === 'ready') void player?.renderSample().catch(() => {})
      if (state === 'error' || state === 'disposed') { start.disabled = false; unavailable.disabled = false; stop.disabled = true }
    } })
  } catch {
    status.textContent = 'The separate player is unavailable. Check its address and try again.'
    start.disabled = false; unavailable.disabled = false; stop.disabled = true
  }
}
start.addEventListener('click', () => launch())
unavailable.addEventListener('click', () => launch(true))
stop.addEventListener('click', () => { player?.dispose(); player = null })
window.addEventListener('pagehide', () => { generation++; player?.dispose() })

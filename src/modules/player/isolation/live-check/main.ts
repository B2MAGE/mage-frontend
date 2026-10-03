import { createIsolatedRendererHost, type IsolatedRendererHost } from '../rendererHost'
import { hasVerifiedParentBoundary } from './boundaryCheck'

declare const __MAGE_PLAYER_CHECK_PARENT_ORIGIN__: string
declare const __MAGE_PLAYER_CHECK_RENDERER_URL__: string

const container = document.getElementById('player')!
const status = document.getElementById('status')!
const renderResult = document.getElementById('render-result')!
const boundaryResult = document.getElementById('boundary-result')!
const stopResult = document.getElementById('stop-result')!
const retryResult = document.getElementById('retry-result')!
const start = document.getElementById('start') as HTMLButtonElement
const stop = document.getElementById('stop') as HTMLButtonElement
const unavailable = document.getElementById('unavailable') as HTMLButtonElement
const rendererUrl = __MAGE_PLAYER_CHECK_RENDERER_URL__
document.getElementById('address')!.textContent = rendererUrl

let player: IsolatedRendererHost | null = null
let generation = 0
let unavailableConfirmed = false
let activeSampleRendered = false

function setIdle(retry = false) {
  start.textContent = retry ? 'Retry sample' : 'Start sample'
  start.disabled = false
  unavailable.disabled = false
  stop.disabled = true
}

function launch(testFailure = false) {
  const current = ++generation
  player?.dispose()
  player = null
  activeSampleRendered = false
  start.disabled = true
  unavailable.disabled = true
  stop.disabled = false
  boundaryResult.textContent = 'Isolation: waiting for a running sample.'
  const url = new URL(rendererUrl)
  if (testFailure) {
    url.pathname = '/unavailable.html'
    unavailableConfirmed = false
    retryResult.textContent = 'Unavailable player and retry: testing the unavailable player…'
  }
  try {
    player = createIsolatedRendererHost({
      container,
      rendererUrl: url.href,
      useInlineFrameStyles: false,
      onStatus: state => {
        if (current !== generation) return
        if (state === 'starting') status.textContent = 'Connecting to the separate player…'
        if (state === 'ready') {
          status.textContent = 'Player ready. Loading the sample…'
          void player?.renderSample().catch(() => { /* The host reports failures through onStatus. */ })
        }
        if (state === 'rendering') status.textContent = 'Loading the sample…'
        if (state === 'rendered') {
          if (testFailure || !hasVerifiedParentBoundary(container.querySelector('iframe'))) {
            generation++
            player?.dispose()
            player = null
            boundaryResult.textContent = 'Isolation: could not be verified. Player removed.'
            status.textContent = 'The player did not pass the expected checks.'
            setIdle(true)
            return
          }
          activeSampleRendered = true
          status.textContent = 'Sample running in the separately hosted player.'
          renderResult.textContent = 'Sample: passed. Rendered from the live CloudFront player.'
          boundaryResult.textContent = 'Isolation: verified. Scripts-only frame; player document access is blocked.'
          if (unavailableConfirmed) retryResult.textContent = 'Unavailable player and retry: passed. The failed player was removed and a fresh sample is running.'
          unavailable.disabled = false
        }
        if (state === 'error') {
          const removed = !container.querySelector('iframe')
          status.textContent = 'The separate player is unavailable. Retry the sample to reconnect.'
          if (testFailure) {
            unavailableConfirmed = removed
            retryResult.textContent = removed
              ? 'Unavailable player: passed. The failed frame was removed. Choose Retry sample.'
              : 'Unavailable player: failed. Its frame was not removed.'
          }
          setIdle(true)
        }
        if (state === 'disposed') {
          status.textContent = 'Player stopped and removed.'
          setIdle()
        }
      },
    })
  } catch {
    status.textContent = 'The separate player could not be started. Retry the sample.'
    setIdle(true)
  }
}

if (window.location.origin !== __MAGE_PLAYER_CHECK_PARENT_ORIGIN__) {
  status.textContent = `Open this check from ${__MAGE_PLAYER_CHECK_PARENT_ORIGIN__}/player-check/ to test the live deployment.`
} else {
  status.textContent = 'Ready to test the live player.'
  setIdle()
  start.addEventListener('click', () => launch())
  unavailable.addEventListener('click', () => launch(true))
  stop.addEventListener('click', () => {
    const wasRunning = activeSampleRendered
    player?.dispose()
    player = null
    activeSampleRendered = false
    stopResult.textContent = wasRunning && !container.querySelector('iframe')
      ? 'Stop: passed. The running player was removed.'
      : 'Stop: player removed. Run the sample before checking that playback stops.'
  })
}

window.addEventListener('pagehide', () => { generation++; player?.dispose(); player = null })

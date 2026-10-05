import { verifyOpaqueSandbox } from './boundary'
import { installPlaybackRuntime } from './playbackRuntime'
import { loadPlaybackEngine } from './playbackEngine'
import { isPlaybackMessage } from '../modules/player/isolation/playbackProtocol'

declare const __MAGE_RENDERER_PARENT_ORIGINS__: readonly string[]

const canvas = document.getElementById('renderer-canvas')
const statusElement = document.getElementById('renderer-status')
if (!(canvas instanceof HTMLCanvasElement) || !statusElement) throw new Error('Renderer document is incomplete.')

if (verifyOpaqueSandbox(window)) {
  // The published renderer accepts only ordinary playback. Fixed diagnostics
  // have a separate local-only entry and never ship with this runtime.
  const select = (event: MessageEvent) => {
    if (event.source !== window.parent || !__MAGE_RENDERER_PARENT_ORIGINS__.includes(event.origin) || event.ports.length !== 1) return
    if (!isPlaybackMessage(event.data, ['connect'])) return
    window.removeEventListener('message', select)
    window.removeEventListener('pagehide', stopSelecting)
    const shared = { canvas, statusElement, allowedParentOrigins: __MAGE_RENDERER_PARENT_ORIGINS__, initialConnection: event }
    installPlaybackRuntime({ ...shared, loadScene: loadPlaybackEngine })
  }
  const stopSelecting = () => window.removeEventListener('message', select)
  statusElement.textContent = 'Waiting for MAGE…'
  window.addEventListener('message', select)
  window.addEventListener('pagehide', stopSelecting, { once: true })
} else {
  statusElement.textContent = window.parent === window ? 'Open this player from MAGE.' : 'The separate player is unavailable.'
}

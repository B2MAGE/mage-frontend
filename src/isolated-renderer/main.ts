import { installRendererRuntime } from './runtime'
import { loadKnownSample } from './sample'
import { verifyOpaqueSandbox } from './boundary'
import { installPlaybackRuntime } from './playbackRuntime'
import { loadPlaybackEngine } from './playbackEngine'
import { isPlaybackMessage } from '../modules/player/isolation/playbackProtocol'
import { isRendererMessage } from '../modules/player/isolation/protocol'

declare const __MAGE_RENDERER_PARENT_ORIGINS__: readonly string[]

const canvas = document.getElementById('renderer-canvas')
const statusElement = document.getElementById('renderer-status')
if (!(canvas instanceof HTMLCanvasElement) || !statusElement) throw new Error('Renderer document is incomplete.')

if (verifyOpaqueSandbox(window)) {
  // Select once, before either runtime owns a port. A frame cannot run both protocols.
  const select = (event: MessageEvent) => {
    if (event.source !== window.parent || !__MAGE_RENDERER_PARENT_ORIGINS__.includes(event.origin) || event.ports.length !== 1) return
    const playback = isPlaybackMessage(event.data, ['connect'])
    if (!playback && !isRendererMessage(event.data, ['connect'])) return
    window.removeEventListener('message', select)
    window.removeEventListener('pagehide', stopSelecting)
    const shared = { canvas, statusElement, allowedParentOrigins: __MAGE_RENDERER_PARENT_ORIGINS__, initialConnection: event }
    if (playback) installPlaybackRuntime({ ...shared, loadScene: loadPlaybackEngine })
    else installRendererRuntime({ ...shared, loadSample: loadKnownSample })
  }
  const stopSelecting = () => window.removeEventListener('message', select)
  statusElement.textContent = 'Waiting for MAGE…'
  window.addEventListener('message', select)
  window.addEventListener('pagehide', stopSelecting, { once: true })
} else {
  statusElement.textContent = window.parent === window ? 'Open this player from MAGE.' : 'The separate player is unavailable.'
}

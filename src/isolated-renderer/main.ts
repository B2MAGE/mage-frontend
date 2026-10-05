import { installRendererRuntime } from './runtime'
import { loadKnownSample } from './sample'
import { verifyOpaqueSandbox } from './boundary'
import { installPlaybackRuntime } from './playbackRuntime'
import { loadPlaybackEngine } from './playbackEngine'
import { isPlaybackMessage } from '../modules/player/isolation/playbackProtocol'
import { isRendererMessage } from '../modules/player/isolation/protocol'
import { installFixedWorkerCheck } from '../../scripts/worker-check-child'
import { isWorkerCheckConnection } from '../../scripts/worker-check-fixture'
import { isFixedRecoveryConnection } from '../modules/player/isolation/fixedRecoveryProtocol'
import { installFixedRecoveryCheck } from '../../scripts/fixed-recovery-child'

declare const __MAGE_RENDERER_PARENT_ORIGINS__: readonly string[]

const canvas = document.getElementById('renderer-canvas')
const statusElement = document.getElementById('renderer-status')
if (!(canvas instanceof HTMLCanvasElement) || !statusElement) throw new Error('Renderer document is incomplete.')

if (verifyOpaqueSandbox(window)) {
  // Select once, before any runtime owns a port. Each frame owns one protocol.
  const select = (event: MessageEvent) => {
    if (event.source !== window.parent || !__MAGE_RENDERER_PARENT_ORIGINS__.includes(event.origin) || event.ports.length !== 1) return
    const playback = isPlaybackMessage(event.data, ['connect'])
    const workerCheck = isWorkerCheckConnection(event.data)
    const recoveryCheck = isFixedRecoveryConnection(event.data)
    if (!playback && !workerCheck && !recoveryCheck && !isRendererMessage(event.data, ['connect'])) return
    window.removeEventListener('message', select)
    window.removeEventListener('pagehide', stopSelecting)
    const shared = { canvas, statusElement, allowedParentOrigins: __MAGE_RENDERER_PARENT_ORIGINS__, initialConnection: event }
    if (recoveryCheck) installFixedRecoveryCheck(shared)
    else if (workerCheck) installFixedWorkerCheck(shared)
    else if (playback) installPlaybackRuntime({ ...shared, loadScene: loadPlaybackEngine })
    else installRendererRuntime({ ...shared, loadSample: loadKnownSample })
  }
  const stopSelecting = () => window.removeEventListener('message', select)
  statusElement.textContent = 'Waiting for MAGE…'
  window.addEventListener('message', select)
  window.addEventListener('pagehide', stopSelecting, { once: true })
} else {
  statusElement.textContent = window.parent === window ? 'Open this player from MAGE.' : 'The separate player is unavailable.'
}

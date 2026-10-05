import { installRendererRuntime } from '../src/isolated-renderer/runtime'
import { loadKnownSample } from '../src/isolated-renderer/sample'
import { verifyOpaqueSandbox } from '../src/isolated-renderer/boundary'
import { installPlaybackRuntime } from '../src/isolated-renderer/playbackRuntime'
import { loadPlaybackEngine } from '../src/isolated-renderer/playbackEngine'
import { isPlaybackMessage } from '../src/modules/player/isolation/playbackProtocol'
import { isRendererMessage } from '../src/modules/player/isolation/protocol'
import { fixedRecoveryConnection, isFixedRecoveryCheck, isFixedRecoveryMarker, type FixedRecoveryCheck } from '../src/modules/player/isolation/fixedRecoveryProtocol'
import { installFixedWorkerCheck } from './worker-check-child'
import { isWorkerCheckConnection } from './worker-check-fixture'
import { installFixedRecoveryCheck } from './fixed-recovery-child'

declare const __MAGE_RENDERER_PARENT_ORIGINS__: readonly string[]
const canvas = document.getElementById('renderer-canvas'), statusElement = document.getElementById('renderer-status')
if (!(canvas instanceof HTMLCanvasElement) || !statusElement) throw new Error('Renderer document is incomplete.')
const origins = __MAGE_RENDERER_PARENT_ORIGINS__.filter(origin => ['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
let check: FixedRecoveryCheck | null = null, evidence: MessagePort | null = null
const stopSelecting = () => { window.removeEventListener('message', select); evidence?.close(); evidence = null }
function select(event: MessageEvent) {
  if (event.source !== window.parent || !origins.includes(event.origin) || event.ports.length !== 1) return
  const value = event.data
  if (!check && value?.type === 'mage-local-recovery-setup' && Object.keys(value).length === 3
    && isFixedRecoveryCheck({ case: value.case, nonce: value.nonce })) {
    check = { case: value.case, nonce: value.nonce }; evidence = event.ports[0]; evidence.start(); return
  }
  const playback = isPlaybackMessage(value, ['connect']), workerCheck = isWorkerCheckConnection(value)
  if (!playback && !workerCheck && !isRendererMessage(value, ['connect'])) return
  window.removeEventListener('message', select)
  const shared = { canvas: canvas as HTMLCanvasElement, statusElement: statusElement!, allowedParentOrigins: origins, initialConnection: event }
  if (check && playback) {
    const real = event.ports[0]
    let sent = 0, acknowledged = 0, retiring = false
    const replies: Array<{ data: unknown; transfer: Transferable[] }> = []
    const flush = () => {
      if (acknowledged !== sent) return
      for (const reply of replies.splice(0)) real.postMessage(reply.data, reply.transfer)
      if (retiring) { real.close(); evidence?.close() }
    }
    evidence!.onmessage = reply => {
      if (!reply.data || Object.keys(reply.data).length !== 1 || reply.data.ack !== acknowledged + 1 || reply.data.ack > sent) {
        real.close(); evidence?.close(); return
      }
      acknowledged = reply.data.ack; flush()
    }
    // Recovery markers go to the diagnostics adapter. Ordinary replies are
    // observed unchanged by the actual playback host and its watchdog.
    const port = { get onmessage() { return real.onmessage }, set onmessage(value) { real.onmessage = value },
      get onmessageerror() { return real.onmessageerror }, set onmessageerror(value) { real.onmessageerror = value },
      start: () => real.start(), close: () => { retiring = true; flush() },
      postMessage(data: unknown, transfer: Transferable[] = []) {
        if (isFixedRecoveryMarker(data)) { sent++; evidence?.postMessage(data) }
        else { replies.push({ data, transfer }); flush() }
      } } as MessagePort
    installFixedRecoveryCheck({ ...shared, initialConnection: { source: event.source, origin: event.origin,
      ports: [port], data: fixedRecoveryConnection(value.session, check) } as unknown as MessageEvent })
  } else if (workerCheck) installFixedWorkerCheck(shared)
  else if (playback) installPlaybackRuntime({ ...shared, loadScene: loadPlaybackEngine })
  else installRendererRuntime({ ...shared, loadSample: loadKnownSample })
}
if (verifyOpaqueSandbox(window) && origins.length === __MAGE_RENDERER_PARENT_ORIGINS__.length) {
  statusElement.textContent = 'Waiting for local diagnostics…'
  window.addEventListener('message', select); window.addEventListener('pagehide', stopSelecting, { once: true })
} else statusElement.textContent = 'Local diagnostics are unavailable.'

import { verifyOpaqueSandbox } from '../src/isolated-renderer/boundary'
import { runFixedWorkerChecks } from './worker-check-runner'
import { exact, validNonce, WORKER_CHECK_PARENT, WORKER_CHECK_PROTOCOL } from './worker-check-fixture'

const status = document.getElementById('renderer-status')!
let active: AbortController | null = null, port: MessagePort | null = null
function stop() { active?.abort(); active = null; port?.close(); port = null }
window.addEventListener('pagehide', stop, { once: true })
if (!verifyOpaqueSandbox()) status.textContent = 'Open this fixed worker check from its local parent page.'
else {
  status.textContent = 'Waiting for the fixed worker check…'
  const connect = (event: MessageEvent) => {
    const value = event.data
    if (event.source !== window.parent || event.origin !== WORKER_CHECK_PARENT || event.ports.length !== 1
      || !exact(value, ['protocol', 'version', 'type', 'nonce']) || value.protocol !== WORKER_CHECK_PROTOCOL
      || value.version !== 1 || value.type !== 'connect' || !validNonce(value.nonce)) return
    window.removeEventListener('message', connect)
    const nonce = value.nonce, controller = new AbortController()
    active = controller; port = event.ports[0]
    port.onmessage = message => {
      if (exact(message.data, ['type', 'nonce']) && message.data.type === 'stop' && message.data.nonce === nonce) stop()
    }
    port.onmessageerror = stop; port.start()
    const send = (message: object) => { if (!controller.signal.aborted) port?.postMessage({ ...message, nonce }) }
    send({ type: 'ready' })
    void runFixedWorkerChecks({ signal: controller.signal, nonce, emit(event) {
      status.textContent = `Fixed worker check: ${event.phase}.`
      send({ type: 'event', event })
    } }).then(summary => { send({ type: 'complete', summary }); status.textContent = 'Fixed worker check complete.' }, () => {
      send({ type: 'failed' }); status.textContent = 'Fixed worker check did not complete.'
    })
  }
  window.addEventListener('message', connect)
}

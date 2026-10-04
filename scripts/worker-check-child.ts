import { verifyOpaqueSandbox } from '../src/isolated-renderer/boundary'
import { runFixedWorkerChecks } from './worker-check-runner'
import { exact, isWorkerCheckConnection } from './worker-check-fixture'

/** Separate fixed protocol: a parent can start this suite, never select or submit source. */
export function installFixedWorkerCheck(options: {
  statusElement: HTMLElement; allowedParentOrigins: readonly string[]; targetWindow?: Window; initialConnection?: MessageEvent
}, runChecks = runFixedWorkerChecks) {
  const target = options.targetWindow ?? window, status = options.statusElement
  let active: AbortController | null = null, port: MessagePort | null = null, closed = false
  function stop() {
    if (closed) return
    closed = true; target.removeEventListener('message', connect); target.removeEventListener('pagehide', stop)
    active?.abort(); active = null; port?.close(); port = null
  }
  function connect(event: MessageEvent) {
    const value = event.data
    if (closed || active || target.parent === target || event.source !== target.parent
      || !options.allowedParentOrigins.includes(event.origin) || event.ports.length !== 1 || !isWorkerCheckConnection(value)) return
    target.removeEventListener('message', connect)
    const nonce = value.nonce, controller = new AbortController()
    active = controller; port = event.ports[0]
    port.onmessage = message => {
      // Only cancellation is accepted after the fixed suite has started.
      if (!exact(message.data, ['type', 'nonce']) || message.data.type !== 'stop' || message.data.nonce !== nonce) { stop(); return }
      stop()
    }
    port.onmessageerror = stop; port.start()
    const live = () => !closed && active === controller && !controller.signal.aborted
    const send = (message: object) => { if (live()) port?.postMessage({ ...message, nonce }) }
    send({ type: 'ready' })
    void runChecks({ signal: controller.signal, nonce, emit(event) {
      if (!live()) return
      status.textContent = `Fixed worker check: ${event.phase}.`
      send({ type: 'event', event })
    } }).then(summary => {
      if (!live()) return
      send({ type: 'complete', summary }); status.textContent = 'Fixed worker check complete.'
    }, () => {
      if (!live()) return
      send({ type: 'failed' }); status.textContent = 'Fixed worker check did not complete.'
    })
  }
  if (!verifyOpaqueSandbox(target)) {
    status.textContent = 'Open this fixed worker check from its configured parent page.'
    closed = true
  } else {
    status.textContent = 'Waiting for the fixed worker check…'
    target.addEventListener('message', connect); target.addEventListener('pagehide', stop)
    if (options.initialConnection) connect(options.initialConnection)
  }
  return { dispose: stop }
}

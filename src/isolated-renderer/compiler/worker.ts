import { compileShader } from '@notrac/mage/compiler'
import { COMPILER_PROTOCOL, COMPILER_VERSION, isCompileRequest } from './protocol'

type CompilerScope = {
  postMessage: (message: unknown) => void
  close: () => void
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void, options: { once: boolean }) => void
}
const scope = globalThis as unknown as CompilerScope
// Capture these before executing submitted source. All worker messages remain untrusted
// at the receiving boundary even when they resemble messages from this bootstrap.
const send = scope.postMessage.bind(scope)
const close = scope.close.bind(scope)
const define = Object.defineProperty
const getPrototype = Object.getPrototypeOf
const hasOwn = Object.hasOwn

// Blob workers inherit the opaque renderer's CSP. Nested worker constructors are
// also removed before source evaluation: this is defense in depth, not a JS sandbox.
let restricted = true
try {
  for (const name of ['Worker', 'SharedWorker']) {
    let owner: object | null = globalThis
    while (owner) {
      if (hasOwn(owner, name)) define(owner, name, { value: undefined, writable: false, configurable: false })
      owner = getPrototype(owner) as object | null
    }
    define(globalThis, name, { value: undefined, writable: false, configurable: false })
  }
} catch { restricted = false }

scope.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isCompileRequest(event.data)) { close(); return }
  const { jobId, source, maxRaymarchIterations } = event.data
  const envelope = { protocol: COMPILER_PROTOCOL, version: COMPILER_VERSION, jobId }
  try {
    if (!restricted) throw new Error('Worker restrictions unavailable.')
    send({ ...envelope, type: 'started' })
    const artifact = compileShader(source, { maxRaymarchIterations })
    send({ ...envelope, type: 'compiled', artifact })
  } catch {
    // Do not send submitted source, stacks, arbitrary error objects or callbacks.
    send({ ...envelope, type: 'error' })
  } finally {
    // Close before queued timers run. The owner also calls terminate on every outcome.
    close()
  }
}, { once: true })

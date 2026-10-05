import { createIsolatedPlaybackHost } from '../src/modules/player/isolation/playbackHost'
import { isFixedRecoveryCheck, isFixedRecoveryMarker, type FixedRecoveryCheck, type FixedRecoveryMarker } from '../src/modules/player/isolation/fixedRecoveryProtocol'

export const FIXED_RECOVERY_SETUP = 'mage-local-recovery-setup'

/** Local harness adapter. The real host still sends/accepts only playback messages. */
export function createFixedRecoveryHost(options: Parameters<typeof createIsolatedPlaybackHost>[0] & {
  fixedRecoveryCheck?: FixedRecoveryCheck
  onFixedRecoveryMarker?: (marker: FixedRecoveryMarker) => void
}) {
  if (options.fixedRecoveryCheck !== undefined && !isFixedRecoveryCheck(options.fixedRecoveryCheck)) throw new Error('Invalid fixed recovery check.')
  if (!options.fixedRecoveryCheck) return createIsolatedPlaybackHost(options)
  const check = { ...options.fixedRecoveryCheck }
  const url = new URL(options.rendererUrl), parent = new URL(window.location.href)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !['localhost', '127.0.0.1'].includes(parent.hostname)
    || !['http:', 'https:'].includes(url.protocol) || url.protocol !== parent.protocol) throw new Error('Recovery diagnostics are local-only.')
  let port: MessagePort | null = null, closed = false
  let stopHost = () => {}
  const cleanup = () => {
    if (closed) return
    closed = true
    frame?.removeEventListener('load', arm, true)
    if (port) { port.onmessage = port.onmessageerror = null; port.close(); port = null }
  }
  const host = createIsolatedPlaybackHost({ ...options, onFailure(reason) { cleanup(); options.onFailure?.(reason) } })
  const frame = options.container.lastElementChild as HTMLIFrameElement | null
  stopHost = () => { cleanup(); host.dispose() }
  function arm() {
    if (closed || !frame?.contentWindow) return stopHost()
    frame.removeEventListener('load', arm, true)
    const channel = new MessageChannel()
    port = channel.port1
    let count = 0
    port.onmessage = event => {
      if (closed) return
      if (++count > 8 || !isFixedRecoveryMarker(event.data) || event.data.case !== check.case || event.data.nonce !== check.nonce) return stopHost()
      try { options.onFixedRecoveryMarker?.(event.data) } catch { /* Evidence observers cannot affect the real host. */ }
      port?.postMessage({ ack: count })
    }
    port.onmessageerror = stopHost; port.start()
    try { frame.contentWindow.postMessage({ type: FIXED_RECOVERY_SETUP, ...check }, '*', [channel.port2]) }
    catch { channel.port2.close(); stopHost() }
  }
  // Capture runs before the host's ordinary load listener. The narrow setup
  // port carries evidence only; readiness and progress still use the real host.
  frame?.addEventListener('load', arm, true)
  return { ...host, dispose: stopHost }
}

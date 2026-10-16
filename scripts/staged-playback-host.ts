import { createIsolatedPlaybackHost } from '../src/modules/player/isolation/playbackHost'
import { STAGED_SETUP, isStagedMarker, isStagedSetup, type StagedCase, type StagedMarker } from './staged-playback-fixture'

export function createStagedCheckHost(options: Parameters<typeof createIsolatedPlaybackHost>[0] & {
  case: StagedCase; marker(marker: StagedMarker): void
}) {
  const parent = new URL(window.location.href), renderer = new URL(options.rendererUrl)
  if (!import.meta.env.DEV || !['127.0.0.1', 'localhost'].includes(parent.hostname)
    || !['127.0.0.1', 'localhost'].includes(renderer.hostname)) throw new Error('Staged checks are local-only.')
  const setup = { type: STAGED_SETUP, case: options.case, nonce: crypto.randomUUID().replaceAll('-', '') }
  if (!isStagedSetup(setup)) throw new Error('Invalid staged check.')
  let evidence: MessagePort | null = null, closed = false
  const host = createIsolatedPlaybackHost({ ...options, stagedScenes: true, onFailure(reason) { cleanup(); options.onFailure?.(reason) } })
  const frame = options.container.lastElementChild as HTMLIFrameElement
  function cleanup() {
    if (closed) return
    closed = true; frame.removeEventListener('load', arm, true); evidence?.close(); evidence = null
  }
  function stop() { cleanup(); host.dispose() }
  function arm() {
    frame.removeEventListener('load', arm, true)
    if (closed || !frame.contentWindow) return stop()
    const channel = new MessageChannel(); evidence = channel.port1
    let count = 0
    evidence.onmessage = ({ data }) => {
      if (++count > 32 || !isStagedMarker(data) || data.case !== setup.case || data.nonce !== setup.nonce) return stop()
      try { options.marker(data) } catch { /* Evidence observers do not own playback. */ }
    }
    evidence.onmessageerror = stop; evidence.start()
    try { frame.contentWindow.postMessage(setup, '*', [channel.port2]) } catch { channel.port2.close(); stop() }
  }
  frame.addEventListener('load', arm, true)
  return { ...host, dispose: stop }
}

import { isRendererMessage, rendererMessage, RENDERER_COMMANDS } from '../modules/player/isolation/protocol'

export type SampleLoader = (canvas: HTMLCanvasElement, signal: AbortSignal, onError: () => void) => Promise<() => void>

export function installRendererRuntime(options: {
  canvas: HTMLCanvasElement
  statusElement: HTMLElement
  allowedParentOrigins: readonly string[]
  loadSample: SampleLoader
  targetWindow?: Window
}) {
  const target = options.targetWindow ?? window
  const abort = new AbortController()
  let port: MessagePort | null = null
  let session = ''
  let closed = false
  let loading = false
  let releaseSample: (() => void) | null = null
  let windowStart = 0
  let commands = 0

  const display = (text: string) => { options.statusElement.textContent = text; options.statusElement.hidden = false }
  function dispose() {
    if (closed) return
    closed = true
    abort.abort()
    target.removeEventListener('message', connect)
    target.removeEventListener('pagehide', dispose)
    port?.close()
    port = null
    try { releaseSample?.() } catch { /* The port and abort signal are already closed. */ }
    releaseSample = null
    display('Renderer stopped.')
  }
  function fail() {
    if (closed) return
    try { port?.postMessage(rendererMessage('error', session)) } catch { /* The parent may have already removed this frame. */ }
    dispose()
    display('This scene could not be displayed.')
  }
  async function renderSample() {
    if (loading) return fail()
    if (releaseSample) {
      port?.postMessage(rendererMessage('rendered', session))
      return
    }
    loading = true
    display('Loading scene…')
    try {
      const release = await options.loadSample(options.canvas, abort.signal, fail)
      if (closed) { try { release() } catch { /* Already disconnected. */ } return }
      releaseSample = release
      options.statusElement.hidden = true
      port?.postMessage(rendererMessage('rendered', session))
    } catch {
      fail()
    } finally {
      loading = false
    }
  }
  function onCommand(event: MessageEvent) {
    if (closed) return
    // A private port is a channel, not a reason to trust its payload.
    if (!isRendererMessage(event.data, RENDERER_COMMANDS)) return fail()
    if (event.data.session !== session) return
    const now = performance.now()
    if (now - windowStart >= 1000) { windowStart = now; commands = 0 }
    if (++commands > 8) return fail()
    if (event.data.type === 'dispose') {
      port?.postMessage(rendererMessage('disposed', session))
      dispose()
    } else {
      void renderSample()
    }
  }
  function connect(event: MessageEvent) {
    if (closed || port || target.parent === target) return
    if (event.source !== target.parent || !options.allowedParentOrigins.includes(event.origin)) return
    if (!isRendererMessage(event.data, ['connect']) || event.ports.length !== 1) return
    session = event.data.session
    port = event.ports[0]
    target.removeEventListener('message', connect)
    port.onmessage = onCommand
    port.onmessageerror = fail
    port.start()
    display('Ready for MAGE.')
    port.postMessage(rendererMessage('ready', session))
  }
  // Direct navigation never compiles or loads a scene, including URL source parameters.
  display(target.parent === target ? 'Open this player from MAGE.' : 'Waiting for MAGE…')
  target.addEventListener('message', connect)
  target.addEventListener('pagehide', dispose)
  return { dispose }
}

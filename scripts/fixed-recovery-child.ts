import { installPlaybackRuntime } from '../src/isolated-renderer/playbackRuntime'
import { loadPlaybackEngine, type PlaybackLoader } from '../src/isolated-renderer/playbackEngine'
import { playbackMessage } from '../src/modules/player/isolation/playbackProtocol'
import { FIXED_RECOVERY_PROTOCOL, fixedRecoveryScene, isFixedRecoveryConnection, type FixedRecoveryMarker } from '../src/modules/player/isolation/fixedRecoveryProtocol'

/** Trusted, bounded fault actions; submitted JavaScript never controls this fixture. */
export function installFixedRecoveryCheck(options: {
  canvas: HTMLCanvasElement; statusElement: HTMLElement; allowedParentOrigins: readonly string[]
  targetWindow?: Window; initialConnection: MessageEvent
}, loadScene: PlaybackLoader = loadPlaybackEngine) {
  const target = options.targetWindow ?? window, event = options.initialConnection, connection = event.data
  if (target === target.parent || event.source !== target.parent || !options.allowedParentOrigins.includes(event.origin)
    || event.ports.length !== 1 || !isFixedRecoveryConnection(connection)) return null
  const realPort = event.ports[0], origin = performance.now()
  let closed = false, armed = false, loaded = false, timer: ReturnType<typeof setTimeout> | null = null
  let runtime: ReturnType<typeof installPlaybackRuntime> | null = null
  let removeContextListener = () => {}
  const mark = (kind: FixedRecoveryMarker['event']) => {
    if (closed) return
    realPort.postMessage({ protocol: FIXED_RECOVERY_PROTOCOL, version: 1, type: 'marker', session: connection.session,
      case: connection.case, nonce: connection.nonce, event: kind, atMs: Math.min(120000, Math.max(0, performance.now() - origin)) } satisfies FixedRecoveryMarker)
  }
  function stop() {
    if (closed) return
    closed = true
    if (timer !== null) clearTimeout(timer)
    timer = null; removeContextListener()
    target.removeEventListener('pagehide', stop)
    realPort.onmessage = realPort.onmessageerror = null
    realPort.close(); runtime?.dispose()
  }
  function scheduleAction(message: ReturnType<typeof playbackMessage<'loaded'>>) {
    if (armed || closed || connection.case === 'missing-ready') return
    armed = true
    timer = setTimeout(() => {
      timer = null
      if (closed) return
      try {
        if (connection.case === 'context-loss') {
          const gl = options.canvas.getContext('webgl2') ?? options.canvas.getContext('webgl')
          const extension = gl?.getExtension('WEBGL_lose_context')
          if (!extension) { mark('unsupported'); return }
          mark('action'); extension.loseContext()
        } else {
          mark('action')
          if (connection.case === 'window-message') target.parent.postMessage(playbackMessage('error', message.session, message.generation, message.requestId, { code: 'render' }), '*')
          else if (connection.case === 'unknown-message') realPort.postMessage({ ...message, type: 'navigate', payload: null })
          else for (let count = 1; count <= 50; count++) realPort.postMessage(playbackMessage('progress', message.session, message.generation, 0, { frames: count + 100 }))
        }
      } catch { stop() }
    }, 150)
  }
  // Wrap this instance's private port, never MessagePort.prototype or window APIs.
  const port = {
    get onmessage() { return realPort.onmessage }, set onmessage(value) { realPort.onmessage = value },
    get onmessageerror() { return realPort.onmessageerror }, set onmessageerror(value) { realPort.onmessageerror = value },
    start: () => realPort.start(), close: stop,
    postMessage(data: unknown, transfer: Transferable[] = []) {
      if (closed) return
      const message = data as { type?: string }
      if (message.type === 'ready') { mark('connected'); if (connection.case === 'missing-ready') return }
      realPort.postMessage(data, transfer)
      if (message.type === 'loaded') scheduleAction(data as ReturnType<typeof playbackMessage<'loaded'>>)
    },
  } as MessagePort
  const fixedLoader: PlaybackLoader = async args => {
    if (loaded) throw new Error('Fixed check already loaded.')
    loaded = true
    // Register first so real context-loss observation precedes the engine's error
    // reply on the same ordered port. Calling loseContext alone is not evidence.
    const observed = () => mark('context-lost')
    if (connection.case === 'context-loss') {
      args.canvas.addEventListener('webglcontextlost', observed)
      removeContextListener = () => args.canvas.removeEventListener('webglcontextlost', observed)
    }
    return loadScene({ ...args, scene: fixedRecoveryScene(), profile: 'preview' })
  }
  target.addEventListener('pagehide', stop, { once: true })
  runtime = installPlaybackRuntime({ ...options, targetWindow: target, loadScene: fixedLoader,
    initialConnection: { source: event.source, origin: event.origin, ports: [port], data: playbackMessage('connect', connection.session, 0, 0, null) } as unknown as MessageEvent })
  return { dispose: stop }
}

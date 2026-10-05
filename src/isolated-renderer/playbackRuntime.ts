import { BRIDGE_LIMITS, isPlaybackMessage, messageRate, playbackMessage, PLAYBACK_COMMANDS,
  type PlaybackMessage, type PlaybackPayloads, type PlaybackType } from '../modules/player/isolation/playbackProtocol'
import type { PlaybackEngine, PlaybackLoader } from './playbackEngine'
import { ShaderCompilationError } from './compiler/errors'

export function installPlaybackRuntime(options: {
  canvas: HTMLCanvasElement; statusElement: HTMLElement; allowedParentOrigins: readonly string[]
  loadScene: PlaybackLoader; targetWindow?: Window; initialConnection?: MessageEvent
}) {
  const target = options.targetWindow ?? window
  let activeCanvas = options.canvas
  let port: MessagePort | null = null
  let session = '', generation = 0, lastRequest = 0, frames = 0, lastProgress = -Infinity
  let closed = false, loadAbort: AbortController | null = null, engine: PlaybackEngine | null = null
  let pendingCapture: { cancel: () => void } | null = null
  let pendingResize: PlaybackPayloads['resize'] | null = null
  let pendingInput: PlaybackPayloads['input'] | null = null
  let pendingSynthetic: PlaybackPayloads['synthetic'] | null = null
  let pendingAudioResponse: PlaybackPayloads['audio-response'] | null = null
  let pendingSceneSettings: PlaybackPayloads['scene-settings'] | null = null
  let playing = true
  let zoom = 1
  const withinRate = messageRate(BRIDGE_LIMITS.messagesPerSecond)
  const withinLoadRate = messageRate(4), withinCaptureRate = messageRate(2)
  const display = (text: string) => { options.statusElement.textContent = text; options.statusElement.hidden = false }
  function retireCapture() {
    pendingCapture?.cancel()
    pendingCapture = null
  }
  function send<T extends PlaybackType>(type: T, request: number, payload: PlaybackPayloads[T], transfer: Transferable[] = []) {
    if (!closed) port?.postMessage(playbackMessage(type, session, generation, request, payload), transfer)
  }
  function dispose() {
    if (closed) return
    closed = true
    retireCapture()
    target.removeEventListener('message', connect)
    target.removeEventListener('pagehide', dispose)
    loadAbort?.abort(); loadAbort = null
    try { engine?.dispose() } catch { /* Continue closing the private channel. */ }
    engine = null; pendingInput = pendingResize = pendingSynthetic = pendingAudioResponse = pendingSceneSettings = null
    port?.close(); port = null
    display('Renderer stopped.')
  }
  function fail(code: 'render' | 'protocol' | 'compile', request = lastRequest) {
    if (closed) return
    try { send('error', request, { code }) } catch { /* Parent may already have removed the frame. */ }
    dispose()
    display('This scene could not be displayed.')
  }
  async function load(message: PlaybackMessage<'load'>) {
    loadAbort?.abort()
    retireCapture()
    try { engine?.dispose() } catch { /* Abort already retired the previous generation. */ }
    engine = null
    // Disposing a WebGL renderer can dispatch contextlost asynchronously. A new
    // generation must own a new canvas so that notification cannot stop it.
    if (generation !== 0) {
      const replacement = activeCanvas.cloneNode(false) as HTMLCanvasElement
      activeCanvas.replaceWith(replacement)
      activeCanvas = replacement
    }
    generation = message.generation
    pendingInput = pendingResize = pendingSynthetic = pendingAudioResponse = pendingSceneSettings = null
    playing = true; zoom = 1; frames = 0; lastProgress = -Infinity
    const abort = new AbortController()
    loadAbort = abort
    const active = () => !closed && loadAbort === abort && !abort.signal.aborted
    display('Loading scene…')
    try {
      const loadedEngine = await options.loadScene({ canvas: activeCanvas, ...message.payload, signal: abort.signal,
        sceneRevision: message.generation,
        onError: () => { if (active()) fail('render', message.requestId) },
        onFrame: () => {
          if (!active()) return
          frames++
          const now = performance.now()
          if (now - lastProgress >= 500) { lastProgress = now; send('progress', 0, { frames }) }
        },
      })
      if (!active()) { loadedEngine.dispose(); return }
      engine = loadedEngine
      if (pendingResize) engine.resize(pendingResize)
      if (pendingInput) engine.input(pendingInput)
      if (pendingSynthetic) engine.synthetic(pendingSynthetic)
      if (pendingAudioResponse) engine.audioResponse(pendingAudioResponse)
      if (pendingSceneSettings) engine.sceneSettings(pendingSceneSettings)
      engine.zoom(zoom)
      engine.playback(playing)
      options.statusElement.hidden = true
      send('loaded', message.requestId, null)
    } catch (error) {
      if (active()) fail(error instanceof ShaderCompilationError ? 'compile' : 'render', message.requestId)
    }
  }
  async function capture(message: PlaybackMessage<'capture'>) {
    const source = engine, token = loadAbort
    if (!source || pendingCapture) { send('error', message.requestId, { code: 'capture' }); return }
    const pending = { cancel: () => clearTimeout(timeout) }
    pendingCapture = pending
    const active = () => !closed && pendingCapture === pending && engine === source && loadAbort === token && !token?.signal.aborted
    const timeout = setTimeout(() => { if (active()) fail('render', message.requestId) }, BRIDGE_LIMITS.captureTimeoutMs)
    try {
      const result = await source.capture(message.payload)
      if (active()) send('captured', message.requestId, result, [result.bytes])
    } catch { if (active()) send('error', message.requestId, { code: 'capture' }) }
    finally { pending.cancel(); if (pendingCapture === pending) pendingCapture = null }
  }
  function onCommand(event: MessageEvent) {
    if (closed) return
    if (!withinRate()) return fail('protocol')
    if (!isPlaybackMessage(event.data, PLAYBACK_COMMANDS)) return fail('protocol')
    const message = event.data
    if (message.session !== session || message.requestId <= lastRequest) return
    if (message.type === 'load') {
      if (message.generation <= generation) return
      if (!withinLoadRate()) return fail('protocol', message.requestId)
      lastRequest = message.requestId
      void load(message)
      return
    }
    if (message.generation !== generation) return
    lastRequest = message.requestId
    try {
      switch (message.type) {
        case 'dispose': dispose(); break
        case 'resize': pendingResize = message.payload; engine?.resize(message.payload); break
        case 'input': pendingInput = message.payload; engine?.input(message.payload); break
        case 'synthetic': pendingSynthetic = message.payload; engine?.synthetic(message.payload); break
        case 'audio-response': pendingAudioResponse = message.payload; engine?.audioResponse(message.payload); break
        case 'scene-settings': pendingSceneSettings = message.payload; engine?.sceneSettings(message.payload); break
        case 'capabilities': if (engine) send('capabilities-result', message.requestId, engine.capabilities()); break
        case 'playback': playing = message.payload.playing; engine?.playback(playing); break
        case 'zoom': zoom = message.payload.factor; engine?.zoom(zoom); break
        case 'capture':
          if (!withinCaptureRate()) return fail('protocol', message.requestId)
          void capture(message); break
      }
    } catch { fail('render', message.requestId) }
  }
  function connect(event: MessageEvent) {
    if (closed || port || target.parent === target || event.source !== target.parent
      || !options.allowedParentOrigins.includes(event.origin) || event.ports.length !== 1
      || !isPlaybackMessage(event.data, ['connect'])) return
    session = event.data.session; port = event.ports[0]
    target.removeEventListener('message', connect)
    port.onmessage = onCommand; port.onmessageerror = () => fail('protocol'); port.start()
    display('Ready for MAGE.')
    send('ready', 0, null)
  }
  display(target.parent === target ? 'Open this player from MAGE.' : 'Waiting for MAGE…')
  target.addEventListener('message', connect)
  target.addEventListener('pagehide', dispose)
  if (options.initialConnection) connect(options.initialConnection)
  return { dispose }
}

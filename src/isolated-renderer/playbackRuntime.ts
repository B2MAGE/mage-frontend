import { BRIDGE_LIMITS, isPlaybackMessage, messageRate, playbackMessage, PLAYBACK_COMMANDS,
  type PlaybackMessage, type PlaybackPayloads, type PlaybackType } from '../modules/player/isolation/playbackProtocol'
import type { PlaybackEngine, PlaybackLoader } from './playbackEngine'
import { PlaybackDownloadError } from './playbackEngine'
import { ShaderCompilationError } from './compiler/errors'

export function installPlaybackRuntime(options: {
  canvas: HTMLCanvasElement; statusElement: HTMLElement; allowedParentOrigins: readonly string[]
  loadScene: PlaybackLoader; targetWindow?: Window; initialConnection?: MessageEvent
}) {
  const target = options.targetWindow ?? window
  const visibilityDocument = options.canvas.ownerDocument
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
  let reportStartupPhases = false
  let zoom = 1
  const withinRate = messageRate(BRIDGE_LIMITS.messagesPerSecond)
  const withinLoadRate = messageRate(4), withinCaptureRate = messageRate(2)
  const withinInspectorRate = messageRate(5)
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
  function fail(code: PlaybackPayloads['error']['code'], request = lastRequest) {
    if (closed) return
    // Existing v2 parents reject every newly introduced response/error code.
    // Keep their exact vocabulary until the connecting parent opts in.
    if (!reportStartupPhases) {
      if (['compiler-download', 'compiler-startup', 'compile-timeout', 'invalid-output', 'interrupted'].includes(code)) code = 'compile'
      else if (code !== 'compile' && code !== 'capture' && code !== 'protocol') code = 'render'
    }
    try { send('error', request, { code }) } catch { /* Parent may already have removed the frame. */ }
    dispose()
    display('This scene could not be displayed.')
  }
  function waitForVisible(signal: AbortSignal) {
    if (signal.aborted) return Promise.reject(new DOMException('Load cancelled.', 'AbortError'))
    if (visibilityDocument.visibilityState !== 'hidden') return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => { visibilityDocument.removeEventListener('visibilitychange', check); signal.removeEventListener('abort', cancel) }
      const cancel = () => { cleanup(); reject(new DOMException('Load cancelled.', 'AbortError')) }
      const check = () => { if (visibilityDocument.visibilityState !== 'hidden') { cleanup(); resolve() } }
      visibilityDocument.addEventListener('visibilitychange', check)
      signal.addEventListener('abort', cancel, { once: true })
    })
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
    let currentPhase: PlaybackPayloads['load-phase']['phase'] | null = null
    display('Loading scene…')
    try {
      let attempt: 0 | 1 = 0
      const phase = (value: PlaybackPayloads['load-phase']['phase']) => {
        currentPhase = value
        if (active() && reportStartupPhases) send('load-phase', message.requestId, { phase: value, attempt })
      }
      if (visibilityDocument.visibilityState === 'hidden') { phase('waiting-visible'); await waitForVisible(abort.signal) }
      abort.signal.throwIfAborted()
      const prepare = () => options.loadScene({ canvas: activeCanvas, ...message.payload, signal: abort.signal,
        sceneRevision: message.generation,
        onPhase: phase,
        onError: reason => { if (active()) fail(reason ?? (engine ? 'render' : 'graphics-startup'), message.requestId) },
        onFrame: () => {
          if (!active()) return
          frames++
          const now = performance.now()
          if (now - lastProgress >= 500) { lastProgress = now; send('progress', 0, { frames }) }
        },
      })
      let loadedEngine: PlaybackEngine
      try { loadedEngine = await prepare() } catch (error) {
        if (!active() || !(error instanceof ShaderCompilationError) || error.code !== 'interrupted') throw error
        // Exactly one restart belongs to this still-pending load. Stop, scene
        // replacement and pagehide abort the wait; transport state is retained.
        attempt = 1; phase('waiting-visible')
        await waitForVisible(abort.signal)
        abort.signal.throwIfAborted()
        loadedEngine = await prepare()
      }
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
      if (active()) fail(error instanceof PlaybackDownloadError ? error.code
        : error instanceof ShaderCompilationError ? error.code === 'timeout' ? 'compile-timeout'
          : error.code === 'startup' ? 'compiler-startup' : error.code === 'invalid-output' ? 'invalid-output'
            : error.code === 'interrupted' ? 'interrupted' : 'compile'
          : currentPhase === 'graphics-startup' ? 'graphics-startup' : 'render', message.requestId)
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
        case 'audio-inspector': {
          // Optional observations neither advance the engine nor affect its
          // failure/recovery path. Older parents never request this response.
          if (!withinInspectorRate()) break
          let snapshot: PlaybackPayloads['audio-inspector-result'] = null
          try { snapshot = engine?.audioInspector?.() ?? null } catch { /* An unavailable reading is not a playback failure. */ }
          send('audio-inspector-result', message.requestId, snapshot)
          break
        }
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
    reportStartupPhases = event.data.type === 'connect' && event.data.payload?.startupPhases === true
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

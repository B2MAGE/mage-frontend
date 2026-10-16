import { BRIDGE_LIMITS, isPlaybackMessage, messageRate, playbackMessage, PLAYBACK_COMMANDS,
  type PlaybackMessage, type PlaybackPayloads, type PlaybackType } from '../modules/player/isolation/playbackProtocol'
import type { PlaybackEngine, PlaybackLoader } from './playbackEngine'
import { PlaybackDownloadError } from './playbackEngine'
import { ShaderCompilationError } from './compiler/errors'
import { isShaderWorkloadFailure, shaderWorkloadFailure } from '../modules/player/policy/shaderWorkloadFailure'
import { createStagedSceneLifecycle } from './stagedSceneLifecycle'

export function installPlaybackRuntime(options: {
  canvas: HTMLCanvasElement; statusElement: HTMLElement; allowedParentOrigins: readonly string[]
  loadScene: PlaybackLoader; targetWindow?: Window; initialConnection?: MessageEvent
}) {
  const target = options.targetWindow ?? window
  const visibilityDocument = options.canvas.ownerDocument
  let activeCanvas = options.canvas
  let port: MessagePort | null = null
  let session = '', generation = 0, lastRequest = 0, frames = 0, lastProgress = -Infinity
  let closed = false, loading = false, loadAbort: AbortController | null = null, engine: PlaybackEngine | null = null
  let pendingCapture: { cancel: () => void } | null = null
  let pendingResize: PlaybackPayloads['resize'] | null = null
  let pendingInput: PlaybackPayloads['input'] | null = null
  let pendingSynthetic: PlaybackPayloads['synthetic'] | null = null
  let pendingAudioResponse: PlaybackPayloads['audio-response'] | null = null
  let pendingSceneSettings: PlaybackPayloads['scene-settings'] | null = null
  let playing = true
  let reportStartupPhases = false
  let reportWorkloadErrors = false
  let staged: ReturnType<typeof createStagedSceneLifecycle> | null = null
  let zoom = 1
  const withinRate = messageRate(BRIDGE_LIMITS.messagesPerSecond)
  const withinLoadRate = messageRate(4), withinCaptureRate = messageRate(2)
  const withinInspectorRate = messageRate(5)
  const withinGraphicsRate = messageRate(2)
  const display = (text: string) => { options.statusElement.textContent = text; options.statusElement.hidden = false }
  function retireCapture() {
    pendingCapture?.cancel()
    pendingCapture = null
  }
  const currentEngine = () => staged?.engine ?? engine
  const activeGeneration = () => staged?.activeGeneration ?? generation
  function send<T extends PlaybackType>(type: T, request: number, payload: PlaybackPayloads[T], transfer: Transferable[] = [], responseGeneration = generation) {
    if (!closed) port?.postMessage(playbackMessage(type, session, responseGeneration, request, payload), transfer)
  }
  function dispose() {
    if (closed) return
    closed = true
    retireCapture()
    target.removeEventListener('message', connect)
    target.removeEventListener('pagehide', dispose)
    loadAbort?.abort(); loadAbort = null
    try { staged?.dispose() } catch { /* Continue closing the private channel. */ }
    try { engine?.dispose() } catch { /* Continue closing the private channel. */ }
    engine = null; pendingInput = pendingResize = pendingSynthetic = pendingAudioResponse = pendingSceneSettings = null
    port?.close(); port = null
    display('Renderer stopped.')
  }
  function fail(code: PlaybackPayloads['error']['code'], request = lastRequest) {
    if (closed) return
    if (!reportWorkloadErrors && isShaderWorkloadFailure(code)) code = 'compile'
    // Existing v2 parents reject every newly introduced response/error code.
    // Keep their exact vocabulary until the connecting parent opts in.
    if (!reportStartupPhases) {
      if (['compiler-download', 'compiler-startup', 'compile-timeout', 'invalid-output', 'interrupted'].includes(code)) code = 'compile'
      else if (code !== 'compile' && code !== 'capture' && code !== 'protocol') code = 'render'
    }
    try { send('error', request, { code }, [], activeGeneration() || generation) } catch { /* Parent may already have removed the frame. */ }
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
    loading = true
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
      loading = false
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
      if (active()) fail(shaderWorkloadFailure(error) ?? (error instanceof PlaybackDownloadError ? error.code
        : error instanceof ShaderCompilationError ? error.code === 'timeout' ? 'compile-timeout'
          : error.code === 'startup' ? 'compiler-startup' : error.code === 'invalid-output' ? 'invalid-output'
            : error.code === 'interrupted' ? 'interrupted' : isShaderWorkloadFailure(error.code) ? error.code : 'compile'
          : currentPhase === 'graphics-startup' ? 'graphics-startup' : 'render'), message.requestId)
    }
  }
  async function capture(message: PlaybackMessage<'capture'>) {
    const source = currentEngine(), capturedGeneration = activeGeneration(), token = loadAbort
    if (!source || pendingCapture) { send('error', message.requestId, { code: 'capture' }, [], message.generation); return }
    let expired = false
    const pending = { cancel: () => clearTimeout(timeout) }
    pendingCapture = pending
    const active = () => !expired && !closed && pendingCapture === pending && currentEngine() === source
      && activeGeneration() === capturedGeneration && (staged !== null || loadAbort === token && !token?.signal.aborted)
    const timeout = setTimeout(() => {
      if (!active()) return
      send('error', message.requestId, { code: 'capture' }, [], message.generation)
      expired = true
    }, BRIDGE_LIMITS.captureTimeoutMs)
    try {
      const result = await source.capture(message.payload)
      if (active()) send('captured', message.requestId, result, [result.bytes], message.generation)
    } catch { if (active()) send('error', message.requestId, { code: 'capture' }, [], message.generation) }
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
      if (staged) {
        generation = message.generation
        if (!staged.activeGeneration) display('Loading scene…')
        void staged.prepare(message.generation, message.requestId, message.payload)
      } else void load(message)
      return
    }
    const candidateCommand = message.type === 'activate' || message.type === 'cancel-load'
    if (message.type !== 'dispose' && message.generation !== (staged && !candidateCommand ? activeGeneration() || generation : generation)) return
    lastRequest = message.requestId
    const activeEngine = currentEngine()
    try {
      switch (message.type) {
        case 'dispose': dispose(); break
        case 'activate': if (!staged || !staged.activate(message.generation)) fail('protocol', message.requestId); break
        case 'cancel-load':
          if (staged) staged.cancel(message.generation)
          else if (loading) { loading = false; loadAbort?.abort(); loadAbort = null; retireCapture() }
          break
        case 'resize': pendingResize = message.payload; activeEngine?.resize(message.payload); break
        case 'input': pendingInput = message.payload; activeEngine?.input(message.payload); break
        case 'synthetic': pendingSynthetic = message.payload; activeEngine?.synthetic(message.payload); break
        case 'audio-response': pendingAudioResponse = message.payload; activeEngine?.audioResponse(message.payload); break
        case 'scene-settings': pendingSceneSettings = message.payload; activeEngine?.sceneSettings(message.payload); break
        case 'capabilities': {
          // Metadata is optional. Missing support information must never retire
          // a renderer that is still producing healthy frames.
          let supported: PlaybackPayloads['capabilities-result'] = { supportedTargets: [] }
          try { supported = activeEngine?.capabilities() ?? supported } catch { /* Unavailable metadata. */ }
          send('capabilities-result', message.requestId, supported, [], message.generation)
          break
        }
        case 'audio-inspector': {
          // Optional observations neither advance the engine nor affect its
          // failure/recovery path. Older parents never request this response.
          if (!withinInspectorRate()) break
          let snapshot: PlaybackPayloads['audio-inspector-result'] = null
          try { snapshot = activeEngine?.audioInspector?.() ?? null } catch { /* An unavailable reading is not a playback failure. */ }
          send('audio-inspector-result', message.requestId, snapshot, [], message.generation)
          break
        }
        case 'graphics-diagnostics': {
          if (!withinGraphicsRate()) break
          let snapshot: PlaybackPayloads['graphics-diagnostics-result'] = null
          try {
            const measured = activeEngine?.graphicsDiagnostics?.() ?? null
            if (isPlaybackMessage(playbackMessage('graphics-diagnostics-result', session, generation, message.requestId, measured),
              ['graphics-diagnostics-result'])) snapshot = measured
          } catch { /* Optional measurement never changes graphics or playback state. */ }
          send('graphics-diagnostics-result', message.requestId, snapshot, [], message.generation)
          break
        }
        case 'playback': playing = message.payload.playing; activeEngine?.playback(playing); break
        case 'zoom': zoom = message.payload.factor; activeEngine?.zoom(zoom); break
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
    reportWorkloadErrors = event.data.type === 'connect' && event.data.payload?.workloadErrors === true
    session = event.data.session; port = event.ports[0]
    if (event.data.type === 'connect' && event.data.payload?.stagedScenes === true) {
      staged = createStagedSceneLifecycle({ canvas: activeCanvas, loadScene: options.loadScene,
        phase: (generation, request, phase, attempt) => { if (reportStartupPhases) send('load-phase', request, { phase, attempt }, [], generation) },
        prepared: (generation, request) => send('prepared', request, null, [], generation),
        activated: (generation, request, engine) => {
          retireCapture()
          if (pendingResize) engine.resize(pendingResize)
          if (pendingSynthetic) engine.synthetic(pendingSynthetic)
          if (pendingInput) engine.input(pendingInput)
          engine.playback(playing)
          pendingAudioResponse = pendingSceneSettings = null
          options.statusElement.hidden = true
          send('loaded', request, null, [], generation)
        },
        failed: (generation, request, failure) => {
          options.statusElement.hidden = failure.retained
          if (!failure.retained) display('This scene could not be prepared.')
          send('candidate-error', request, failure, [], generation)
        },
        sessionError: reason => fail(reason),
        progress: generation => {
          frames++
          const now = performance.now()
          if (now - lastProgress >= 500) { lastProgress = now; send('progress', 0, { frames }, [], generation) }
        },
      })
    }
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

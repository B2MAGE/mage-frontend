import { DENIED_FEATURES, validateRendererUrl } from './rendererHost'
import { BRIDGE_LIMITS, isPlaybackMessage, messageRate, playbackMessage, PLAYBACK_RESPONSES, record, sceneForBridge, STARTUP_PHASES,
  type CaptureRequest, type PlaybackPayloads, type PlaybackType, type StartupPhase } from './playbackProtocol'
import { validateRasterCapture } from './capture'
import { boundCaptureSize, type RenderProfile } from '../policy/renderBudget'
import type { RenderFailure } from '../recovery/sceneRecovery'
import { validateLiveSceneSettings, type SceneLiveSettings } from '../liveSceneSettings'
import { COMPILER_LIMITS } from '../../../isolated-renderer/compiler/protocol'
import { SceneReplacementError, type SceneActivation } from './sceneReplacement'

type Pending<T> = { resolve: (value: T) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> | undefined; id: number; generation: number }
type Operation = 'load' | 'capture' | 'capabilities' | 'audio-inspector' | 'graphics-diagnostics'
type PendingLoad = Pending<void> & { activation?: SceneActivation; activationSent: boolean; completion: Promise<void>; finishCommit(): void }
type OperationPhase = 'requested' | StartupPhase | 'prepared' | 'activating' | 'decoding' | 'completed' | 'failed' | 'cancelled'
type OperationReason = 'timeout' | 'unavailable' | 'invalid-result' | 'scene-changed' | 'disposed' | 'rate-limited'
export type PlaybackHostStatus = 'starting' | 'ready' | 'loading' | 'playing' | 'paused' | 'error' | 'disposed'
export type PlaybackHostDiagnostic =
  | { type: 'status'; at: number; status: PlaybackHostStatus }
  | { type: 'progress'; at: number }
  | { type: 'watchdog'; at: number; deltaMs: number; silenceMs: number; progressAgeMs: number
    resetReason: 'closed' | 'not-loaded' | 'paused' | 'hidden' | 'offscreen' | 'invalid-clock' | 'parent-gap' | 'recent-progress' | 'none' }
  | { type: 'operation'; at: number; operation: Operation; requestId: number; generation: number; phase: OperationPhase; reason?: OperationReason }
  | { type: 'failure'; at: number; reason: RenderFailure; generation: number; requestId: number | null; phase: StartupPhase | null
    pendingCapture: boolean; pendingCapabilities: boolean; pendingInspector: boolean }
export function createIsolatedPlaybackHost(options: {
  container: HTMLElement; rendererUrl: string; onStatus?: (status: PlaybackHostStatus) => void
  onFailure?: (reason: RenderFailure) => void; startupTimeoutMs?: number; progressTimeoutMs?: number
  downloadTimeoutMs?: number
  onDiagnostic?: (diagnostic: PlaybackHostDiagnostic) => void
  decodeCapture?: typeof createImageBitmap
  useInlineFrameStyles?: boolean
  stagedScenes?: boolean
}) {
  const url = validateRendererUrl(options.rendererUrl)
  const startupMs = options.startupTimeoutMs ?? 15000, progressMs = options.progressTimeoutMs ?? 10000
  const downloadMs = options.downloadTimeoutMs ?? 60000
  if (![startupMs, progressMs].every(v => Number.isFinite(v) && v >= 10 && v <= 30000)) throw new Error('Invalid renderer timeout.')
  if (!Number.isFinite(downloadMs) || downloadMs < 10 || downloadMs > 120000) throw new Error('Invalid download timeout.')
  const frame = document.createElement('iframe')
  frame.title = 'Isolated scene player'
  frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('referrerpolicy', 'no-referrer')
  frame.setAttribute('credentialless', ''); frame.setAttribute('allow', DENIED_FEATURES)
  if (options.useInlineFrameStyles !== false) frame.style.cssText = 'display:block;width:100%;height:100%;border:0;pointer-events:none;background:#090b10'
  let closed = false, connected = false, available = false, loaded = false, playing = true
  let port: MessagePort | null = null
  const session = crypto.randomUUID()
  let generation = 0, activeGeneration = 0, sequence = 0, lastFrame = -1, lastProgress = performance.now()
  let previousObservation = performance.now(), observedSilence = 0
  let previousStartupObservation = performance.now()
  let pendingLoad: PendingLoad | null = null
  let requestedLoadGeneration: number | null = null
  let activeRequestId: number | null = null
  let pendingLoadPhase: StartupPhase | null = null, startupObserved = 0, onscreen = true
  let loadPhaseStep = -1, loadAttempt = 0
  let pendingCapabilities: Pending<PlaybackPayloads['capabilities-result']> | null = null
  let pendingInspector: Pending<PlaybackPayloads['audio-inspector-result']> | null = null
  let pendingGraphics: Pending<PlaybackPayloads['graphics-diagnostics-result']> | null = null
  let queuedAudioResponse: PlaybackPayloads['audio-response'] | null = null
  let queuedSceneSettings: SceneLiveSettings | null = null
  let lastAudioResponseKey: string | null = null, lastSceneSettingsKey: string | null = null
  let pendingCapture: (Pending<Blob> & { request: CaptureRequest; decoding: boolean }) | null = null
  let decoderBusy = false
  let queuedInput: PlaybackPayloads['input'] | null = null
  let queuedResize: PlaybackPayloads['resize'] | null = null
  let lastResize: PlaybackPayloads['resize'] | null = null
  let queuedZoom: number | null = null, zoom = 1
  let synthetic: PlaybackPayloads['synthetic'] = { enabled: false, seed: 1, tempoScale: 1 }
  const outputAllowed = messageRate(BRIDGE_LIMITS.responsesPerSecond)
  const commandAllowed = messageRate(BRIDGE_LIMITS.messagesPerSecond)
  const loadAllowed = messageRate(4), captureAllowed = messageRate(2)
  const inspectorAllowed = messageRate(5)
  const graphicsAllowed = messageRate(2)
  let resolveReady!: () => void, rejectReady!: (reason: Error) => void
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  // Readiness can fail before a consumer begins waiting; callers still receive the rejection.
  void ready.catch(() => {})
  const diagnose = (diagnostic: PlaybackHostDiagnostic) => {
    try { options.onDiagnostic?.(diagnostic) } catch { /* Diagnostics cannot interrupt rendering or cleanup. */ }
  }
  const operation = (name: Operation, pending: Pick<Pending<unknown>, 'id' | 'generation'>, phase: OperationPhase, reason?: OperationReason) => {
    if (options.onDiagnostic) diagnose({ type: 'operation', at: performance.now(), operation: name,
      requestId: pending.id, generation: pending.generation, phase, ...(reason ? { reason } : {}) })
  }
  const report = (status: PlaybackHostStatus) => {
    try { options.onStatus?.(status) } catch { /* Observers cannot block cleanup. */ }
    if (options.onDiagnostic) diagnose({ type: 'status', at: performance.now(), status })
  }
  function rejectAuxiliary(reason: string, diagnosticReason: 'scene-changed' | 'disposed') {
    if (pendingCapture) operation('capture', pendingCapture, 'cancelled', diagnosticReason)
    if (pendingCapabilities) operation('capabilities', pendingCapabilities, 'cancelled', diagnosticReason)
    for (const pending of [pendingCapture, pendingCapabilities]) if (pending) {
      clearTimeout(pending.timer); pending.reject(new Error(reason))
    }
    pendingCapture = null; pendingCapabilities = null
    if (pendingInspector) {
      operation('audio-inspector', pendingInspector, 'cancelled', diagnosticReason)
      clearTimeout(pendingInspector.timer); pendingInspector.resolve(null); pendingInspector = null
    }
    if (pendingGraphics) {
      operation('graphics-diagnostics', pendingGraphics, 'cancelled', diagnosticReason)
      clearTimeout(pendingGraphics.timer); pendingGraphics.resolve(null); pendingGraphics = null
    }
  }
  function rejectWork(reason: string, diagnosticReason: 'scene-changed' | 'disposed') {
    if (pendingLoad) {
      operation('load', pendingLoad, 'cancelled', diagnosticReason)
      const pending = pendingLoad
      finishLoad(pending); pending.reject(new Error(reason))
    }
    requestedLoadGeneration = null
    rejectAuxiliary(reason, diagnosticReason)
  }
  function finishLoad(pending: PendingLoad) {
    clearTimeout(pending.timer)
    if (pendingLoad === pending) {
      pendingLoad = null; pendingLoadPhase = null; loadPhaseStep = -1; loadAttempt = 0
    }
    if (requestedLoadGeneration === pending.generation) requestedLoadGeneration = null
    pending.finishCommit()
  }
  function rejectCandidate(reason: RenderFailure, notifyChild = true) {
    const pending = pendingLoad
    if (!pending) return
    if (!options.stagedScenes) { dispose(reason); return }
    if (notifyChild) {
      if (pending.activationSent) { dispose(reason); return }
      try { send('cancel-load', null, false, pending.generation) } catch { return }
    }
    operation('load', pending, 'failed', reason.endsWith('timeout') ? 'timeout' : 'unavailable')
    finishLoad(pending); pending.reject(new SceneReplacementError(reason, loaded))
    report(loaded ? playing ? 'playing' : 'paused' : 'ready')
  }
  function dispose(failure?: RenderFailure) {
    if (closed) return
    // Snapshot the failed generation before rejecting/clearing its operations.
    const failureContext = { generation, requestId: pendingLoad?.id ?? activeRequestId, phase: pendingLoadPhase,
      pendingCapture: pendingCapture !== null, pendingCapabilities: pendingCapabilities !== null, pendingInspector: pendingInspector !== null }
    closed = true
    clearTimeout(startupTimer); clearInterval(inputTimer); clearInterval(progressTimer)
    frame.removeEventListener('load', connect); frame.removeEventListener('error', onFrameError)
    document.removeEventListener('visibilitychange', resetObservation)
    intersection?.disconnect()
    window.removeEventListener('pagehide', onPageHide)
    try { port?.postMessage(playbackMessage('dispose', session, generation, ++sequence, null)) } catch { /* Removed frame is final boundary. */ }
    if (port) { port.onmessage = null; port.onmessageerror = null; port.close(); port = null }
    frame.remove(); queuedInput = null; queuedResize = null; queuedZoom = null; queuedAudioResponse = null; queuedSceneSettings = null
    rejectReady(new Error('Isolated player stopped.')); rejectWork('Isolated player stopped.', 'disposed')
    report(failure ? 'error' : 'disposed')
    if (failure) {
      try { options.onFailure?.(failure) } catch { /* Already stopped. */ }
      if (options.onDiagnostic) diagnose({ type: 'failure', at: performance.now(), reason: failure, ...failureContext })
    }
  }
  function onFrameError() { dispose(available ? 'runtime' : 'graphics-download') }
  function onPageHide() { dispose() }
  function resetObservation() {
    previousObservation = performance.now(); observedSilence = 0; lastProgress = previousObservation
    startupObserved = 0
    previousStartupObservation = previousObservation
  }
  function send<T extends PlaybackType>(type: T, payload: PlaybackPayloads[T], optional = false,
    commandGeneration = options.stagedScenes && loaded ? activeGeneration : generation) {
    if (closed || !available || !port) throw new Error('Isolated player is unavailable.')
    const message = playbackMessage(type, session, commandGeneration, ++sequence, payload)
    if (!isPlaybackMessage(message, [type])) throw new Error('Invalid player input.')
    if (!commandAllowed(performance.now(), optional ? 10 : 0)) {
      if (optional) return null
      dispose('runtime'); throw new Error('Too many player commands.')
    }
    try { port.postMessage(message) } catch { dispose('runtime'); throw new Error('Player connection failed.') }
    return message.requestId
  }
  function receive(event: MessageEvent<unknown>) {
    if (closed) return
    if (!outputAllowed()) return dispose('runtime')
    const candidate = event.data
    if (record(candidate, ['protocol', 'version', 'session', 'generation', 'requestId', 'type', 'payload'])
      && candidate.type === 'graphics-diagnostics-result'
      && isPlaybackMessage({ ...candidate, payload: null }, PLAYBACK_RESPONSES)) {
      if (candidate.session !== session || !pendingGraphics || candidate.generation !== pendingGraphics.generation
        || pendingGraphics.id !== candidate.requestId) return
      const valid = isPlaybackMessage(candidate, PLAYBACK_RESPONSES) && candidate.type === 'graphics-diagnostics-result'
      const snapshot = valid ? candidate.payload : null
      operation('graphics-diagnostics', pendingGraphics, snapshot === null ? 'failed' : 'completed',
        snapshot === null ? valid ? 'unavailable' : 'invalid-result' : undefined)
      clearTimeout(pendingGraphics.timer); pendingGraphics.resolve(snapshot); pendingGraphics = null
      return
    }
    // A malformed optional reading cannot stop usable playback. Authenticate
    // its fixed envelope first; arbitrary data/getters never enter the UI.
    if (record(candidate, ['protocol', 'version', 'session', 'generation', 'requestId', 'type', 'payload'])
      && candidate.type === 'audio-inspector-result'
      && isPlaybackMessage({ ...candidate, payload: null }, PLAYBACK_RESPONSES)) {
      if (candidate.session !== session || !pendingInspector || candidate.generation !== pendingInspector.generation
        || pendingInspector.id !== candidate.requestId) return
      const snapshot = isPlaybackMessage(candidate, PLAYBACK_RESPONSES) && candidate.type === 'audio-inspector-result'
        ? candidate.payload : null
      operation('audio-inspector', pendingInspector, snapshot === null ? 'failed' : 'completed', snapshot === null ? 'unavailable' : undefined)
      clearTimeout(pendingInspector.timer); pendingInspector.resolve(snapshot); pendingInspector = null
      return
    }
    if (record(candidate, ['protocol', 'version', 'session', 'generation', 'requestId', 'type', 'payload'])
      && candidate.type === 'capabilities-result'
      && isPlaybackMessage({ ...candidate, payload: { supportedTargets: [] } }, PLAYBACK_RESPONSES)) {
      if (candidate.session !== session || !pendingCapabilities || candidate.generation !== pendingCapabilities.generation
        || pendingCapabilities.id !== candidate.requestId) return
      const pending = pendingCapabilities
      clearTimeout(pending.timer); pendingCapabilities = null
      if (isPlaybackMessage(candidate, PLAYBACK_RESPONSES) && candidate.type === 'capabilities-result') {
        operation('capabilities', pending, 'completed'); pending.resolve(candidate.payload)
      } else {
        operation('capabilities', pending, 'failed', 'invalid-result'); pending.reject(new Error('Capabilities are unavailable.'))
      }
      return
    }
    if (!isPlaybackMessage(event.data, PLAYBACK_RESPONSES)) return dispose('runtime')
    const message = event.data
    if (message.session !== session) return
    if (message.type === 'ready') {
      if (available) return dispose('runtime')
      available = true; clearTimeout(startupTimer); resolveReady(); report('ready'); return
    }
    if (message.generation !== (loaded ? activeGeneration : generation) && message.generation !== pendingLoad?.generation) return
    if (message.type === 'load-phase') {
      if (!pendingLoad || pendingLoad.id !== message.requestId || pendingLoad.generation !== message.generation) return
      if (pendingLoad.activationSent) return dispose('runtime')
      const { phase, attempt } = message.payload
      const step = STARTUP_PHASES.indexOf(phase)
      // Acknowledged compilation cannot return to a download wait or renew its
      // deadline. Only its one explicit visibility interruption may restart.
      if (attempt === loadAttempt && step === loadPhaseStep) return
      if (attempt !== loadAttempt) {
        if (loadAttempt !== 0 || attempt !== 1 || phase !== 'waiting-visible'
          || (pendingLoadPhase !== 'compiler-startup' && pendingLoadPhase !== 'compiling')) return dispose('runtime')
      } else {
        // A retained graphics session already owns the downloaded engine.
        // Only this replacement transition can skip that download phase.
        const retainedGraphics = options.stagedScenes && loaded && pendingLoadPhase === 'compiling' && phase === 'graphics-startup'
        if (step !== loadPhaseStep + 1 && !(loadPhaseStep === -1 && phase === 'compiler-download') && !retainedGraphics) return dispose('runtime')
      }
      loadAttempt = attempt; loadPhaseStep = step
      clearTimeout(pendingLoad.timer); pendingLoad.timer = undefined
      pendingLoadPhase = phase; startupObserved = 0; previousStartupObservation = performance.now()
      if (!loaded) previousObservation = previousStartupObservation
      operation('load', pendingLoad, phase)
      if (phase === 'waiting-visible' || phase === 'graphics-startup') return
      const failure = phase === 'compiling' ? 'compile-timeout' : phase
      const limit = phase === 'compiling' ? COMPILER_LIMITS.deadlineMs + 1000
        : phase === 'compiler-startup' ? COMPILER_LIMITS.startupDeadlineMs + 1000 : downloadMs
      const pending = pendingLoad
      pending.timer = setTimeout(() => {
        if (closed || pendingLoad !== pending) return
        operation('load', pending, 'failed', 'timeout'); rejectCandidate(failure)
      }, limit)
      return
    }
    if (message.type === 'prepared') {
      const pending = pendingLoad
      if (!pending || pending.id !== message.requestId || pending.generation !== message.generation) return
      if (!options.stagedScenes || pending.activationSent || pendingLoadPhase !== 'graphics-startup') return dispose('runtime')
      operation('load', pending, 'prepared')
      try { pending.activation?.beforeActivate() } catch (error) {
        if (!closed && pendingLoad === pending) {
          send('cancel-load', null, false, pending.generation)
          finishLoad(pending); pending.reject(error instanceof Error ? error : new Error('Scene activation was cancelled.'))
          report(loaded ? playing ? 'playing' : 'paused' : 'ready')
        }
        return
      }
      if (closed || pendingLoad !== pending) return
      pending.activationSent = true; startupObserved = 0; previousStartupObservation = performance.now()
      operation('load', pending, 'activating')
      send('activate', null, false, pending.generation)
      return
    }
    if (message.type === 'candidate-error') {
      if (!options.stagedScenes) return dispose('runtime')
      if (!pendingLoad || pendingLoad.id !== message.requestId || pendingLoad.generation !== message.generation) return
      if (message.payload.retained !== loaded) return dispose('runtime')
      rejectCandidate(message.payload.code, false)
      return
    }
    if (message.type === 'loaded') {
      if (!pendingLoad || pendingLoad.id !== message.requestId || pendingLoad.generation !== message.generation) return
      if (options.stagedScenes && !pendingLoad.activationSent) return dispose('runtime')
      if (loadPhaseStep !== -1 && pendingLoadPhase !== 'graphics-startup') return dispose('runtime')
      const pending = pendingLoad
      operation('load', pending, 'completed'); activeRequestId = pending.id
      rejectAuxiliary('Scene changed.', 'scene-changed')
      activeGeneration = pending.generation; loaded = true
      queuedInput = queuedAudioResponse = queuedSceneSettings = null
      lastAudioResponseKey = lastSceneSettingsKey = null
      finishLoad(pending)
      try { pending.activation?.onActivated() } catch { pending.reject(new Error('Scene activation observer failed.')); return dispose('runtime') }
      pending.resolve()
      try { send('playback', { playing }); send('synthetic', synthetic) } catch { return dispose('runtime') }
      queuedResize = lastResize
      queuedZoom = zoom
      resetObservation(); report(playing ? 'playing' : 'paused'); return
    }
    if (message.type === 'progress') {
      if (options.stagedScenes && (!loaded || message.generation !== activeGeneration)) return
      if (message.requestId !== 0 || message.payload.frames <= lastFrame) return
      lastFrame = message.payload.frames; lastProgress = performance.now(); observedSilence = 0
      if (options.onDiagnostic) diagnose({ type: 'progress', at: lastProgress })
      return
    }
    if (message.type === 'error') {
      // A delayed capture error can arrive after the request timed out. It is
      // still an operation failure, never evidence that playback has stopped.
      if (message.payload.code === 'capture') {
        if (pendingCapture?.id === message.requestId) {
          operation('capture', pendingCapture, 'failed', 'unavailable')
          clearTimeout(pendingCapture.timer); pendingCapture.reject(new Error('Frame capture failed.')); pendingCapture = null
        }
        return
      }
      const code = message.payload.code
      dispose(code === 'context-lost' ? 'context-lost'
        : pendingLoad?.id === message.requestId && code !== 'render' && code !== 'protocol' ? code : 'runtime'); return
    }
    if (message.type === 'captured') {
      const pending = pendingCapture
      if (!pending || pending.id !== message.requestId || pending.decoding) return
      pending.decoding = true; decoderBusy = true
      operation('capture', pending, 'decoding')
      void validateRasterCapture(message.payload, pending.request, options.decodeCapture).then(blob => {
        if (closed || pendingCapture !== pending || (options.stagedScenes ? activeGeneration : generation) !== pending.generation) return
        operation('capture', pending, 'completed'); clearTimeout(pending.timer); pendingCapture = null; pending.resolve(blob)
      }, () => {
        if (closed || pendingCapture !== pending || (options.stagedScenes ? activeGeneration : generation) !== pending.generation) return
        operation('capture', pending, 'failed', 'invalid-result')
        clearTimeout(pending.timer); pendingCapture = null; pending.reject(new Error('Frame capture could not be decoded.'))
      }).finally(() => { decoderBusy = false })
    }
  }
  function connect() {
    if (closed) return
    if (connected || !frame.contentWindow) return dispose('runtime')
    connected = true
    const channel = new MessageChannel()
    port = channel.port1; port.onmessage = receive; port.onmessageerror = onFrameError; port.start()
    try {
      // Opaque child cannot be addressed by an origin. Send only a fresh session and
      // private port to this exact frame; scene/audio data follows through the port.
      frame.contentWindow.postMessage(playbackMessage('connect', session, 0, 0,
        { startupPhases: true, workloadErrors: true, ...(options.stagedScenes ? { stagedScenes: true as const } : {}) }), '*', [channel.port2])
    } catch { channel.port2.close(); dispose('runtime') }
  }
  // No submitted source runs while the renderer document is downloading.
  const startupTimer = setTimeout(() => dispose('graphics-download'), downloadMs)
  const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    const entry = entries.find(value => value.target === frame)
    if (entry && onscreen !== entry.isIntersecting) { onscreen = entry.isIntersecting; resetObservation() }
  }) : null
  intersection?.observe(frame)
  function flushSceneSettings() {
    if (!queuedSceneSettings) return false
    send('scene-settings', queuedSceneSettings)
    lastSceneSettingsKey = JSON.stringify(queuedSceneSettings); queuedSceneSettings = null
    return true
  }
  function flushAudioResponse() {
    if (!queuedAudioResponse) return false
    send('audio-response', queuedAudioResponse)
    lastAudioResponseKey = JSON.stringify(queuedAudioResponse); queuedAudioResponse = null
    return true
  }
  // All continuously changing controls share two sends per tick. Fair rotation
  // leaves capacity for transport/capture while retaining one latest snapshot.
  let nextQueuedCommand = 0
  const flushQueued = [
    () => { if (!queuedInput) return false; send('input', queuedInput); queuedInput = null; return true },
    flushSceneSettings,
    flushAudioResponse,
    () => { if (!queuedResize) return false; send('resize', queuedResize); queuedResize = null; return true },
    () => { if (queuedZoom === null) return false; send('zoom', { factor: queuedZoom }); queuedZoom = null; return true },
  ]
  const inputTimer = setInterval(() => {
    if (closed || !loaded) return
    try {
      let sent = 0
      for (let checked = 0; checked < flushQueued.length && sent < 2; checked++) {
        const flush = flushQueued[nextQueuedCommand]
        nextQueuedCommand = (nextQueuedCommand + 1) % flushQueued.length
        if (flush()) sent++
      }
    } catch { dispose('runtime') }
  }, 34)
  const progressTimer = setInterval(() => {
    const now = performance.now(), delta = now - previousObservation
    const startupDelta = now - previousStartupObservation
    previousObservation = now
    previousStartupObservation = now
    const observable = onscreen && document.visibilityState !== 'hidden' && delta >= 0 && delta <= 2000
    if (pendingLoad && (pendingLoadPhase === 'graphics-startup' || pendingLoadPhase === 'waiting-visible')) {
      startupObserved = onscreen && document.visibilityState !== 'hidden' && startupDelta >= 0 && startupDelta <= 2000 ? startupObserved + startupDelta : 0
      if (startupObserved >= startupMs) {
        rejectCandidate(pendingLoadPhase === 'waiting-visible' ? 'interrupted' : 'startup-timeout')
        if (closed) return
      }
    }
    if (closed || !loaded || !playing || !observable) {
      observedSilence = 0
      if (options.onDiagnostic) diagnose({ type: 'watchdog', at: now, deltaMs: delta, silenceMs: observedSilence,
        progressAgeMs: now - lastProgress, resetReason: closed ? 'closed' : !loaded ? 'not-loaded' : !playing ? 'paused'
          : document.visibilityState === 'hidden' ? 'hidden' : !onscreen ? 'offscreen' : delta < 0 ? 'invalid-clock' : 'parent-gap' })
      return
    }
    if (now - lastProgress < 500) observedSilence = 0
    else observedSilence += delta
    if (options.onDiagnostic) diagnose({ type: 'watchdog', at: now, deltaMs: delta, silenceMs: observedSilence,
      progressAgeMs: now - lastProgress, resetReason: now - lastProgress < 500 ? 'recent-progress' : 'none' })
    if (observedSilence >= progressMs) dispose('progress-timeout')
  }, 250)
  frame.addEventListener('load', connect); frame.addEventListener('error', onFrameError)
  document.addEventListener('visibilitychange', resetObservation); window.addEventListener('pagehide', onPageHide)
  frame.src = url.href; options.container.append(frame); report('starting')
  return {
    ready,
    async loadScene(scene: unknown, profile: RenderProfile = 'full', activation?: SceneActivation) {
      const safeScene = sceneForBridge(scene)
      if (!loadAllowed()) throw new Error('Scene changes are too frequent.')
      // Increment before waiting so only the latest load can cross the bootstrap.
      const next = ++generation
      const committing = options.stagedScenes && pendingLoad?.activationSent ? pendingLoad.completion : null
      if (!committing) {
        if (options.stagedScenes && pendingLoad) send('cancel-load', null, false, pendingLoad.generation)
        rejectWork('Scene changed.', 'scene-changed')
      }
      requestedLoadGeneration = next
      await ready
      if (committing) await committing
      if (closed || next !== generation) throw new Error('Scene changed.')
      if (!options.stagedScenes) { loaded = false; activeRequestId = null; lastFrame = -1; queuedInput = null }
      queuedAudioResponse = queuedSceneSettings = null
      lastAudioResponseKey = lastSceneSettingsKey = null; nextQueuedCommand = 0
      return new Promise<void>((resolve, reject) => {
        const id = sequence + 1
        pendingLoadPhase = 'compiler-download'
        let finishCommit!: () => void
        const completion = new Promise<void>(resolve => { finishCommit = resolve })
        const pending: PendingLoad = { id, generation: next, resolve, reject, timer: undefined,
          activation, activationSent: false, completion, finishCommit }
        pendingLoad = pending
        pending.timer = setTimeout(() => {
          if (closed || pendingLoad !== pending) return
          operation('load', pending, 'failed', 'timeout'); rejectCandidate('compiler-download')
        }, downloadMs)
        operation('load', pending, 'requested')
        report('loading')
        try { send('load', { scene: safeScene, profile }, false, next) } catch (error) { reject(error); dispose('runtime') }
      })
    },
    cancelPendingLoad(): number | null {
      if (closed || requestedLoadGeneration === null) return null
      const cancelled = requestedLoadGeneration
      // A verified activation already posted to the child must be acknowledged
      // before ownership can change again. Cancel only a queued newer request.
      if (options.stagedScenes && pendingLoad?.activationSent) {
        if (requestedLoadGeneration !== pendingLoad.generation) { generation++; requestedLoadGeneration = pendingLoad.generation }
        return null
      }
      // Retire the child job immediately, before a newer selection waits on
      // permission/coalescing. Keep the renderer session and its intent intact.
      if (available && pendingLoad) send('cancel-load', null, false, pendingLoad.generation)
      generation++
      rejectWork('Scene changed.', 'scene-changed')
      if (!options.stagedScenes) { loaded = false; activeRequestId = null; resetObservation() }
      else report(loaded ? playing ? 'playing' : 'paused' : 'ready')
      return cancelled
    },
    setPlayback(shouldPlay: boolean) {
      playing = shouldPlay; resetObservation()
      send('playback', { playing }); if (loaded) report(playing ? 'playing' : 'paused')
    },
    setSynthetic(enabled: boolean, seed = 1, tempoScale = 1) { synthetic = { enabled, seed, tempoScale }; send('synthetic', synthetic) },
    setAudioResponse(value: PlaybackPayloads['audio-response']) {
      if (!isPlaybackMessage(playbackMessage('audio-response', session, generation, 1, value), ['audio-response'])) throw new Error('Invalid music response settings.')
      if (!closed) queuedAudioResponse = JSON.stringify(value) === lastAudioResponseKey ? null : structuredClone(value)
    },
    setSceneSettings(value: SceneLiveSettings) {
      const next = validateLiveSceneSettings(value)
      if (!closed) queuedSceneSettings = JSON.stringify(next) === lastSceneSettingsKey ? null : next
    },
    getCapabilities(): Promise<PlaybackPayloads['capabilities-result']> {
      if (closed || !loaded || pendingCapabilities) return Promise.reject(new Error('Capabilities are unavailable.'))
      return new Promise((resolve, reject) => {
        const id = sequence + 1
        const pending: Pending<PlaybackPayloads['capabilities-result']> = { id, generation: options.stagedScenes ? activeGeneration : generation, resolve, reject, timer: undefined }
        pendingCapabilities = pending
        pending.timer = setTimeout(() => {
          if (closed || pendingCapabilities !== pending) return
          operation('capabilities', pending, 'failed', 'timeout')
          pendingCapabilities = null; reject(new Error('Capabilities request timed out.'))
        }, startupMs)
        operation('capabilities', pending, 'requested')
        try { send('capabilities', null) } catch (error) {
          if (pendingCapabilities) clearTimeout(pendingCapabilities.timer)
          pendingCapabilities = null; reject(error)
        }
      })
    },
    requestAudioInspector(): Promise<PlaybackPayloads['audio-inspector-result']> {
      if (closed || !loaded || pendingInspector || document.visibilityState === 'hidden' || !inspectorAllowed()) return Promise.resolve(null)
      return new Promise(resolve => {
        const id = sequence + 1
        const pending: Pending<PlaybackPayloads['audio-inspector-result']> = { id, generation: options.stagedScenes ? activeGeneration : generation, resolve, reject: () => resolve(null), timer: undefined }
        pendingInspector = pending
        pending.timer = setTimeout(() => {
          if (closed || pendingInspector !== pending) return
          operation('audio-inspector', pending, 'failed', 'timeout')
          pendingInspector = null; resolve(null)
        }, 1000)
        operation('audio-inspector', pending, 'requested')
        try {
          if (send('audio-inspector', null, true) === null) {
            operation('audio-inspector', pending, 'cancelled', 'rate-limited')
            clearTimeout(pendingInspector.timer); pendingInspector = null; resolve(null)
          }
        } catch {
          if (pendingInspector) clearTimeout(pendingInspector.timer)
          pendingInspector = null; resolve(null)
        }
      })
    },
    requestGraphicsDiagnostics(): Promise<PlaybackPayloads['graphics-diagnostics-result']> {
      if (closed || !loaded || pendingGraphics || !graphicsAllowed()) return Promise.resolve(null)
      return new Promise(resolve => {
        const pending: Pending<PlaybackPayloads['graphics-diagnostics-result']> = {
          id: sequence + 1, generation: options.stagedScenes ? activeGeneration : generation, resolve, reject: () => resolve(null), timer: undefined,
        }
        pendingGraphics = pending
        pending.timer = setTimeout(() => {
          if (closed || pendingGraphics !== pending) return
          operation('graphics-diagnostics', pending, 'failed', 'timeout')
          pendingGraphics = null; resolve(null)
        }, 1000)
        operation('graphics-diagnostics', pending, 'requested')
        try {
          if (send('graphics-diagnostics', null, true) === null) {
            operation('graphics-diagnostics', pending, 'cancelled', 'rate-limited')
            clearTimeout(pending.timer); pendingGraphics = null; resolve(null)
          }
        } catch {
          clearTimeout(pending.timer); pendingGraphics = null; resolve(null)
        }
      })
    },
    setZoom(factor: number) {
      if (!Number.isFinite(factor) || factor < 0.4 || factor > 2.5) throw new Error('Invalid zoom.')
      if (!closed) { zoom = factor; queuedZoom = factor }
    },
    update(input: PlaybackPayloads['input']) {
      if (closed) return
      if (!isPlaybackMessage(playbackMessage('input', session, generation, 1, input), ['input'])) throw new Error('Invalid player input.')
      // Coalescing must retain attacks between sends, not just the newest level.
      const previous = queuedInput?.audio.frame
      const next = input.audio.frame
      let frame = next
      if (queuedInput?.audioEpoch === input.audioEpoch && input.audio.playing && previous
        && previous.time <= input.audio.audioTime && input.audio.audioTime - previous.time <= 1) {
        frame = next ? { ...next, hits: [...(previous.sequence === next.sequence ? [] : previous.hits), ...next.hits]
          .filter(hit => hit.time <= next.time && next.time - hit.time <= 1).slice(-BRIDGE_LIMITS.maxHits) } : previous
      }
      queuedInput = { ...input, audio: { ...input.audio, frame } }
    },
    resize(width: number, height: number, pixelRatio = 1) {
      const payload = { width, height, pixelRatio }
      if (!isPlaybackMessage(playbackMessage('resize', session, generation, 1, payload), ['resize'])) throw new Error('Invalid player size.')
      if (!closed) { lastResize = payload; queuedResize = payload }
    },
    capture(requestOptions: Partial<CaptureRequest> = {}): Promise<Blob> {
      if (closed || !loaded || pendingCapture || decoderBusy) return Promise.reject(new Error('Capture is unavailable.'))
      if (!captureAllowed()) return Promise.reject(new Error('Captures are too frequent.'))
      const size = boundCaptureSize(requestOptions.width ?? 640, requestOptions.height ?? 360)
      const request: CaptureRequest = { ...size, type: requestOptions.type ?? 'image/png', quality: requestOptions.quality ?? 0.9 }
      return new Promise<Blob>((resolve, reject) => {
        // MessagePort order makes the capture observe the latest authored settings.
        try { flushSceneSettings(); flushAudioResponse() } catch (error) { reject(error); return }
        const id = sequence + 1
        const pending: NonNullable<typeof pendingCapture> = { id, generation: options.stagedScenes ? activeGeneration : generation, request, decoding: false, resolve, reject, timer: undefined }
        pendingCapture = pending
        pending.timer = setTimeout(() => {
          if (closed || pendingCapture !== pending) return
          operation('capture', pending, 'failed', 'timeout')
          pendingCapture = null; reject(new Error('Frame capture timed out.'))
        }, BRIDGE_LIMITS.captureTimeoutMs)
        operation('capture', pending, 'requested')
        try { send('capture', request) } catch (error) {
          if (pendingCapture) clearTimeout(pendingCapture.timer)
          pendingCapture = null; reject(error)
        }
      })
    },
    dispose: () => dispose(),
  }
}
export type IsolatedPlaybackHost = ReturnType<typeof createIsolatedPlaybackHost>

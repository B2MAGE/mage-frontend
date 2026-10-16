import { DENIED_FEATURES, validateRendererUrl } from './rendererHost'
import { BRIDGE_LIMITS, isPlaybackMessage, messageRate, playbackMessage, PLAYBACK_RESPONSES, record, sceneForBridge, STARTUP_PHASES,
  type CaptureRequest, type PlaybackPayloads, type PlaybackType, type StartupPhase } from './playbackProtocol'
import { validateRasterCapture } from './capture'
import { boundCaptureSize, type RenderProfile } from '../policy/renderBudget'
import type { RenderFailure } from '../recovery/sceneRecovery'
import { validateLiveSceneSettings, type SceneLiveSettings } from '../liveSceneSettings'
import { COMPILER_LIMITS } from '../../../isolated-renderer/compiler/protocol'

type Pending<T> = { resolve: (value: T) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> | undefined; id: number; generation: number }
type Operation = 'load' | 'capture' | 'capabilities' | 'audio-inspector'
type OperationPhase = 'requested' | StartupPhase | 'decoding' | 'completed' | 'failed' | 'cancelled'
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
  let generation = 0, sequence = 0, lastFrame = -1, lastProgress = performance.now()
  let previousObservation = performance.now(), observedSilence = 0
  let pendingLoad: Pending<void> | null = null
  let requestedLoadGeneration: number | null = null
  let activeRequestId: number | null = null
  let pendingLoadPhase: StartupPhase | null = null, startupObserved = 0, onscreen = true
  let loadPhaseStep = -1, loadAttempt = 0
  let pendingCapabilities: Pending<PlaybackPayloads['capabilities-result']> | null = null
  let pendingInspector: Pending<PlaybackPayloads['audio-inspector-result']> | null = null
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
  function rejectWork(reason: string, diagnosticReason: 'scene-changed' | 'disposed') {
    if (pendingLoad) operation('load', pendingLoad, 'cancelled', diagnosticReason)
    if (pendingCapture) operation('capture', pendingCapture, 'cancelled', diagnosticReason)
    if (pendingCapabilities) operation('capabilities', pendingCapabilities, 'cancelled', diagnosticReason)
    for (const pending of [pendingLoad, pendingCapture, pendingCapabilities]) if (pending) {
      clearTimeout(pending.timer); pending.reject(new Error(reason))
    }
    pendingLoad = null; pendingCapture = null; pendingCapabilities = null
    requestedLoadGeneration = null
    if (pendingInspector) {
      operation('audio-inspector', pendingInspector, 'cancelled', diagnosticReason)
      clearTimeout(pendingInspector.timer); pendingInspector.resolve(null); pendingInspector = null
    }
    pendingLoadPhase = null; loadPhaseStep = -1; loadAttempt = 0
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
  }
  function send<T extends PlaybackType>(type: T, payload: PlaybackPayloads[T], optional = false) {
    if (closed || !available || !port) throw new Error('Isolated player is unavailable.')
    const message = playbackMessage(type, session, generation, ++sequence, payload)
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
    // A malformed optional reading cannot stop usable playback. Authenticate
    // its fixed envelope first; arbitrary data/getters never enter the UI.
    if (record(candidate, ['protocol', 'version', 'session', 'generation', 'requestId', 'type', 'payload'])
      && candidate.type === 'audio-inspector-result'
      && isPlaybackMessage({ ...candidate, payload: null }, PLAYBACK_RESPONSES)) {
      if (candidate.session !== session || candidate.generation !== generation || !pendingInspector
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
      if (candidate.session !== session || candidate.generation !== generation || !pendingCapabilities
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
    if (message.generation !== generation) return
    if (message.type === 'load-phase') {
      if (!pendingLoad || pendingLoad.id !== message.requestId) return
      const { phase, attempt } = message.payload
      const step = STARTUP_PHASES.indexOf(phase)
      // Acknowledged compilation cannot return to a download wait or renew its
      // deadline. Only its one explicit visibility interruption may restart.
      if (attempt === loadAttempt && step === loadPhaseStep) return
      if (attempt !== loadAttempt) {
        if (loadAttempt !== 0 || attempt !== 1 || phase !== 'waiting-visible'
          || (pendingLoadPhase !== 'compiler-startup' && pendingLoadPhase !== 'compiling')) return dispose('runtime')
      } else if (step !== loadPhaseStep + 1 && !(loadPhaseStep === -1 && phase === 'compiler-download')) return dispose('runtime')
      loadAttempt = attempt; loadPhaseStep = step
      clearTimeout(pendingLoad.timer); pendingLoad.timer = undefined
      pendingLoadPhase = phase; startupObserved = 0; previousObservation = performance.now()
      operation('load', pendingLoad, phase)
      if (phase === 'waiting-visible' || phase === 'graphics-startup') return
      const failure = phase === 'compiling' ? 'compile-timeout' : phase
      const limit = phase === 'compiling' ? COMPILER_LIMITS.deadlineMs + 1000
        : phase === 'compiler-startup' ? COMPILER_LIMITS.startupDeadlineMs + 1000 : downloadMs
      const pending = pendingLoad
      pending.timer = setTimeout(() => {
        if (closed || pendingLoad !== pending || generation !== pending.generation) return
        operation('load', pending, 'failed', 'timeout'); dispose(failure)
      }, limit)
      return
    }
    if (message.type === 'loaded') {
      if (!pendingLoad || pendingLoad.id !== message.requestId) return
      if (loadPhaseStep !== -1 && pendingLoadPhase !== 'graphics-startup') return dispose('runtime')
      operation('load', pendingLoad, 'completed'); activeRequestId = pendingLoad.id
      clearTimeout(pendingLoad.timer); pendingLoad.resolve(); pendingLoad = null
      requestedLoadGeneration = null
      pendingLoadPhase = null; loadPhaseStep = -1; loadAttempt = 0
      loaded = true
      try { send('playback', { playing }); send('synthetic', synthetic) } catch { return dispose('runtime') }
      queuedResize = lastResize
      queuedZoom = zoom
      resetObservation(); report(playing ? 'playing' : 'paused'); return
    }
    if (message.type === 'progress') {
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
        if (closed || pendingCapture !== pending || generation !== pending.generation) return
        operation('capture', pending, 'completed'); clearTimeout(pending.timer); pendingCapture = null; pending.resolve(blob)
      }, () => {
        if (closed || pendingCapture !== pending || generation !== pending.generation) return
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
      frame.contentWindow.postMessage(playbackMessage('connect', session, 0, 0, { startupPhases: true, workloadErrors: true }), '*', [channel.port2])
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
    previousObservation = now
    const observable = onscreen && document.visibilityState !== 'hidden' && delta >= 0 && delta <= 2000
    if (pendingLoad && (pendingLoadPhase === 'graphics-startup' || pendingLoadPhase === 'waiting-visible')) {
      startupObserved = observable ? startupObserved + delta : 0
      if (startupObserved >= startupMs) return dispose(pendingLoadPhase === 'waiting-visible' ? 'interrupted' : 'startup-timeout')
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
    async loadScene(scene: unknown, profile: RenderProfile = 'full') {
      const safeScene = sceneForBridge(scene)
      if (!loadAllowed()) throw new Error('Scene changes are too frequent.')
      // Increment before waiting so only the latest load can cross the bootstrap.
      const next = ++generation
      rejectWork('Scene changed.', 'scene-changed'); loaded = false; activeRequestId = null; lastFrame = -1; queuedInput = null; queuedAudioResponse = null; queuedSceneSettings = null
      requestedLoadGeneration = next
      lastAudioResponseKey = lastSceneSettingsKey = null; nextQueuedCommand = 0
      await ready
      if (closed || next !== generation) throw new Error('Scene changed.')
      return new Promise<void>((resolve, reject) => {
        const id = sequence + 1
        pendingLoadPhase = 'compiler-download'
        const pending: Pending<void> = { id, generation, resolve, reject, timer: undefined }
        pendingLoad = pending
        pending.timer = setTimeout(() => {
          if (closed || pendingLoad !== pending || generation !== pending.generation) return
          operation('load', pending, 'failed', 'timeout'); dispose('compiler-download')
        }, downloadMs)
        operation('load', pending, 'requested')
        report('loading')
        try { send('load', { scene: safeScene, profile }) } catch (error) { reject(error); dispose('runtime') }
      })
    },
    cancelPendingLoad(): number | null {
      if (closed || requestedLoadGeneration === null) return null
      const cancelled = requestedLoadGeneration
      // Retire the child job immediately, before a newer selection waits on
      // permission/coalescing. Keep the renderer session and its intent intact.
      if (available && pendingLoad) send('cancel-load', null)
      generation++
      rejectWork('Scene changed.', 'scene-changed')
      loaded = false; activeRequestId = null; resetObservation()
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
        const pending: Pending<PlaybackPayloads['capabilities-result']> = { id, generation, resolve, reject, timer: undefined }
        pendingCapabilities = pending
        pending.timer = setTimeout(() => {
          if (closed || pendingCapabilities !== pending || generation !== pending.generation) return
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
        const pending: Pending<PlaybackPayloads['audio-inspector-result']> = { id, generation, resolve, reject: () => resolve(null), timer: undefined }
        pendingInspector = pending
        pending.timer = setTimeout(() => {
          if (closed || pendingInspector !== pending || generation !== pending.generation) return
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
    capture(options: Partial<CaptureRequest> = {}): Promise<Blob> {
      if (closed || !loaded || pendingCapture || decoderBusy) return Promise.reject(new Error('Capture is unavailable.'))
      if (!captureAllowed()) return Promise.reject(new Error('Captures are too frequent.'))
      const size = boundCaptureSize(options.width ?? 640, options.height ?? 360)
      const request: CaptureRequest = { ...size, type: options.type ?? 'image/png', quality: options.quality ?? 0.9 }
      return new Promise<Blob>((resolve, reject) => {
        // MessagePort order makes the capture observe the latest authored settings.
        try { flushSceneSettings(); flushAudioResponse() } catch (error) { reject(error); return }
        const id = sequence + 1
        const pending: NonNullable<typeof pendingCapture> = { id, generation, request, decoding: false, resolve, reject, timer: undefined }
        pendingCapture = pending
        pending.timer = setTimeout(() => {
          if (closed || pendingCapture !== pending || generation !== pending.generation) return
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

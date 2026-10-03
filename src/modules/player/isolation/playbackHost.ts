import { DENIED_FEATURES, validateRendererUrl } from './rendererHost'
import { BRIDGE_LIMITS, isPlaybackMessage, messageRate, playbackMessage, PLAYBACK_RESPONSES, sceneForBridge,
  type CaptureRequest, type PlaybackPayloads, type PlaybackType } from './playbackProtocol'
import { validateRasterCapture } from './capture'
import { boundCaptureSize, type RenderProfile } from '../policy/renderBudget'
import type { RenderFailure } from '../recovery/renderRecoveryMonitor'

type Pending<T> = { resolve: (value: T) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout>; id: number; generation: number }
export type PlaybackHostStatus = 'starting' | 'ready' | 'loading' | 'playing' | 'paused' | 'error' | 'disposed'
export function createIsolatedPlaybackHost(options: {
  container: HTMLElement; rendererUrl: string; onStatus?: (status: PlaybackHostStatus) => void
  onFailure?: (reason: RenderFailure) => void; startupTimeoutMs?: number; progressTimeoutMs?: number
  onHealthy?: () => void
  decodeCapture?: typeof createImageBitmap
  useInlineFrameStyles?: boolean
}) {
  const url = validateRendererUrl(options.rendererUrl)
  const startupMs = options.startupTimeoutMs ?? 15000, progressMs = options.progressTimeoutMs ?? 10000
  if (![startupMs, progressMs].every(v => Number.isFinite(v) && v >= 10 && v <= 30000)) throw new Error('Invalid renderer timeout.')
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
  let healthyProgressAt: number | null = null, healthyProgressMs = 0
  let pendingLoad: Pending<void> | null = null
  let pendingCapabilities: Pending<PlaybackPayloads['capabilities-result']> | null = null
  let queuedAudioResponse: PlaybackPayloads['audio-response'] | null = null
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
  let resolveReady!: () => void, rejectReady!: (reason: Error) => void
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  // Readiness can fail before a consumer begins waiting; callers still receive the rejection.
  void ready.catch(() => {})
  const report = (status: PlaybackHostStatus) => { try { options.onStatus?.(status) } catch { /* Observers cannot block cleanup. */ } }
  function rejectWork(reason: string) {
    for (const pending of [pendingLoad, pendingCapture, pendingCapabilities]) {
      if (pending) { clearTimeout(pending.timer); pending.reject(new Error(reason)) }
    }
    pendingLoad = null; pendingCapture = null; pendingCapabilities = null
  }
  function dispose(failure?: RenderFailure) {
    if (closed) return
    closed = true
    clearTimeout(startupTimer); clearInterval(inputTimer); clearInterval(progressTimer)
    frame.removeEventListener('load', connect); frame.removeEventListener('error', onFrameError)
    document.removeEventListener('visibilitychange', resetObservation)
    window.removeEventListener('pagehide', onPageHide)
    try { port?.postMessage(playbackMessage('dispose', session, generation, ++sequence, null)) } catch { /* Removed frame is final boundary. */ }
    if (port) { port.onmessage = null; port.onmessageerror = null; port.close(); port = null }
    frame.remove(); queuedInput = null; queuedResize = null; queuedZoom = null
    rejectReady(new Error('Isolated player stopped.')); rejectWork('Isolated player stopped.')
    report(failure ? 'error' : 'disposed')
    if (failure) { try { options.onFailure?.(failure) } catch { /* Already stopped. */ } }
  }
  function onFrameError() { dispose('runtime') }
  function onPageHide() { dispose() }
  function resetHealthyProgress() { healthyProgressAt = null; healthyProgressMs = 0 }
  function resetObservation() {
    previousObservation = performance.now(); observedSilence = 0; lastProgress = previousObservation
    resetHealthyProgress()
  }
  function observeHealthyProgress(now: number) {
    if (!loaded || !playing || document.visibilityState !== 'visible') { resetHealthyProgress(); return }
    const delta = healthyProgressAt === null ? 0 : now - healthyProgressAt
    if (delta < 0 || delta > 2000) resetHealthyProgress()
    // Only time between fresh, increasing frame reports counts. Loading, a
    // lone frame, silent waits and suspended browser time never establish health.
    else healthyProgressMs += delta
    healthyProgressAt = now
    if (healthyProgressMs < 10000) return
    healthyProgressMs = 0
    try { options.onHealthy?.() } catch { /* Observers cannot interrupt rendering or its watchdog. */ }
  }
  function send<T extends PlaybackType>(type: T, payload: PlaybackPayloads[T]) {
    if (closed || !available || !port) throw new Error('Isolated player is unavailable.')
    const message = playbackMessage(type, session, generation, ++sequence, payload)
    if (!isPlaybackMessage(message, [type])) throw new Error('Invalid player input.')
    if (!commandAllowed()) { dispose('runtime'); throw new Error('Too many player commands.') }
    try { port.postMessage(message) } catch { dispose('runtime'); throw new Error('Player connection failed.') }
    return message.requestId
  }
  function receive(event: MessageEvent<unknown>) {
    if (closed) return
    if (!outputAllowed() || !isPlaybackMessage(event.data, PLAYBACK_RESPONSES)) return dispose('runtime')
    const message = event.data
    if (message.session !== session) return
    if (message.type === 'ready') {
      if (available) return dispose('runtime')
      available = true; clearTimeout(startupTimer); resolveReady(); report('ready'); return
    }
    if (message.generation !== generation) return
    if (message.type === 'loaded') {
      if (!pendingLoad || pendingLoad.id !== message.requestId) return
      clearTimeout(pendingLoad.timer); pendingLoad.resolve(); pendingLoad = null
      loaded = true
      try { send('playback', { playing }); send('synthetic', synthetic) } catch { return dispose('runtime') }
      queuedResize = lastResize
      queuedZoom = zoom
      resetObservation(); report(playing ? 'playing' : 'paused'); return
    }
    if (message.type === 'progress') {
      if (message.requestId !== 0 || message.payload.frames <= lastFrame) return
      lastFrame = message.payload.frames; lastProgress = performance.now(); observedSilence = 0
      observeHealthyProgress(lastProgress); return
    }
    if (message.type === 'capabilities-result') {
      if (!pendingCapabilities || pendingCapabilities.id !== message.requestId) return
      clearTimeout(pendingCapabilities.timer); pendingCapabilities.resolve(message.payload); pendingCapabilities = null
      return
    }
    if (message.type === 'error') {
      if (message.payload.code === 'capture' && pendingCapture?.id === message.requestId) {
        clearTimeout(pendingCapture.timer); pendingCapture.reject(new Error('Frame capture failed.')); pendingCapture = null; return
      }
      dispose('runtime'); return
    }
    if (message.type === 'captured') {
      const pending = pendingCapture
      if (!pending || pending.id !== message.requestId || pending.decoding) return
      pending.decoding = true; decoderBusy = true
      void validateRasterCapture(message.payload, pending.request, options.decodeCapture).then(blob => {
        if (closed || pendingCapture !== pending || generation !== pending.generation) return
        clearTimeout(pending.timer); pendingCapture = null; pending.resolve(blob)
      }, () => {
        if (closed || pendingCapture !== pending) return
        dispose('runtime')
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
      frame.contentWindow.postMessage(playbackMessage('connect', session, 0, 0, null), '*', [channel.port2])
    } catch { channel.port2.close(); dispose('runtime') }
  }
  const startupTimer = setTimeout(() => dispose('startup-timeout'), startupMs)
  const inputTimer = setInterval(() => {
    if (closed || !loaded) return
    try {
      if (queuedResize) { send('resize', queuedResize); queuedResize = null }
      if (queuedZoom !== null) { send('zoom', { factor: queuedZoom }); queuedZoom = null }
      if (queuedAudioResponse) { send('audio-response', queuedAudioResponse); queuedAudioResponse = null }
      if (queuedInput) { send('input', queuedInput); queuedInput = null }
    } catch { dispose('runtime') }
  }, 34)
  const progressTimer = setInterval(() => {
    const now = performance.now(), delta = now - previousObservation
    previousObservation = now
    if (closed || !loaded || !playing || document.visibilityState === 'hidden' || delta < 0 || delta > 2000) {
      observedSilence = 0; resetHealthyProgress(); return
    }
    if (now - lastProgress < 500) observedSilence = 0
    else observedSilence += delta
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
      rejectWork('Scene changed.'); loaded = false; lastFrame = -1; queuedInput = null; queuedAudioResponse = null
      resetHealthyProgress()
      await ready
      if (closed || next !== generation) throw new Error('Scene changed.')
      return new Promise<void>((resolve, reject) => {
        const id = sequence + 1
        pendingLoad = { id, generation, resolve, reject, timer: setTimeout(() => dispose('startup-timeout'), startupMs) }
        report('loading')
        try { send('load', { scene: safeScene, profile }) } catch (error) { reject(error); dispose('runtime') }
      })
    },
    setPlayback(shouldPlay: boolean) {
      playing = shouldPlay; resetObservation()
      send('playback', { playing }); if (loaded) report(playing ? 'playing' : 'paused')
    },
    setSynthetic(enabled: boolean, seed = 1, tempoScale = 1) { synthetic = { enabled, seed, tempoScale }; send('synthetic', synthetic) },
    setAudioResponse(value: PlaybackPayloads['audio-response']) {
      if (!isPlaybackMessage(playbackMessage('audio-response', session, generation, 1, value), ['audio-response'])) throw new Error('Invalid music response settings.')
      if (!closed) queuedAudioResponse = structuredClone(value)
    },
    getCapabilities(): Promise<PlaybackPayloads['capabilities-result']> {
      if (closed || !loaded || pendingCapabilities) return Promise.reject(new Error('Capabilities are unavailable.'))
      return new Promise((resolve, reject) => {
        const id = sequence + 1
        pendingCapabilities = { id, generation, resolve, reject, timer: setTimeout(() => dispose('startup-timeout'), startupMs) }
        try { send('capabilities', null) } catch (error) {
          if (pendingCapabilities) clearTimeout(pendingCapabilities.timer)
          pendingCapabilities = null; reject(error)
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
      if (input.audio.playing && previous && previous.time <= input.audio.audioTime && input.audio.audioTime - previous.time <= 1) {
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
        const id = sequence + 1
        pendingCapture = { id, generation, request, decoding: false, resolve, reject, timer: setTimeout(() => {
          if (pendingCapture?.id !== id) return
          dispose('progress-timeout')
        }, BRIDGE_LIMITS.captureTimeoutMs) }
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

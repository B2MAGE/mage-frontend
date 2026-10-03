import { AudioAnalysisSession, type AudioAnalysisFrame } from '@notrac/mage/audio-analysis'

export const MAX_PARENT_AUDIO_BYTES = 64 * 1024 * 1024
const SAMPLE_INTERVAL = 1 / 30
const MAX_HITS = 16
// Matches the bridge's bounded clock. A rollover resets the receiving mapper.
const MAX_AUDIO_TIME = 604_800

type Analysis = Pick<AudioAnalysisSession, 'connect' | 'reset' | 'dispose' | 'drain' | 'setSensitivity'>

/** Injectable browser resources keep lifecycle tests independent of real speakers. */
export type ParentAudioDependencies = {
  createContext?: () => AudioContext
  createAnalysis?: () => Analysis
  fetchSource?: typeof fetch
}

export type ParentAudioState = {
  time: number
  duration: number
  loaded: boolean
  playing: boolean
  volume: number
}

export type ParentAudioSample = {
  frame: AudioAnalysisFrame | null
  legacyAmplitude: number
  /** AudioContext clock within a bounded epoch, shared by frames and hits. */
  audioTime: number
  playing: boolean
  loaded: boolean
}

const aborted = () => new DOMException('Audio loading was cancelled.', 'AbortError')

type DecodeRequest = {
  bytes: ArrayBuffer | null
  generation: number
  context: AudioContext
  resolve: (buffer: AudioBuffer) => void
  reject: (error: unknown) => void
}

function waitWhileActive<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(aborted())
    if (signal.aborted) { reject(aborted()); return }
    signal.addEventListener('abort', onAbort, { once: true })
    void promise.then(value => {
      signal.removeEventListener('abort', onAbort)
      if (signal.aborted) reject(aborted())
      else resolve(value)
    }, error => {
      signal.removeEventListener('abort', onAbort)
      reject(error)
    })
  })
}

function sourceUrl(value: string) {
  const url = new URL(value)
  if (!['https:', 'http:', 'blob:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Choose an audio file or an HTTP audio URL without credentials.')
  }
  return url.href
}

async function readAudio(source: Blob | string, signal: AbortSignal, fetchSource: typeof fetch) {
  if (typeof source !== 'string') {
    if (!(source instanceof Blob) || source.size > MAX_PARENT_AUDIO_BYTES) {
      throw new Error('Audio files must be 64 MiB or smaller.')
    }
    const bytes = await source.arrayBuffer()
    if (signal.aborted) throw aborted()
    return bytes
  }
  const response = await fetchSource(sourceUrl(source), {
    signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
  })
  if (!response.ok) throw new Error('The audio file could not be loaded.')
  const declaredSize = Number(response.headers.get('content-length'))
  if (declaredSize > MAX_PARENT_AUDIO_BYTES) {
    await response.body?.cancel()
    throw new Error('Audio files must be 64 MiB or smaller.')
  }
  if (!response.body) throw new Error('The audio file is empty.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      if (signal.aborted) throw aborted()
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_PARENT_AUDIO_BYTES) throw new Error('Audio files must be 64 MiB or smaller.')
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
  if (signal.aborted) throw aborted()
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes.buffer
}

/** Own this session in the parent, independently of any renderer or scene lifetime. */
export function createParentAudioSession(dependencies: ParentAudioDependencies = {}) {
  let disposed = false
  let generation = 0
  let transport = 0
  let abortLoad: AbortController | null = null
  let buffer: AudioBuffer | null = null
  let source: AudioBufferSourceNode | null = null
  let offset = 0
  let startedAt = 0
  let volume = 1
  let sensitivity = 1
  let sequence = 0
  let lastSampleAt = -Infinity
  let legacyAmplitude = 0
  let graph: ReturnType<typeof createGraph> | null = null
  let activeDecode: DecodeRequest | null = null
  let queuedDecode: DecodeRequest | null = null

  function assertActive() {
    if (disposed) throw new Error('This audio session has been disposed.')
  }

  function cancelRequest(request: DecodeRequest | null) {
    if (!request) return
    request.bytes = null
    request.reject(aborted())
  }

  function beginDecode(request: DecodeRequest) {
    activeDecode = request
    let work: Promise<AudioBuffer>
    try {
      work = request.context.decodeAudioData(request.bytes!)
    } catch (error) {
      work = Promise.reject(error)
    }
    request.bytes = null
    // decodeAudioData cannot be cancelled. Keep its slot occupied until the
    // browser actually finishes, while allowing only the newest request to wait.
    void work.then(decoded => {
      if (disposed || request.generation !== generation) request.reject(aborted())
      else request.resolve(decoded)
    }, error => request.reject(disposed || request.generation !== generation ? aborted() : error)).then(() => {
      activeDecode = null
      const next = queuedDecode
      queuedDecode = null
      if (next) {
        if (disposed || next.generation !== generation) cancelRequest(next)
        else beginDecode(next)
      }
    })
  }

  function decode(bytes: ArrayBuffer, current: number, context: AudioContext) {
    return new Promise<AudioBuffer>((resolve, reject) => {
      const request: DecodeRequest = { bytes, generation: current, context, resolve, reject }
      if (activeDecode) {
        cancelRequest(queuedDecode)
        queuedDecode = request
      } else beginDecode(request)
    })
  }

  function createGraph() {
    const context = dependencies.createContext?.() ?? new AudioContext()
    const input = context.createGain()
    const gain = context.createGain()
    const analyser = context.createAnalyser()
    analyser.fftSize = 64
    gain.gain.value = volume
    input.connect(gain)
    gain.connect(context.destination)
    // Volume controls listening level without changing music-response strength.
    input.connect(analyser)
    const frequencies = new Uint8Array(analyser.frequencyBinCount)
    const analysis = dependencies.createAnalysis?.() ?? new AudioAnalysisSession()
    analysis.setSensitivity(sensitivity)
    const state = { context, input, gain, analyser, frequencies, analysis, ready: Promise.resolve(false), analysisReady: false }
    state.ready = analysis.connect({ context, getOutput: () => input }).then(connected => {
      state.analysisReady = connected
      return connected
    })
    return state
  }

  function currentTime() {
    return Math.min(buffer?.duration ?? 0, offset + (source && graph ? Math.max(0, graph.context.currentTime - startedAt) : 0))
  }

  function resetAnalysis() {
    lastSampleAt = -Infinity
    legacyAmplitude = 0
    // Resetting a worklet while its module is loading would cancel connection.
    if (graph?.analysisReady) graph.analysis.reset()
  }

  function stopSource() {
    if (!source) return
    const previous = source
    source = null
    previous.onended = null
    try { previous.stop() } catch { /* A finished source may already be stopped. */ }
    previous.disconnect()
  }

  function startSource() {
    if (!graph || !buffer) return
    resetAnalysis()
    const next = graph.context.createBufferSource()
    next.buffer = buffer
    next.connect(graph.input)
    startedAt = graph.context.currentTime
    next.onended = () => {
      if (source !== next) return
      offset = buffer?.duration ?? 0
      source = null
      next.onended = null
      next.disconnect()
      resetAnalysis()
    }
    source = next
    try { next.start(0, offset) } catch (error) { stopSource(); throw error }
  }

  function clear() {
    generation++
    transport++
    abortLoad?.abort()
    abortLoad = null
    cancelRequest(activeDecode)
    cancelRequest(queuedDecode)
    queuedDecode = null
    stopSource()
    buffer = null
    offset = 0
    resetAnalysis()
  }

  return {
    async load(audio: Blob | string): Promise<void> {
      assertActive()
      clear()
      const current = generation
      const controller = new AbortController()
      abortLoad = controller
      try {
        let bytes: ArrayBuffer | null = await readAudio(audio, controller.signal, dependencies.fetchSource ?? fetch)
        if (disposed || current !== generation) throw aborted()
        graph ??= createGraph()
        const activeGraph = graph
        const pending = decode(bytes, current, activeGraph.context)
        bytes = null
        const decoded = await pending
        if (disposed || current !== generation) throw aborted()
        await waitWhileActive(activeGraph.ready, controller.signal)
        if (disposed || current !== generation) throw aborted()
        if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) throw new Error('The audio file is empty.')
        buffer = decoded
        resetAnalysis()
      } finally {
        if (abortLoad === controller) abortLoad = null
      }
    },
    async play(): Promise<void> {
      assertActive()
      if (!buffer || !graph || source) return
      const current = ++transport
      await graph.context.resume()
      if (disposed || current !== transport || !buffer || !graph) return
      if (offset >= buffer.duration) offset = 0
      startSource()
    },
    pause() {
      transport++
      offset = currentTime()
      stopSource()
      resetAnalysis()
    },
    seek(seconds: number) {
      assertActive()
      if (!Number.isFinite(seconds)) throw new Error('Audio position must be a finite number.')
      transport++
      const wasPlaying = !!source
      stopSource()
      offset = Math.max(0, Math.min(buffer?.duration ?? 0, seconds))
      resetAnalysis()
      if (wasPlaying && buffer && offset < buffer.duration) startSource()
    },
    setVolume(value: number) {
      assertActive()
      if (!Number.isFinite(value)) throw new Error('Audio volume must be a finite number.')
      volume = Math.max(0, Math.min(1, value))
      if (graph) graph.gain.gain.value = volume
    },
    setSensitivity(value: number) {
      assertActive()
      sensitivity = Number.isFinite(value) ? Math.max(0.1, Math.min(4, value)) : 1
      graph?.analysis.setSensitivity(sensitivity)
      lastSampleAt = -Infinity
    },
    getState(): ParentAudioState {
      return { time: currentTime(), duration: buffer?.duration ?? 0, loaded: !!buffer, playing: !!source, volume }
    },
    sample(): ParentAudioSample {
      const contextTime = graph?.context.currentTime ?? 0
      const clockOrigin = Math.floor(contextTime / MAX_AUDIO_TIME) * MAX_AUDIO_TIME
      const audioTime = contextTime - clockOrigin
      const sample: ParentAudioSample = { frame: null, legacyAmplitude: source ? legacyAmplitude : 0, audioTime, playing: !!source, loaded: !!buffer }
      if (!source || !graph || contextTime - lastSampleAt < SAMPLE_INTERVAL - 1e-9) return sample
      lastSampleAt = contextTime
      graph.analyser.getByteFrequencyData(graph.frequencies)
      legacyAmplitude = graph.frequencies[2] / 255
      sample.legacyAmplitude = legacyAmplitude
      const frames = graph.analysis.drain(contextTime).filter(frame => Number.isFinite(frame.time)
        && frame.time >= clockOrigin && frame.time <= contextTime && contextTime - frame.time <= 1
        && Object.values(frame.levels).every(level => Number.isFinite(level) && level >= 0 && level <= 1))
      const latest = frames.reduce<AudioAnalysisFrame | undefined>((last, frame) => !last || frame.time >= last.time ? frame : last, undefined)
      if (latest) {
        sample.frame = {
          sequence: ++sequence, time: latest.time - clockOrigin, levels: { ...latest.levels },
          hits: frames.flatMap(frame => frame.hits).filter(hit => Number.isFinite(hit.time) && hit.time >= clockOrigin
            && hit.time <= latest.time && contextTime - hit.time <= 1 && Number.isFinite(hit.strength)
            && hit.strength >= 0 && hit.strength <= 1).slice(-MAX_HITS).map(hit => ({ ...hit, time: hit.time - clockOrigin })),
        }
      }
      return sample
    },
    clear,
    dispose() {
      if (disposed) return
      clear()
      disposed = true
      graph?.analysis.dispose()
      graph?.input.disconnect()
      graph?.gain.disconnect()
      graph?.analyser.disconnect()
      void graph?.context.close().catch(() => {})
      graph = null
    },
  }
}

export type ParentAudioSession = ReturnType<typeof createParentAudioSession>

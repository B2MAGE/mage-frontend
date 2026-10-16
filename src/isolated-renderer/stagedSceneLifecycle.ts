import type { PlaybackPayloads, StartupPhase } from '../modules/player/isolation/playbackProtocol'
import { isShaderWorkloadFailure, shaderWorkloadFailure } from '../modules/player/policy/shaderWorkloadFailure'
import { ShaderCompilationError } from './compiler/errors'
import { PlaybackDownloadError, type PlaybackEngine, type PlaybackLoader, type PreparedPlaybackScene } from './playbackEngine'

type Candidate = { generation: number; requestId: number; abort: AbortController; phase: StartupPhase | null
  prepared: PreparedPlaybackScene | null; attempt: 0 | 1 }

/** One graphics session owns one active design and at most one uncommitted design. */
export function createStagedSceneLifecycle(options: {
  canvas: HTMLCanvasElement; loadScene: PlaybackLoader
  phase(generation: number, requestId: number, phase: StartupPhase, attempt: 0 | 1): void
  prepared(generation: number, requestId: number): void
  activated(generation: number, requestId: number, engine: PlaybackEngine): void
  failed(generation: number, requestId: number, failure: PlaybackPayloads['candidate-error']): void
  sessionError(reason: 'render' | 'context-lost'): void
  progress(generation: number): void
}) {
  let engine: PlaybackEngine | null = null, activeGeneration = 0, engineToken = 0, closed = false
  let candidate: Candidate | null = null
  let canvas = options.canvas
  const visibleDocument = options.canvas.ownerDocument
  const current = (job: Candidate) => !closed && candidate === job && !job.abort.signal.aborted
  function cancel() {
    const previous = candidate
    candidate = null
    if (!previous) return
    const unusedEngine = activeGeneration === 0 ? engine : null
    if (activeGeneration === 0) {
      engineToken++; engine = null
      if (!closed) {
        // A disposed initial context may report its loss asynchronously. Keep
        // the next session and its DOM listeners on a different canvas.
        const replacement = canvas.cloneNode(false) as HTMLCanvasElement
        canvas.replaceWith(replacement); canvas = replacement
      }
    }
    previous.abort.abort()
    try { previous.prepared?.discard() } catch { options.sessionError('render') }
    try { unusedEngine?.dispose() } catch { options.sessionError('render') }
  }
  function waitForVisible(signal: AbortSignal) {
    if (signal.aborted) return Promise.reject(new DOMException('Scene changed.', 'AbortError'))
    if (visibleDocument.visibilityState !== 'hidden') return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => { visibleDocument.removeEventListener('visibilitychange', check); signal.removeEventListener('abort', abort) }
      const check = () => { if (visibleDocument.visibilityState !== 'hidden') { cleanup(); resolve() } }
      const abort = () => { cleanup(); reject(new DOMException('Scene changed.', 'AbortError')) }
      visibleDocument.addEventListener('visibilitychange', check); signal.addEventListener('abort', abort, { once: true })
    })
  }
  function reject(job: Candidate, error: unknown) {
    if (!current(job)) return
    const code = shaderWorkloadFailure(error) ?? (error instanceof PlaybackDownloadError ? error.code
      : error instanceof ShaderCompilationError ? error.code === 'timeout' ? 'compile-timeout'
        : error.code === 'startup' ? 'compiler-startup' : error.code === 'invalid-output' ? 'invalid-output'
          : error.code === 'interrupted' ? 'interrupted' : isShaderWorkloadFailure(error.code) ? error.code : 'compile'
        : 'graphics-startup')
    const retained = activeGeneration > 0
    cancel()
    if (!closed) options.failed(job.generation, job.requestId, { code, retained })
  }
  return {
    get engine() { return engine },
    get activeGeneration() { return activeGeneration },
    get pendingGeneration() { return candidate?.generation ?? null },
    async prepare(generation: number, requestId: number, payload: PlaybackPayloads['load']) {
      cancel()
      if (closed) return
      const job: Candidate = { generation, requestId, abort: new AbortController(), phase: null, prepared: null, attempt: 0 }
      candidate = job
      const phase = (value: StartupPhase) => {
        if (!current(job)) return
        job.phase = value; options.phase(generation, requestId, value, job.attempt)
      }
      const prepare = async () => {
        if (engine) {
          if (!engine.prepareScene) throw new Error('Staged scene preparation is unavailable.')
          return engine.prepareScene({ ...payload, signal: job.abort.signal, sceneRevision: generation, onPhase: phase })
        }
        const token = ++engineToken
        const created = await options.loadScene({ canvas, ...payload, signal: job.abort.signal,
          sceneRevision: generation, deferActivation: true, onPhase: phase,
          // These callbacks belong to the graphics session, not the first scene
          // job. Later cancellation must not disable context-loss supervision.
          onError: reason => {
            if (closed || token !== engineToken) return
            if (reason === 'context-lost' || activeGeneration > 0) options.sessionError(reason ?? 'render')
            else reject(job, new Error('Graphics preparation failed.'))
          },
          onFrame: () => { if (!closed && token === engineToken && activeGeneration > 0) options.progress(activeGeneration) },
        })
        if (!current(job)) { created.dispose(); return null }
        if (!created.initialPreparedScene) { created.dispose(); throw new Error('A prepared initial scene is required.') }
        engine = created
        return created.initialPreparedScene
      }
      try {
        if (visibleDocument.visibilityState === 'hidden') { phase('waiting-visible'); await waitForVisible(job.abort.signal) }
        job.abort.signal.throwIfAborted()
        let prepared: PreparedPlaybackScene | null
        try { prepared = await prepare() } catch (error) {
          if (!current(job) || !(error instanceof ShaderCompilationError) || error.code !== 'interrupted') throw error
          job.attempt = 1; phase('waiting-visible'); await waitForVisible(job.abort.signal)
          job.abort.signal.throwIfAborted(); prepared = await prepare()
        }
        if (!prepared) return
        if (!current(job)) { prepared.discard(); return }
        job.prepared = prepared
        options.prepared(generation, requestId)
      } catch (error) { reject(job, error) }
    },
    activate(generation: number) {
      const job = candidate
      if (!job || !current(job) || job.generation !== generation || !job.prepared || !engine) return false
      try { job.prepared.activate() } catch (error) { reject(job, error); return true }
      // Activation is synchronous and rollback-safe. The candidate's verified
      // first-use draw has already succeeded; no old resources are kept hidden.
      candidate = null; activeGeneration = generation
      options.activated(generation, job.requestId, engine)
      return true
    },
    cancel(generation: number) { if (candidate?.generation === generation) cancel() },
    dispose() {
      if (closed) return
      closed = true; engineToken++
      cancel()
      try { engine?.dispose() } finally { engine = null; activeGeneration = 0 }
    },
  }
}

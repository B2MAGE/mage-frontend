import { compileInWorker, createCompilerWorker, type CompilerWorkerHandle } from '../src/isolated-renderer/compiler/client'
import { fixedWorkerSource, positiveControlSource, readWorkerMarker, type WorkerCheckEvent, type WorkerCheckPhase, type WorkerCheckSummary, type WorkerCheckScope } from './worker-check-fixture'
import { boundaryEventValue, boundaryProbeSource, emptyBoundaryEvidence, readBoundaryMarker, recordBoundaryMarker } from './worker-boundary'

type Dependencies = { compile?: typeof compileInWorker; createCompiler?: () => CompilerWorkerHandle; createControl?: (source: string) => { worker: Worker; release: () => void } }
function controlWorker(source: string) {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
  try { return { worker: new Worker(url, { name: 'mage-fixed-timer-control' }), release: () => URL.revokeObjectURL(url) } }
  catch (error) { URL.revokeObjectURL(url); throw error }
}
/** Only the source-free fixed-check protocol can invoke this runner. Ordinary playback cannot select these sources. */
export async function runFixedWorkerChecks(options: { signal: AbortSignal; nonce: string; scope?: WorkerCheckScope; emit: (event: WorkerCheckEvent) => void }, dependencies: Dependencies = {}): Promise<WorkerCheckSummary> {
  const { signal, nonce, emit, scope = 'local' } = options, origin = performance.now()
  const compile = dependencies.compile ?? compileInWorker
  const handles: Array<() => void> = []
  const summary: WorkerCheckSummary = { controlDelayed: false, scopeVerified: false, opaqueOriginObserved: false,
    normalStarted: false, normalCompiled: false, normalTerminated: false,
    completionScheduled: false, completionCompiled: false, completionTerminated: false, completionDelayed: false,
    stallStarted: false, stallEntered: false, stallEnded: false, stallTimedOut: false,
    throwStarted: false, throwRejected: false, throwTerminated: false, syntaxStarted: false, syntaxRejected: false, syntaxTerminated: false,
    abortStarted: false, abortEntered: false, abortCancelled: false,
    stallDurationMs: 0, completionObservationMs: 0, abortDurationMs: 0, repeatedJobs: 0,
    boundary: { started: false, compiled: false, terminated: false, production: emptyBoundaryEvidence(), policy: emptyBoundaryEvidence(), policyObservationMs: 0 } }
  let cancelJob: (() => void) | null = null
  const record = (phase: WorkerCheckPhase, kind: WorkerCheckEvent['kind'], value: WorkerCheckEvent['value'] = null) => {
    if (!signal.aborted) emit({ phase, kind, value, atMs: performance.now() - origin })
  }
  function wait(ms: number) {
    signal.throwIfAborted()
    return new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException('Checks stopped.', 'AbortError')) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
      signal.addEventListener('abort', abort, { once: true })
    })
  }
  function createObserved(phase: WorkerCheckPhase): CompilerWorkerHandle {
    const handle = (dependencies.createCompiler ?? createCompilerWorker)(), native = handle.worker as Worker
    const receive = (event: MessageEvent) => {
      const boundary = phase === 'boundary' ? readBoundaryMarker(event.data, nonce) : null
      if (boundary) {
        event.stopImmediatePropagation()
        if (!signal.aborted) { recordBoundaryMarker(summary.boundary.production, boundary); record(phase, 'boundary', boundaryEventValue(boundary)) }
        return
      }
      const marker = readWorkerMarker(event.data, nonce)
      if (!marker) return // Unknown messages still reach the unchanged production validator.
      event.stopImmediatePropagation()
      if (signal.aborted) return
      record(phase, 'marker', marker)
      if (phase === 'normal' && marker === 'scope') summary.scopeVerified = true
      if (phase === 'normal' && marker === 'opaque-origin') summary.opaqueOriginObserved = true
      if (phase === 'completion' && marker === 'delay-scheduled') summary.completionScheduled = true
      if (phase === 'completion' && marker === 'delayed') summary.completionDelayed = true
      if (phase === 'stall' && marker === 'loop-entered') summary.stallEntered = true
      if (phase === 'stall' && marker === 'loop-ended') summary.stallEnded = true
      if (phase === 'abort' && marker === 'loop-entered') { summary.abortEntered = true; cancelJob?.() }
    }
    // Independent native listener remains attached throughout the 600ms observation;
    // clearing the client's onmessage callback cannot hide a surviving delayed callback.
    native.addEventListener('message', receive)
    handles.push(() => { native.removeEventListener('message', receive); native.terminate(); handle.release() })
    return handle
  }
  async function job(phase: Exclude<WorkerCheckPhase, 'control' | 'policy'>) {
    signal.throwIfAborted(); record(phase, 'phase')
    const start = performance.now()
    const jobAbort = new AbortController(), abortJob = () => jobAbort.abort()
    signal.addEventListener('abort', abortJob, { once: true })
    cancelJob = phase === 'abort' ? abortJob : null
    try {
      await compile(fixedWorkerSource(phase, nonce, scope), { signal: jobAbort.signal, maxRaymarchIterations: 48 }, {
        createWorker: () => createObserved(phase),
        observe(event) {
          record(phase, event.type, event.reason ?? null)
          if (phase === 'normal') {
            if (event.type === 'started') summary.normalStarted = true
            if (event.type === 'terminated' && event.reason === 'complete') summary.normalTerminated = true
          }
          if (phase === 'completion' && event.type === 'terminated' && event.reason === 'complete') summary.completionTerminated = true
          if (phase === 'boundary') {
            if (event.type === 'started') summary.boundary.started = true
            if (event.type === 'terminated' && event.reason === 'complete') summary.boundary.terminated = true
          }
          if (phase === 'throw') {
            if (event.type === 'started') summary.throwStarted = true
            if (event.type === 'terminated' && event.reason === 'error') summary.throwTerminated = true
          }
          if (phase === 'syntax') {
            if (event.type === 'started') summary.syntaxStarted = true
            if (event.type === 'terminated' && event.reason === 'error') summary.syntaxTerminated = true
          }
          if (phase === 'abort') {
            if (event.type === 'started') summary.abortStarted = true
            if (event.type === 'terminated' && event.reason === 'abort') summary.abortCancelled = true
          }
          if (phase === 'repeat' && event.type === 'terminated' && event.reason === 'complete') summary.repeatedJobs++
          if (phase === 'stall') {
            if (event.type === 'started') summary.stallStarted = true
            if (event.type === 'terminated' && event.reason === 'timeout') summary.stallTimedOut = true
          }
        },
      })
      if (phase === 'normal') summary.normalCompiled = true
      if (phase === 'completion') summary.completionCompiled = true
      if (phase === 'boundary') summary.boundary.compiled = true
    } catch {
      signal.throwIfAborted()
      if (phase === 'throw') summary.throwRejected = true
      if (phase === 'syntax') summary.syntaxRejected = true
    } // Fixed flags describe failure; no errors/source are exported.
    finally {
      signal.removeEventListener('abort', abortJob); cancelJob = null
      if (phase === 'stall') summary.stallDurationMs = performance.now() - start
      if (phase === 'abort') summary.abortDurationMs = performance.now() - start
    }
  }
  const cleanup = () => { for (const release of handles.splice(0)) release() }
  signal.addEventListener('abort', cleanup, { once: true })
  try {
    record('control', 'phase')
    const control = (dependencies.createControl ?? controlWorker)(positiveControlSource(nonce))
    const receive = (event: MessageEvent) => { if (!signal.aborted && readWorkerMarker(event.data, nonce) === 'delayed') { summary.controlDelayed = true; record('control', 'marker', 'delayed') } }
    control.worker.addEventListener('message', receive)
    handles.push(() => { control.worker.removeEventListener('message', receive); control.worker.terminate(); control.release() })
    await wait(600)
    control.worker.terminate(); control.release()
    await job('normal')
    await job('completion')
    const observationStart = performance.now()
    await wait(600)
    summary.completionObservationMs = performance.now() - observationStart
    await job('throw')
    await job('syntax')
    await job('abort')
    await job('repeat'); await job('repeat')
    await job('boundary')
    // The production worker closes immediately after compilation. This separate
    // fixed worker shares its opaque owner and inherited CSP, but remains alive
    // long enough to observe asynchronous API results; it is not a lifetime test.
    record('policy', 'phase')
    const policy = (dependencies.createControl ?? controlWorker)(boundaryProbeSource(scope, nonce, true))
    const policyReceive = (event: MessageEvent) => {
      const marker = readBoundaryMarker(event.data, nonce)
      if (!marker || signal.aborted) return
      recordBoundaryMarker(summary.boundary.policy, marker); record('policy', 'boundary', boundaryEventValue(marker))
    }
    policy.worker.addEventListener('message', policyReceive)
    handles.push(() => { policy.worker.removeEventListener('message', policyReceive); policy.worker.terminate(); policy.release() })
    const policyStart = performance.now()
    await wait(600)
    summary.boundary.policyObservationMs = performance.now() - policyStart
    policy.worker.terminate(); policy.release()
    await job('stall')
    signal.throwIfAborted()
    return summary
  } finally { signal.removeEventListener('abort', cleanup); cleanup() }
}

import { normalizeCompiledShader, type CompiledShaderArtifact } from '@notrac/mage/compiled-shader'
import { COMPILER_LIMITS, COMPILER_PROTOCOL, COMPILER_VERSION, dataRecord, validCeiling, validSource, validRevision,
  type CompileRequest } from './protocol'
import { ShaderCompilationError, type ShaderCompilationFailure } from './errors'

declare const __MAGE_COMPILER_WORKER_SOURCE__: string

export type CompilerLifecycleEvent = Readonly<{
  type: 'created' | 'dispatched' | 'started' | 'validated' | 'terminated'
  reason?: 'complete' | 'error' | 'timeout' | 'abort'
}>
export type CompilerWorker = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'>
export type CompilerWorkerHandle = { worker: CompilerWorker; release: () => void }
type Dependencies = { createWorker?: () => CompilerWorkerHandle; observe?: (event: CompilerLifecycleEvent) => void }

/** Only the build-pinned compiler is used; callers cannot supply a URL or worker source. */
export function createCompilerWorker(): CompilerWorkerHandle {
  if (typeof Worker !== 'function' || typeof URL.createObjectURL !== 'function'
    || typeof __MAGE_COMPILER_WORKER_SOURCE__ !== 'string' || !__MAGE_COMPILER_WORKER_SOURCE__) {
    throw new ShaderCompilationError('unavailable')
  }
  const url = URL.createObjectURL(new Blob([__MAGE_COMPILER_WORKER_SOURCE__], { type: 'text/javascript' }))
  try {
    const worker = new Worker(url, { name: 'mage-shader-compiler' })
    return { worker, release: () => URL.revokeObjectURL(url) }
  } catch (error) { URL.revokeObjectURL(url); throw error }
}

/** A fresh worker owns exactly one job. Submitted source keeps a fixed execution deadline. */
export function compileInWorker(source: string, options: { signal: AbortSignal; maxRaymarchIterations: number; sceneRevision?: number },
  dependencies: Dependencies = {}): Promise<CompiledShaderArtifact> {
  const { signal, maxRaymarchIterations, sceneRevision = 1 } = options
  if (signal.aborted) return Promise.reject(new DOMException('Compilation cancelled.', 'AbortError'))
  if (!validSource(source) || !validCeiling(maxRaymarchIterations) || !validRevision(sceneRevision)) return Promise.reject(new Error('Invalid shader compilation request.'))
  return new Promise((resolve, reject) => {
    let handle: CompilerWorkerHandle | null = null
    let complete = false, started = false, messages = 0
    const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
    const jobId = randomId(), channelId = randomId()
    let deadline = performance.now() + COMPILER_LIMITS.startupDeadlineMs
    const observe = (event: CompilerLifecycleEvent) => {
      try { dependencies.observe?.(event) } catch { /* Diagnostics cannot alter lifetime. */ }
    }
    const retire = (reason: 'complete' | 'error' | 'timeout' | 'abort') => {
      if (!handle) return
      const current = handle
      handle = null
      current.worker.onmessage = current.worker.onerror = current.worker.onmessageerror = null
      try { current.worker.terminate() } catch { /* Still release the object URL and settle. */ }
      try { current.release() } catch { /* Cleanup must not strand the pending load. */ }
      observe({ type: 'terminated', reason })
    }
    const finish = (reason: 'complete' | 'error' | 'timeout' | 'abort', artifact?: CompiledShaderArtifact,
      failure: ShaderCompilationFailure = 'failed') => {
      if (complete) return
      complete = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      retire(reason)
      if (reason === 'complete' && artifact) resolve(artifact)
      else if (reason === 'abort') reject(new DOMException('Compilation cancelled.', 'AbortError'))
      else reject(new ShaderCompilationError(reason === 'timeout' ? 'timeout' : failure))
    }
    const abort = () => finish('abort')
    signal.addEventListener('abort', abort, { once: true })
    let timer = setTimeout(() => finish('timeout'), COMPILER_LIMITS.startupDeadlineMs)
    try {
      handle = (dependencies.createWorker ?? createCompilerWorker)()
      observe({ type: 'created' })
      if (complete) { retire('abort'); return }
      handle.worker.onerror = event => { event.preventDefault(); finish('error') }
      handle.worker.onmessageerror = () => finish('error')
      handle.worker.onmessage = event => {
        if (complete) return
        // Each dedicated worker may send exactly started + one terminal result.
        // Correlation binds the channel and scene revision, not trust in its output.
        if (++messages > COMPILER_LIMITS.responseMessages) { finish('error'); return }
        // A queued result cannot win over an expired deadline after backgrounding.
        if (performance.now() >= deadline) { finish('timeout'); return }
        const message: unknown = event.data
        const fields = ['protocol', 'version', 'jobId', 'channelId', 'sceneRevision', 'type']
        if (!(dataRecord(message, fields) || dataRecord(message, [...fields, 'artifact']))
          || message.protocol !== COMPILER_PROTOCOL || message.version !== COMPILER_VERSION || message.jobId !== jobId
          || message.channelId !== channelId || message.sceneRevision !== sceneRevision) {
          finish('error'); return
        }
        if (message.type === 'started' && !started && dataRecord(message, fields)) {
          started = true
          clearTimeout(timer)
          deadline = performance.now() + COMPILER_LIMITS.deadlineMs
          timer = setTimeout(() => finish('timeout'), COMPILER_LIMITS.deadlineMs)
          observe({ type: 'started' }); return
        }
        if (message.type !== 'compiled' || !started || !dataRecord(message, [...fields, 'artifact'])) {
          finish('error'); return
        }
        try {
          const artifact = normalizeCompiledShader(message.artifact, { maxRaymarchIterations })
          if (performance.now() >= deadline) { finish('timeout'); return }
          observe({ type: 'validated' })
          finish('complete', artifact)
        } catch { finish('error', undefined, 'invalid-output') }
      }
      if (signal.aborted) { finish('abort'); return }
      const request: CompileRequest = { protocol: COMPILER_PROTOCOL, version: COMPILER_VERSION, jobId, channelId, sceneRevision,
        type: 'compile', source, maxRaymarchIterations }
      handle.worker.postMessage(request)
      observe({ type: 'dispatched' })
    } catch (error) { finish('error', undefined, error instanceof ShaderCompilationError ? error.code : 'failed') }
  })
}

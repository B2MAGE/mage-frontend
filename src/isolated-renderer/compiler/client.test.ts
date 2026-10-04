import { afterEach, describe, expect, it, vi } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { compileInWorker, createCompilerWorker, type CompilerWorker, type CompilerLifecycleEvent } from './client'
import { COMPILER_LIMITS, COMPILER_PROTOCOL, COMPILER_VERSION, type CompileRequest } from './protocol'

const artifact = compileShader('sphere(0.5);')
function fixture() {
  const abort = new AbortController()
  const observe = vi.fn<(event: CompilerLifecycleEvent) => void>()
  const release = vi.fn(), terminate = vi.fn(), postMessage = vi.fn()
  const worker: CompilerWorker = { postMessage, terminate, onmessage: null, onerror: null, onmessageerror: null }
  const createWorker = vi.fn(() => ({ worker, release }))
  const load = (source = 'sphere(0.5);', sceneRevision = 7) => compileInWorker(source, { signal: abort.signal, maxRaymarchIterations: 200, sceneRevision }, { createWorker, observe })
  const respond = (type: string, extras: object = {}) => {
    const request = postMessage.mock.calls.at(-1)?.[0] as CompileRequest
    const data = { protocol: COMPILER_PROTOCOL, version: COMPILER_VERSION, jobId: request.jobId,
      channelId: request.channelId, sceneRevision: request.sceneRevision, type, ...extras }
    worker.onmessage?.call(worker as Worker, new MessageEvent('message', { data }))
  }
  const started = () => respond('started')
  const success = () => { started(); respond('compiled', { artifact }) }
  return { abort, observe, release, terminate, postMessage, worker, createWorker, load, respond, started, success }
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('disposable compiler owner', () => {
  it('terminates and revokes its URL before resolving a validated result', async () => {
    const f = fixture(), pending = f.load()
    f.success()
    expect(f.terminate).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce()
    expect(f.worker.onmessage).toBeNull()
    await expect(pending).resolves.toMatchObject({ version: 1, frag: artifact.frag })
    expect(f.observe.mock.calls.map(([event]) => event.type)).toEqual(['created', 'dispatched', 'started', 'validated', 'terminated'])
    expect(f.observe).toHaveBeenLastCalledWith({ type: 'terminated', reason: 'complete' })
    f.abort.abort(); expect(f.terminate).toHaveBeenCalledOnce()
  })

  it('uses a fresh worker/job for each compilation', async () => {
    const f = fixture(), first = f.load()
    const firstJob = f.postMessage.mock.calls[0][0].jobId
    const firstChannel = f.postMessage.mock.calls[0][0].channelId
    f.success(); await first
    const second = f.load()
    expect(f.createWorker).toHaveBeenCalledTimes(2)
    expect(f.postMessage.mock.calls[1][0].jobId).not.toBe(firstJob)
    expect(f.postMessage.mock.calls[1][0].channelId).not.toBe(firstChannel)
    f.success(); await second
    expect(f.terminate).toHaveBeenCalledTimes(2)
  })

  it('does not extend the absolute deadline after a started message', async () => {
    vi.useFakeTimers()
    const f = fixture(), pending = expect(f.load()).rejects.toThrow('too long')
    await vi.advanceTimersByTimeAsync(COMPILER_LIMITS.deadlineMs - 1)
    f.started()
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(f.terminate).toHaveBeenCalledOnce()
    expect(f.observe).toHaveBeenLastCalledWith({ type: 'terminated', reason: 'timeout' })
  })

  it('rejects a queued result past the deadline even before the timer callback runs', async () => {
    const f = fixture()
    let now = 100
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const pending = expect(f.load()).rejects.toThrow('too long')
    f.started(); now += COMPILER_LIMITS.deadlineMs + 1
    f.respond('compiled', { artifact })
    await pending
    expect(f.terminate).toHaveBeenCalledOnce()
  })

  it('cancels pending work and ignores an already queued late response', async () => {
    const f = fixture(), pending = expect(f.load()).rejects.toMatchObject({ name: 'AbortError' })
    const queued = f.worker.onmessage!
    f.abort.abort()
    const request = f.postMessage.mock.calls[0][0]
    queued.call(f.worker as Worker, new MessageEvent('message', { data: { ...request, type: 'compiled', artifact } }))
    await pending
    expect(f.terminate).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce()
  })

  it('allocates no worker for cancelled or invalid requests', async () => {
    const f = fixture()
    await expect(f.load('é'.repeat(COMPILER_LIMITS.sourceBytes))).rejects.toThrow('Invalid')
    f.abort.abort()
    await expect(f.load()).rejects.toMatchObject({ name: 'AbortError' })
    expect(f.createWorker).not.toHaveBeenCalled()
  })

  it('retires a worker returned during synchronous cancellation', async () => {
    const f = fixture()
    f.createWorker.mockImplementation(() => { f.abort.abort(); return { worker: f.worker, release: f.release } })
    await expect(f.load()).rejects.toMatchObject({ name: 'AbortError' })
    expect(f.terminate).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce()
    expect(f.postMessage).not.toHaveBeenCalled()
  })

  it.each([0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])('allocates no worker for invalid scene revision %s', async revision => {
    const f = fixture()
    await expect(f.load('sphere(0.5);', revision)).rejects.toThrow('Invalid')
    expect(f.createWorker).not.toHaveBeenCalled()
  })

  it('rejects unsupported output with actionable, fixed text and no worker-supplied diagnostic', async () => {
    const f = fixture(), pending = expect(f.load()).rejects.toMatchObject({
      name: 'ShaderCompilationError', code: 'invalid-output',
      message: 'Shader compilation failed because its output is unsupported. Simplify the shader or choose a template.',
    })
    f.started(); f.respond('compiled', { artifact: { ...artifact, frag: 'private source and diagnostic' } })
    await pending
    expect(f.observe.mock.calls.some(([event]) => event.type === 'validated')).toBe(false)
  })

  it('retires on a duplicate response and cannot be revived by queued message floods', async () => {
    const f = fixture(), pending = expect(f.load()).rejects.toThrow('failed')
    const queued = f.worker.onmessage!
    const request = f.postMessage.mock.calls[0][0] as CompileRequest
    const envelope = { protocol: COMPILER_PROTOCOL, version: COMPILER_VERSION, jobId: request.jobId,
      channelId: request.channelId, sceneRevision: request.sceneRevision }
    f.started(); f.started()
    for (let i = 0; i < 100; i++) queued.call(f.worker as Worker,
      new MessageEvent('message', { data: { ...envelope, type: 'compiled', artifact } }))
    await pending
    expect(f.terminate).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce()
    expect(f.observe.mock.calls.some(([event]) => event.type === 'validated')).toBe(false)
  })

  it('ignores an old owner callback during a newer scene compilation', async () => {
    const f = fixture(), first = f.load('sphere(0.5);', 1)
    const oldCallback = f.worker.onmessage!
    const firstRequest = f.postMessage.mock.calls[0][0] as CompileRequest
    f.success(); await first
    const second = f.load('sphere(0.5);', 2)
    oldCallback.call(f.worker as Worker, new MessageEvent('message', { data: {
      protocol: COMPILER_PROTOCOL, version: COMPILER_VERSION, jobId: firstRequest.jobId,
      channelId: firstRequest.channelId, sceneRevision: 1, type: 'compiled', artifact,
    } }))
    expect(f.terminate).toHaveBeenCalledTimes(1)
    expect(f.worker.onmessage).not.toBeNull()
    f.success(); await second
    expect(f.terminate).toHaveBeenCalledTimes(2)
  })

  it.each(['error', 'unexpected', 'duplicate-start', 'wrong-job', 'wrong-channel', 'wrong-revision', 'wrong-version', 'invalid-artifact', 'early-result', 'extra-fields'])(
    'terminates on %s without falling back to source', async kind => {
      const f = fixture(), pending = expect(f.load()).rejects.toThrow('failed')
      if (kind !== 'early-result') f.started()
      if (kind === 'error') f.respond('error')
      if (kind === 'unexpected') f.respond('progress')
      if (kind === 'duplicate-start') f.started()
      if (kind === 'wrong-job') f.respond('compiled', { artifact, jobId: '0'.repeat(32) })
      if (kind === 'wrong-channel') f.respond('compiled', { artifact, channelId: '0'.repeat(32) })
      if (kind === 'wrong-revision') f.respond('compiled', { artifact, sceneRevision: 6 })
      if (kind === 'wrong-version') f.respond('compiled', { artifact, version: 1 })
      if (kind === 'invalid-artifact') f.respond('compiled', { artifact: { ...artifact, execute: 'evil' } })
      if (kind === 'early-result') f.respond('compiled', { artifact })
      if (kind === 'extra-fields') f.respond('compiled', { artifact, source: 'evil' })
      await pending
      expect(f.terminate).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce()
    })

  it.each(['error', 'messageerror', 'postMessage'])('settles and cleans up browser %s failures', async kind => {
    const f = fixture()
    if (kind === 'postMessage') f.postMessage.mockImplementation(() => { throw new Error('clone') })
    const pending = expect(f.load()).rejects.toThrow('failed')
    if (kind === 'error') f.worker.onerror?.call(f.worker as Worker, new ErrorEvent('error'))
    if (kind === 'messageerror') f.worker.onmessageerror?.call(f.worker as Worker, new MessageEvent('messageerror'))
    await pending
    expect(f.terminate).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce()
  })

  it('still settles when diagnostics and cleanup throw', async () => {
    const f = fixture()
    f.observe.mockImplementation(() => { throw new Error('observer') })
    f.terminate.mockImplementation(() => { throw new Error('terminate') })
    f.release.mockImplementation(() => { throw new Error('revoke') })
    const pending = f.load(); f.success()
    await expect(pending).resolves.toMatchObject({ version: 1 })
  })

  it('rejects worker creation failure without leaving the deadline running', async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.createWorker.mockImplementation(() => { throw new DOMException('CSP', 'SecurityError') })
    await expect(f.load()).rejects.toThrow('failed')
    expect(vi.getTimerCount()).toBe(0)
    expect(f.postMessage).not.toHaveBeenCalled()
  })

  it('never evaluates source when workers are unsupported', () => {
    vi.stubGlobal('Worker', undefined)
    expect(() => createCompilerWorker()).toThrow('unavailable')
  })
})

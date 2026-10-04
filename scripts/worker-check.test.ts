import { afterEach, describe, expect, it, vi } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { normalizeCompiledShader } from '@notrac/mage/compiled-shader'
import { fixedWorkerSource, isCheckEvent, isSummary, positiveControlSource, readWorkerMarker, workerCheckVerdicts, type WorkerCheckSummary } from './worker-check-fixture'
import { runFixedWorkerChecks } from './worker-check-runner'
import type { compileInWorker } from '../src/isolated-renderer/compiler/client'

const nonce = 'a'.repeat(32)
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
const summary: WorkerCheckSummary = { controlDelayed: true, scopeVerified: true, opaqueOriginObserved: true,
  normalStarted: true, normalCompiled: true, normalTerminated: true, completionScheduled: true, completionCompiled: true,
  completionTerminated: true, completionDelayed: false, stallStarted: true, stallEntered: true, stallEnded: false,
  stallTimedOut: true, throwStarted: true, throwRejected: true, throwTerminated: true, syntaxStarted: true, syntaxRejected: true, syntaxTerminated: true,
  abortStarted: true, abortEntered: true, abortCancelled: true, stallDurationMs: 2001, completionObservationMs: 600, abortDurationMs: 50, repeatedJobs: 2 }

describe('fixed compiler-worker fixture evidence', () => {
  it('accepts only bounded fixed report and marker fields', () => {
    expect(isSummary(summary)).toBe(true)
    for (const value of [{ ...summary, source: 'excluded' }, { ...summary, stallDurationMs: Infinity }, { ...summary, stallDurationMs: -1 },
      { ...summary, completionObservationMs: 60001 }, { ...summary, scopeVerified: 'true' }]) expect(isSummary(value)).toBe(false)
    const marker = { type: 'mage-worker-check-marker', nonce, marker: 'loop-entered' }
    expect(readWorkerMarker(marker, nonce)).toBe('loop-entered')
    for (const value of [{ ...marker, nonce: 'b'.repeat(32) }, { ...marker, marker: 'unbounded' }, { ...marker, account: 'excluded' }, null, []]) expect(readWorkerMarker(value, nonce)).toBeNull()
    expect(isCheckEvent({ phase: 'stall', kind: 'terminated', value: 'timeout', atMs: 2000 })).toBe(true)
    for (const value of [{ phase: 'stall', kind: ['phase'], value: null, atMs: 1 }, { phase: 'stall', kind: 'phase', value: 'private', atMs: 1 },
      { phase: 'stall', kind: 'terminated', value: 'arbitrary-error', atMs: 1 }, { phase: 'stall', kind: 'phase', value: null, atMs: 60001 }]) expect(isCheckEvent(value)).toBe(false)
  })

  it('does not infer success from missing callback, missing source-entry, late termination or parent delay', () => {
    expect(workerCheckVerdicts(summary, 50).every(row => row.passed)).toBe(true)
    expect(workerCheckVerdicts({ ...summary, controlDelayed: false }, 50)[3].passed).toBe(false)
    expect(workerCheckVerdicts({ ...summary, completionScheduled: false }, 50)[3].passed).toBe(false)
    expect(workerCheckVerdicts({ ...summary, completionDelayed: true }, 50)[3].passed).toBe(false)
    expect(workerCheckVerdicts({ ...summary, stallEntered: false }, 50)[4].passed).toBe(false)
    expect(workerCheckVerdicts({ ...summary, stallDurationMs: 3100 }, 50)[4].passed).toBe(false)
    expect(workerCheckVerdicts(summary, 1000)[5].passed).toBe(false)
    expect(workerCheckVerdicts(summary, 3807)[5].passed).toBe(false)
    expect(workerCheckVerdicts({ ...summary, throwStarted: false }, 50)[6].passed).toBe(false)
    expect(workerCheckVerdicts({ ...summary, syntaxTerminated: false }, 50)[7].passed).toBe(false)
    expect(workerCheckVerdicts({ ...summary, abortEntered: false }, 50)[8].passed).toBe(false)
    expect(workerCheckVerdicts({ ...summary, repeatedJobs: 1 }, 50)[9].passed).toBe(false)
  })

  it('runs the fixed normal, delayed and finite-loop sources through the actual compiler with a fake clock', async () => {
    vi.useFakeTimers()
    const messages: unknown[] = []
    vi.stubGlobal('postMessage', (message: unknown) => messages.push(message))
    vi.stubGlobal('location', { origin: 'null' })
    const artifact = compileShader(fixedWorkerSource('normal', nonce), { maxRaymarchIterations: 48 })
    expect(normalizeCompiledShader(artifact, { maxRaymarchIterations: 48 }).frag.length).toBeGreaterThan(0)
    expect(messages.map(message => readWorkerMarker(message, nonce))).toEqual(['scope', 'opaque-origin'])
    messages.length = 0
    compileShader(fixedWorkerSource('completion', nonce), { maxRaymarchIterations: 48 })
    expect(messages.map(message => readWorkerMarker(message, nonce))).toEqual(['scope', 'opaque-origin', 'delay-scheduled'])
    await vi.advanceTimersByTimeAsync(250)
    expect(readWorkerMarker(messages.at(-1), nonce)).toBe('delayed')
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock += 100)
    messages.length = 0
    compileShader(fixedWorkerSource('stall', nonce), { maxRaymarchIterations: 48 })
    expect(messages.map(message => readWorkerMarker(message, nonce))).toEqual(['scope', 'opaque-origin', 'loop-entered', 'loop-ended'])
    expect(clock).toBeGreaterThanOrEqual(3000)
    expect(() => compileShader(fixedWorkerSource('throw', nonce), { maxRaymarchIterations: 48 })).toThrow('Fixed worker exception')
    expect(() => compileShader(fixedWorkerSource('syntax', nonce), { maxRaymarchIterations: 48 })).toThrow()
    vi.stubGlobal('__mageFixedWorkerState', undefined)
    compileShader(fixedWorkerSource('repeat', nonce), { maxRaymarchIterations: 48 })
    expect(() => compileShader(fixedWorkerSource('repeat', nonce), { maxRaymarchIterations: 48 })).toThrow('Worker was reused')
    expect(() => positiveControlSource('invalid')).toThrow()
  })
})

class TestWorker extends EventTarget {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror = null; onmessageerror = null
  timers: Array<ReturnType<typeof setTimeout>> = []
  terminated = false
  constructor(readonly survive = false) { super() }
  postMessage() {}
  terminate() { this.terminated = true; if (!this.survive) this.timers.forEach(clearTimeout) }
  marker(marker: string) { this.dispatchEvent(new MessageEvent('message', { data: { type: 'mage-worker-check-marker', nonce, marker } })) }
  later(marker: string) { this.timers.push(setTimeout(() => this.marker(marker), 250)) }
}
function dependencies(survive = false) {
  const workers: TestWorker[] = []
  return { workers,
    createControl() { const worker = new TestWorker(); workers.push(worker); worker.later('delayed'); return { worker: worker as unknown as Worker, release() {} } },
    createCompiler() { const worker = new TestWorker(survive); workers.push(worker); return { worker: worker as unknown as Worker, release() {} } },
    compile: ((source, options, hooks) => {
      const { worker } = hooks!.createWorker!(), native = worker as unknown as TestWorker
      hooks!.observe?.({ type: 'created' }); hooks!.observe?.({ type: 'started' })
      native.marker('scope'); native.marker('opaque-origin')
      if (source.includes('Fixed worker exception') || source.includes('this is deliberately invalid')) {
        worker.terminate(); hooks!.observe?.({ type: 'terminated', reason: 'error' }); return Promise.reject(new Error('Fixed source rejected'))
      }
      if (source.includes('while(')) {
        native.marker('loop-entered')
        if (options.signal.aborted) { worker.terminate(); hooks!.observe?.({ type: 'terminated', reason: 'abort' }); return Promise.reject(new DOMException('Cancelled', 'AbortError')) }
        return new Promise((_resolve, reject) => setTimeout(() => { worker.terminate(); hooks!.observe?.({ type: 'terminated', reason: 'timeout' }); reject(new Error('Fixed timeout')) }, 2000))
      }
      if (source.includes('setTimeout')) { native.marker('delay-scheduled'); native.later('delayed') }
      hooks!.observe?.({ type: 'validated' }); worker.terminate(); hooks!.observe?.({ type: 'terminated', reason: 'complete' })
      return Promise.resolve({})
    }) as typeof compileInWorker,
  }
}

describe('worker fixture lifecycle', () => {
  it.each([false, true])('independently observes callbacks even after the client clears its listeners (surviving worker %s)', async survive => {
    vi.useFakeTimers()
    const deps = dependencies(survive), events: unknown[] = []
    const result = runFixedWorkerChecks({ signal: new AbortController().signal, nonce, emit: event => events.push(event) }, deps)
    await vi.advanceTimersByTimeAsync(3200)
    const observed = await result
    expect(observed.controlDelayed).toBe(true)
    expect(observed.completionCompiled).toBe(true)
    expect(observed.completionTerminated).toBe(true)
    expect(observed.completionDelayed).toBe(survive)
    expect(observed.stallTimedOut).toBe(true)
    expect(observed.stallEntered).toBe(true)
    expect(observed.abortCancelled).toBe(true)
    expect(observed.throwRejected).toBe(true)
    expect(observed.syntaxRejected).toBe(true)
    expect(observed.repeatedJobs).toBe(2)
    expect(workerCheckVerdicts(observed, 50)[3].passed).toBe(!survive)
    expect(events.every(isCheckEvent)).toBe(true)
  })

  it('cancels pending observation and prevents late markers from recording another result', async () => {
    vi.useFakeTimers()
    const deps = dependencies(), controller = new AbortController(), events: unknown[] = []
    const result = runFixedWorkerChecks({ signal: controller.signal, nonce, emit: event => events.push(event) }, deps)
    const rejected = expect(result).rejects.toThrow()
    controller.abort(); await rejected
    expect(deps.workers.every(worker => worker.terminated)).toBe(true)
    const count = events.length
    deps.workers.forEach(worker => worker.marker('delayed'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(events).toHaveLength(count)
    expect(vi.getTimerCount()).toBe(0)
  })
})

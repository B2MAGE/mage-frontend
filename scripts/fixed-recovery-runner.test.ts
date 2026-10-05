import { afterEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { runFixedRecoveryChecks, type RecoveryCheckResult } from './fixed-recovery-runner'
import type { createFixedRecoveryHost as createIsolatedPlaybackHost } from './fixed-recovery-host'
import { FIXED_RECOVERY_PROTOCOL, fixedRecoveryScene, type FixedRecoveryMarker } from '../src/modules/player/isolation/fixedRecoveryProtocol'

const releases: (() => void)[] = []
afterEach(() => { releases.splice(0).forEach(release => release()); vi.useRealTimers(); vi.restoreAllMocks() })
function setup(mode: 'normal' | 'unsupported' | 'unobserved-loss' | 'missing-action' | 'not-removed' | 'stalled-startup' = 'normal') {
  vi.useFakeTimers()
  const dom = new JSDOM('<main></main>'), container = dom.window.document.querySelector('main')!
  releases.push(() => dom.window.close())
  const controller = new AbortController(), results: RecoveryCheckResult[] = [], scenes: unknown[] = []
  const retired: ReturnType<typeof vi.fn>[] = []
  let normalPlayers = 0
  const factory = vi.fn<typeof createIsolatedPlaybackHost>(options => {
    const frame = dom.window.document.createElement('iframe')
    container.append(frame)
    const timers: ReturnType<typeof setTimeout>[] = []
    let closed = false, rejectReady: ((error: Error) => void) | null = null
    const later = (callback: () => void, milliseconds: number) => { timers.push(setTimeout(() => { if (!closed) callback() }, milliseconds)) }
    const dispose = vi.fn(() => { closed = true; timers.forEach(clearTimeout); frame.remove(); rejectReady?.(new Error('Stopped.')) })
    retired.push(dispose)
    const marker = (event: FixedRecoveryMarker['event']) => {
      if (mode === 'missing-action' && event === 'action') return
      options.onFixedRecoveryMarker?.({ protocol: FIXED_RECOVERY_PROTOCOL, version: 1, type: 'marker', session: 'a'.repeat(32),
        ...options.fixedRecoveryCheck!, event, atMs: performance.now() })
    }
    const progress = () => options.onDiagnostic?.({ type: 'progress', at: performance.now() })
    const fail = (reason: 'runtime' | 'startup-timeout') => {
      if (mode !== 'not-removed') frame.remove()
      options.onFailure?.(reason)
    }
    let ready = Promise.resolve()
    if (options.fixedRecoveryCheck?.case === 'missing-ready' || mode === 'stalled-startup') {
      ready = new Promise<void>((_resolve, reject) => { rejectReady = reject })
      if (mode !== 'stalled-startup') later(() => { marker('connected'); fail('startup-timeout'); rejectReady!(new Error('Missing ready.')) }, 50)
    } else marker('connected')
    if (!options.fixedRecoveryCheck && normalPlayers++ === 0) {
      vi.spyOn(frame, 'src', 'set').mockImplementation(() => later(() => { frame.dispatchEvent(new dom.window.Event('load')); fail('runtime') }, 50))
    }
    return { ready, dispose, async loadScene(scene: unknown) {
      scenes.push(scene); await ready
      const fixedCase = options.fixedRecoveryCheck?.case
      later(() => {
        if (fixedCase === 'context-loss' && mode === 'unsupported') { marker('unsupported'); return }
        if (fixedCase) marker('action')
        if (fixedCase === 'context-loss' && mode !== 'unobserved-loss') marker('context-lost')
        if (fixedCase && fixedCase !== 'window-message') fail('runtime')
      }, 150)
      later(progress, 200); later(progress, 700)
    } } as ReturnType<typeof createIsolatedPlaybackHost>
  })
  const promise = runFixedRecoveryChecks({ container, rendererUrl: 'https://d2wwpgc7sgvmnm.cloudfront.net/index.html',
    signal: controller.signal, startupTimeoutMs: 15000, result: value => results.push(value) }, factory)
  return { controller, promise, results, factory, container, scenes, retired }
}

describe('current recovery parent verdicts', () => {
  it('records seven fixed checks before cleanup, with real removal/progress required', async () => {
    const f = setup()
    await vi.runAllTimersAsync(); await f.promise
    expect(f.results).toHaveLength(7)
    expect(f.results.every(row => row.outcome === 'PASS')).toBe(true)
    expect(f.results[1].evidence).toContain('frame connected=true')
    expect(f.results[2].evidence).toContain('frame connected=false')
    expect(f.results[6].evidence).toContain('Prior failure verified=true')
    expect(f.scenes.every(scene => JSON.stringify(scene) === JSON.stringify(fixedRecoveryScene()))).toBe(true)
    expect(f.factory.mock.calls[0][0].startupTimeoutMs).toBe(15000)
    expect(f.retired.every(dispose => dispose.mock.calls.length === 1)).toBe(true)
    expect(f.container.querySelector('iframe')).toBeNull(); expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['unsupported', 'unobserved-loss'] as const)('does not count %s context loss as passing', async mode => {
    const f = setup(mode)
    await vi.runAllTimersAsync(); await f.promise
    expect(f.results[4].outcome).toBe(mode === 'unsupported' ? 'UNSUPPORTED' : 'FAIL')
    expect(f.results[4].evidence).not.toContain(',context-lost')
  })
  it.each(['missing-action', 'not-removed'] as const)('fails missing evidence: %s; cleanup cannot improve the verdict', async mode => {
    const f = setup(mode)
    await vi.runAllTimersAsync(); await f.promise
    expect(f.results[2].outcome).toBe('FAIL')
    expect(f.results[6].outcome).toBe('FAIL')
    if (mode === 'not-removed') expect(f.results[2].evidence).toContain('frame connected=true')
    expect(f.container.querySelector('iframe')).toBeNull()
  })
  it('cancels an unfinished startup immediately without late results or retained timers', async () => {
    const f = setup('stalled-startup')
    const rejection = expect(f.promise).rejects.toMatchObject({ name: 'AbortError' })
    f.controller.abort(); await rejection
    await vi.runAllTimersAsync()
    expect(f.results).toEqual([])
    expect(f.factory).toHaveBeenCalledOnce()
    expect(f.retired[0]).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSceneRecoveryStore, sceneRecoveryKey } from './sceneRecovery'

const source = 'sphere(0.5); // private source must never enter recovery storage'
const scene = { visualizer: { shader: source }, intent: { fov: 60 } }
const key = sceneRecoveryKey(scene, 41)!
const revision = (number: number) => sceneRecoveryKey({ visualizer: { shader: `sphere(${number})` } }, number)!
const stores: ReturnType<typeof createSceneRecoveryStore>[] = []
const store = () => {
  const created = createSceneRecoveryStore()
  stores.push(created)
  return created
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T12:00:00Z')) })
afterEach(() => {
  stores.splice(0).forEach(created => created.destroy())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('sceneRecoveryKey', () => {
  it('uses a bounded opaque identity of the stable scene ID and complete revision', () => {
    expect(key).toMatch(/^sr1:[a-f0-9]{32}:[a-f0-9]{32}$/)
    expect(key).not.toContain(source)
    expect(key).not.toContain('41:')
    expect(sceneRecoveryKey({ intent: { fov: 60 }, visualizer: { shader: source } }, '41')).toBe(key)
    expect(sceneRecoveryKey(scene, 42)).not.toBe(key)
    expect(sceneRecoveryKey({ ...scene, intent: { fov: 61 } }, 41)).not.toBe(key)
    expect(sceneRecoveryKey({ ...scene, visualizer: { shader: `${source}\n` } }, 41)).not.toBe(key)
    expect(sceneRecoveryKey(scene)).toBe(sceneRecoveryKey(JSON.parse(JSON.stringify(scene))))
    expect(sceneRecoveryKey({ templateId: 'sphere', templateVersion: 1 }))
      .not.toBe(sceneRecoveryKey({ templateId: 'sphere', templateVersion: 2 }))
  })

  it('never executes getters, toJSON, or functions to identify untrusted scene data', () => {
    const getter = vi.fn(() => 'unsafe')
    const toJSON = vi.fn(() => scene)
    const withGetter = Object.defineProperty({ ...scene }, 'audioPath', { get: getter, enumerable: true })
    const arrayGetter = Object.defineProperty([0], '0', { get: getter, enumerable: true })
    expect(sceneRecoveryKey(withGetter)).toBeNull()
    expect(sceneRecoveryKey({ ...scene, toJSON })).toBeNull()
    expect(sceneRecoveryKey({ array: arrayGetter })).toBeNull()
    expect(getter).not.toHaveBeenCalled()
    expect(toJSON).not.toHaveBeenCalled()
  })

  it('rejects non-JSON data and bounds the work without evaluating it', () => {
    const cyclic: { self?: unknown } = {}; cyclic.self = cyclic
    let nested: unknown = {}; for (let i = 0; i < 34; i += 1) nested = { nested }
    for (const bad of [null, undefined, 'source', [], cyclic, nested, new Date(), { n: Infinity },
      { n: NaN }, { missing: undefined }, { source: 'x'.repeat(1024 * 1024 + 1) },
      { nodes: Array(4097).fill(null) }, Object.create({ inherited: true }), { [Symbol()]: 1 }]) {
      expect(sceneRecoveryKey(bad)).toBeNull()
    }
    expect(sceneRecoveryKey({ array: [null, 1, 'a', false], object: Object.create(null) })).not.toBeNull()
  })
})

describe('page-session recovery', () => {
  it('keeps failures and Pause all scenes within the current page session', () => {
    const recovery = store()
    recovery.begin(key)!.fail('compile')
    recovery.setSafeMode(true)

    const newPage = store()
    expect(recovery.getBlock(key)?.reason).toBe('compile')
    expect(recovery.isSafeMode()).toBe(true)
    expect(newPage.getBlock(key)).toBeNull()
    expect(newPage.isSafeMode()).toBe(false)
    expect(newPage.begin(key)).not.toBeNull()
  })

  it('never reads or writes persistent browser state or opens an ownership channel', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem')
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const channel = vi.fn()
    vi.stubGlobal('BroadcastChannel', channel)
    const recovery = store()
    recovery.begin(key)!.fail('runtime')
    recovery.retry(key)
    recovery.begin(key)!.dispose()
    recovery.setSafeMode(true)
    recovery.destroy()

    expect(read).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    expect(channel).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('requires an explicit retry after failure and permits a fresh attempt immediately', () => {
    const recovery = store()
    recovery.begin(key)!.fail('compile-timeout')
    expect(recovery.getBlock(key)?.reason).toBe('compile-timeout')
    expect(recovery.begin(key)).toBeNull()
    vi.advanceTimersByTime(60_000)
    expect(recovery.begin(key)).toBeNull()

    recovery.retry(key)
    expect(recovery.getBlock(key)).toBeNull()
    const retry = recovery.begin(key)!
    recovery.retry(key) // A repeated click cannot retire an already running attempt.
    retry.fail('invalid-output')
    expect(recovery.getBlock(key)?.reason).toBe('invalid-output')
  })

  it('retires all players of a failed revision and ignores their delayed callbacks', () => {
    const recovery = store()
    const first = recovery.begin(key)!
    const second = recovery.begin(key)!
    first.fail('context-lost')
    const failure = recovery.getBlock(key)
    second.fail('runtime')
    expect(recovery.getBlock(key)).toBe(failure)

    recovery.retry(key)
    const replacement = recovery.begin(key)!
    first.dispose()
    first.fail('compile')
    second.dispose()
    second.fail('runtime')
    expect(recovery.getBlock(key)).toBeNull()
    replacement.fail('progress-timeout')
    expect(recovery.getBlock(key)?.reason).toBe('progress-timeout')
  })

  it('does not let disposal of one simultaneous player retire another player', () => {
    const recovery = store()
    const first = recovery.begin(key)!
    const second = recovery.begin(key)!
    first.dispose()
    first.dispose()
    first.fail('runtime')
    expect(recovery.getBlock(key)).toBeNull()
    second.fail('load')
    expect(recovery.getBlock(key)?.reason).toBe('load')
  })

  it('ignores a retired lease after a newer explicit failure, even in the same millisecond', () => {
    const recovery = store()
    const old = recovery.begin(key)!
    recovery.block(key, 'startup-timeout')
    recovery.retry(key)
    const current = recovery.begin(key)!
    current.fail('compiler-download')
    const latest = recovery.getBlock(key)
    old.fail('runtime')
    old.dispose()
    expect(recovery.getBlock(key)).toBe(latest)
  })

  it('pauses every player without clearing failures and ignores work from before the pause', () => {
    const recovery = store()
    const first = recovery.begin(key)!
    const otherKey = revision(42)
    const second = recovery.begin(otherKey)!
    const firstListener = vi.fn()
    const secondListener = vi.fn()
    recovery.subscribe(firstListener)
    recovery.subscribe(secondListener)
    recovery.setSafeMode(true)
    expect(firstListener).toHaveBeenCalledOnce()
    expect(secondListener).toHaveBeenCalledOnce()
    expect(recovery.begin(key)).toBeNull()
    expect(recovery.begin(otherKey)).toBeNull()
    first.fail('runtime')
    second.fail('load')
    expect(recovery.getBlock(key)).toBeNull()
    expect(recovery.getBlock(otherKey)).toBeNull()

    recovery.block(key, 'stopped')
    const stopped = recovery.getBlock(key)!
    recovery.retry(key)
    expect(recovery.resumeStoppedScene(key, stopped.at)).toBe(false)
    expect(recovery.getBlock(key)).toBe(stopped)
    recovery.setSafeMode(false)
    expect(recovery.getBlock(key)).toBe(stopped)
    expect(recovery.begin(key)).toBeNull()
    expect(recovery.begin(otherKey)).not.toBeNull()
  })

  it('resumes only the exact manual stop without clearing another failure', () => {
    const recovery = store()
    recovery.block(key, 'stopped')
    const stoppedAt = recovery.getBlock(key)!.at
    expect(recovery.resumeStoppedScene(key, stoppedAt)).toBe(true)
    recovery.block(key, 'stopped')
    expect(recovery.resumeStoppedScene(key, stoppedAt)).toBe(false)
    recovery.block(key, 'runtime')
    expect(recovery.resumeStoppedScene(key, recovery.getBlock(key)!.at)).toBe(false)
    expect(recovery.getBlock(key)?.reason).toBe('runtime')
  })

  it('isolates failures by scene revision and bounds the remembered page failures', () => {
    const recovery = store()
    const independent = recovery.begin(key)!
    for (let index = 0; index < 65; index += 1) recovery.block(revision(index), 'compile')
    expect(recovery.getBlock(revision(0))).toBeNull()
    expect(recovery.getBlock(revision(1))?.reason).toBe('compile')
    expect(recovery.getBlock(revision(64))?.reason).toBe('compile')
    expect(recovery.getBlock(key)).toBeNull()
    independent.fail('runtime')
    expect(recovery.getBlock(key)?.reason).toBe('runtime')
  })

  it('invalidates outstanding leases when clearing or destroying session state', () => {
    const recovery = store()
    const old = recovery.begin(key)!
    recovery.clear(key)
    const replacement = recovery.begin(key)!
    old.fail('runtime')
    expect(recovery.getBlock(key)).toBeNull()
    const listener = vi.fn()
    recovery.subscribe(listener)
    recovery.destroy()
    replacement.fail('runtime')
    recovery.block(key, 'runtime')
    recovery.retry(key)
    recovery.setSafeMode(true)
    expect(recovery.getBlock(key)).toBeNull()
    expect(recovery.begin(key)).toBeNull()
    expect(listener).not.toHaveBeenCalled()
  })
})

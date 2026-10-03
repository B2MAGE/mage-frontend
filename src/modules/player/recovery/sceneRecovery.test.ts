import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSceneRecoveryStore,
  RECOVERY_ACTIVE_KEY,
  RECOVERY_ACTIVE_LIMIT,
  RECOVERY_EXPIRY_MS,
  RECOVERY_HISTORY_KEY,
  RECOVERY_HISTORY_LIMIT,
  RECOVERY_OWNER_PROBE_MS,
  sceneRecoveryKey,
  type SceneRecoveryOptions,
} from './sceneRecovery'

const source = 'sphere(0.5); // private source must never enter recovery storage'
const scene = { visualizer: { shader: source }, intent: { fov: 60 } }
const key = sceneRecoveryKey(scene, 41)!
const revision = (number: number) => sceneRecoveryKey({ visualizer: { shader: `sphere(${number})` } }, number)!
const memoryStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => { values.set(name, value) },
    clear: () => values.clear(),
    clone: () => memoryStorage(Object.fromEntries(values)),
    content: () => [...values.values()].join('\n'),
  }
}
type Message = { kind: 'probe' | 'alive'; owner: string; target: string }
type Listener = (event: MessageEvent<unknown>) => void
const channelHub = () => {
  const peers = new Set<Set<Listener>>()
  const queued: (() => void)[] = []
  return {
    flush() {
      while (queued.length) queued.shift()!()
    },
    createChannel() {
      const listeners = new Set<Listener>()
      peers.add(listeners)
      return {
        postMessage(message: Message) {
          for (const peer of peers) {
            if (peer !== listeners) queued.push(() => {
              for (const listener of peer) listener({ data: message } as MessageEvent<unknown>)
            })
          }
        },
        addEventListener(_type: 'message', listener: Listener) { listeners.add(listener) },
        removeEventListener(_type: 'message', listener: Listener) { listeners.delete(listener) },
        close() { peers.delete(listeners); listeners.clear() },
      }
    },
  }
}
const stores: ReturnType<typeof createSceneRecoveryStore>[] = []
const store = (options: SceneRecoveryOptions = {}) => {
  const created = createSceneRecoveryStore({
    localStorage: memoryStorage(), sessionStorage: memoryStorage(),
    createChannel: null, listenForStorage: null, ...options,
  })
  stores.push(created)
  return created
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T12:00:00Z')) })
afterEach(() => { stores.splice(0).forEach((created) => created.destroy()); vi.useRealTimers() })

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

describe('recovery leases and local history', () => {
  it('persists a marker before returning the lease and keeps it until clean disposal', () => {
    const session = memoryStorage()
    const local = memoryStorage()
    const first = store({ localStorage: local, sessionStorage: session })
    const listener = vi.fn(); first.subscribe(listener)
    const lease = first.begin(key)!
    expect(JSON.parse(session.getItem(RECOVERY_ACTIVE_KEY)!).entries).toEqual([
      expect.objectContaining({ key, at: Date.now() }),
    ])
    vi.advanceTimersByTime(60_000) // First frames/time elapsed never certify a scene as safe.
    expect(JSON.parse(session.getItem(RECOVERY_ACTIVE_KEY)!).entries).toHaveLength(1)
    lease.dispose(); lease.dispose()
    expect(JSON.parse(session.getItem(RECOVERY_ACTIVE_KEY)!).entries).toEqual([])
    expect(listener).not.toHaveBeenCalled()
    first.destroy()
    const reloaded = store({ localStorage: local, sessionStorage: session })
    expect(reloaded.getBlock(key)).toBeNull()
    expect(reloaded.begin(key)).not.toBeNull()
  })

  it('retains one marker while multiple renderers share the same scene revision', () => {
    const session = memoryStorage()
    const recovery = store({ sessionStorage: session })
    const first = recovery.begin(key)!
    const second = recovery.begin(key)!
    first.dispose()
    expect(JSON.parse(session.getItem(RECOVERY_ACTIVE_KEY)!).entries).toHaveLength(1)
    second.dispose()
    expect(JSON.parse(session.getItem(RECOVERY_ACTIVE_KEY)!).entries).toEqual([])
  })

  it.each(['load', 'runtime', 'context-lost', 'startup-timeout', 'progress-timeout', 'stopped'] as const)(
    'persists %s failures and requires deliberate retry', (reason) => {
      const local = memoryStorage(); const session = memoryStorage()
      const recovery = store({ localStorage: local, sessionStorage: session })
      const lease = recovery.begin(key)!
      lease.fail(reason)
      lease.dispose()
      expect(recovery.getBlock(key)).toEqual({ reason, at: Date.now() })
      expect(recovery.begin(key)).toBeNull()
      expect(JSON.parse(session.getItem(RECOVERY_ACTIVE_KEY)!).entries).toEqual([])
      expect(store({ localStorage: local }).getBlock(key)?.reason).toBe(reason)
      recovery.retry(key)
      expect(recovery.getBlock(key)).toBeNull()
      expect(recovery.begin(key)).not.toBeNull()
      expect(local.content() + session.content()).not.toContain(source)
    },
  )

  it('records a failed reload as interrupted suspicion, not as a confirmed crash', () => {
    const local = memoryStorage(); const session = memoryStorage(); const hub = channelHub()
    const first = store({ localStorage: local, sessionStorage: session, createChannel: hub.createChannel })
    first.begin(key); first.destroy()
    const reload = store({ localStorage: local, sessionStorage: session, createChannel: hub.createChannel })
    const listener = vi.fn(); reload.subscribe(listener)
    expect(reload.getBlock(key)?.reason).toBe('interrupted')
    expect(reload.begin(key)).toBeNull()
    expect(local.getItem(RECOVERY_HISTORY_KEY)).toBeNull()
    vi.advanceTimersByTime(RECOVERY_OWNER_PROBE_MS)
    expect(reload.getBlock(key)).toEqual({ reason: 'interrupted', at: Date.now() })
    expect(listener).toHaveBeenCalledOnce()
    expect(JSON.parse(session.getItem(RECOVERY_ACTIVE_KEY)!).entries).toEqual([])
    reload.retry(key)
    const retried = reload.begin(key)!
    retried.fail('runtime')
    expect(reload.getBlock(key)?.reason).toBe('runtime')
  })

  it('safe mode persists separately and retry never bypasses it', () => {
    const local = memoryStorage()
    const first = store({ localStorage: local })
    first.block(key, 'runtime')
    first.setSafeMode(true)
    const second = store({ localStorage: local })
    expect(second.isSafeMode()).toBe(true)
    second.retry(key)
    expect(second.begin(key)).toBeNull()
    expect(second.begin(revision(2))).toBeNull()
    second.setSafeMode(false)
    expect(first.isSafeMode()).toBe(false)
    expect(second.begin(key)).not.toBeNull()
  })

  it('keeps independent tab history changes without overwriting the other keys', () => {
    const local = memoryStorage()
    const first = store({ localStorage: local }); const second = store({ localStorage: local })
    first.block(key, 'runtime')
    second.block(revision(2), 'load')
    expect(first.getBlock(revision(2))?.reason).toBe('load')
    second.clear(key)
    expect(first.getBlock(key)).toBeNull()
    expect(first.getBlock(revision(2))?.reason).toBe('load')
  })

  it('notifies subscribers about local and cross-tab history changes with a stable snapshot', () => {
    const local = memoryStorage()
    let onStorage = () => undefined as void
    const recovery = store({ localStorage: local, listenForStorage: (callback) => { onStorage = callback; return vi.fn() } })
    const listener = vi.fn(); const unsubscribe = recovery.subscribe(listener)
    expect(recovery.getSnapshot()).toBe(recovery.getSnapshot())
    const initial = recovery.getSnapshot()
    recovery.block(key, 'runtime')
    expect(recovery.getSnapshot()).toBe(initial + 1)
    expect(listener).toHaveBeenCalledOnce()
    local.clear(); onStorage()
    expect(recovery.getBlock(key)).toBeNull()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe(); recovery.setSafeMode(true)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('allows exactly one local retry while other tabs retain their automatic-playback block', () => {
    const local = memoryStorage()
    const first = store({ localStorage: local }); const second = store({ localStorage: local })
    first.block(key, 'runtime')
    const remembered = local.getItem(RECOVERY_HISTORY_KEY)
    first.retry(key)
    expect(first.getBlock(key)).toBeNull()
    expect(first.getAutomaticBlock(key)?.reason).toBe('runtime')
    expect(second.getBlock(key)?.reason).toBe('runtime')
    expect(second.begin(key)).toBeNull()
    const attempt = first.begin(key)!
    expect(attempt).not.toBeNull()
    expect(first.getBlock(key)).toBeNull()
    expect(first.getAutomaticBlock(key)?.reason).toBe('runtime')
    expect(first.begin(key)).toBeNull()
    expect(local.getItem(RECOVERY_HISTORY_KEY)).toBe(remembered)
    attempt.dispose()
    expect(first.getBlock(key)?.reason).toBe('runtime')
    expect(first.begin(key)).toBeNull()
    expect(second.begin(key)).toBeNull()
    first.retry(key)
    expect(first.begin(key)).not.toBeNull()
  })

  it.each(['granted', 'running'] as const)('revokes a %s retry when another tab reports a new failure', (state) => {
    const local = memoryStorage()
    const first = store({ localStorage: local }); const second = store({ localStorage: local })
    first.block(key, 'runtime')
    first.retry(key)
    const attempt = state === 'running' ? first.begin(key) : null
    const original = first.getAutomaticBlock(key)!
    second.block(key, 'runtime') // Deliberately use the same reason and clock tick.
    expect(first.getBlock(key)?.reason).toBe('runtime')
    expect(first.getBlock(key)!.at).toBeGreaterThan(original.at)
    expect(first.begin(key)).toBeNull()
    attempt?.dispose()
  })

  it('retains a chosen retry while its own abandoned-owner probe finishes', () => {
    const local = memoryStorage(); const session = memoryStorage(); const hub = channelHub()
    const first = store({ localStorage: local, sessionStorage: session, createChannel: hub.createChannel })
    first.begin(key); first.destroy()
    const reload = store({ localStorage: local, sessionStorage: session, createChannel: hub.createChannel })
    reload.retry(key)
    expect(reload.getBlock(key)).toBeNull()
    expect(reload.getAutomaticBlock(key)?.reason).toBe('interrupted')
    vi.advanceTimersByTime(RECOVERY_OWNER_PROBE_MS)
    expect(reload.getBlock(key)).toBeNull()
    expect(reload.getAutomaticBlock(key)?.reason).toBe('interrupted')
    expect(reload.begin(key)).not.toBeNull()
  })

  it('a failed retry revokes its permission and retains the new failure across reloads', () => {
    const local = memoryStorage()
    const recovery = store({ localStorage: local })
    recovery.block(key, 'interrupted')
    recovery.retry(key)
    const attempt = recovery.begin(key)!
    attempt.fail('context-lost')
    expect(recovery.getBlock(key)?.reason).toBe('context-lost')
    expect(recovery.begin(key)).toBeNull()
    expect(store({ localStorage: local }).getBlock(key)?.reason).toBe('context-lost')
    recovery.clear(key)
    expect(recovery.getBlock(key)).toBeNull()
  })
})

describe('tab ownership', () => {
  it('does not classify another live tab or copied sessionStorage as an abandoned renderer', () => {
    const local = memoryStorage(); const session = memoryStorage(); const hub = channelHub()
    const first = store({ localStorage: local, sessionStorage: session, createChannel: hub.createChannel })
    const original = first.begin(key)!
    const emptyTab = store({ localStorage: local, createChannel: hub.createChannel })
    expect(emptyTab.getBlock(key)).toBeNull()
    const copiedSession = session.clone()
    const copied = store({ localStorage: local, sessionStorage: copiedSession, createChannel: hub.createChannel })
    expect(copied.begin(key)).toBeNull() // Source cannot run during the ownership handshake.
    hub.flush()
    expect(copied.getBlock(key)).toBeNull()
    expect(copied.getAutomaticBlock(key)).toBeNull()
    expect(first.getAutomaticBlock(key)).toBeNull()
    expect(copied.begin(key)).not.toBeNull()
    vi.advanceTimersByTime(RECOVERY_OWNER_PROBE_MS)
    expect(first.getBlock(key)).toBeNull()
    expect(JSON.parse(session.getItem(RECOVERY_ACTIVE_KEY)!).entries).toHaveLength(1)
    expect(JSON.parse(copiedSession.getItem(RECOVERY_ACTIVE_KEY)!).entries).toHaveLength(1)
    original.dispose()
    expect(JSON.parse(copiedSession.getItem(RECOVERY_ACTIVE_KEY)!).entries).toHaveLength(1)
  })

  it('accepts a delayed live owner reply without leaving a false interrupted block', () => {
    const local = memoryStorage(); const session = memoryStorage(); const hub = channelHub()
    const first = store({ localStorage: local, sessionStorage: session, createChannel: hub.createChannel })
    first.begin(key)
    const copied = store({ localStorage: local, sessionStorage: session.clone(), createChannel: hub.createChannel })
    vi.advanceTimersByTime(RECOVERY_OWNER_PROBE_MS)
    expect(copied.getBlock(key)?.reason).toBe('interrupted')
    hub.flush()
    expect(copied.getBlock(key)).toBeNull()
    expect(first.getBlock(key)).toBeNull()
  })

  it('a late owner reply cannot erase a new explicit failure or a retry marker', () => {
    const local = memoryStorage(); const session = memoryStorage(); const hub = channelHub()
    const first = store({ localStorage: local, sessionStorage: session, createChannel: hub.createChannel })
    first.begin(key)
    const copiedSession = session.clone()
    const copied = store({ localStorage: local, sessionStorage: copiedSession, createChannel: hub.createChannel })
    copied.retry(key)
    const retry = copied.begin(key)!
    hub.flush()
    expect(JSON.parse(copiedSession.getItem(RECOVERY_ACTIVE_KEY)!).entries).toHaveLength(1)
    expect(JSON.parse(session.getItem(RECOVERY_ACTIVE_KEY)!).entries).toHaveLength(1)
    expect(first.getBlock(key)).toBeNull()
    retry.fail('runtime')
    expect(copied.getBlock(key)?.reason).toBe('runtime')
  })

  it('a live owner reply retains a separately recorded explicit failure', () => {
    const local = memoryStorage(); const session = memoryStorage(); const hub = channelHub()
    const first = store({ localStorage: local, sessionStorage: session, createChannel: hub.createChannel })
    const lease = first.begin(key)!
    const copiedSession = session.clone()
    lease.fail('context-lost')
    const copied = store({ localStorage: local, sessionStorage: copiedSession, createChannel: hub.createChannel })
    hub.flush()
    expect(copied.getBlock(key)?.reason).toBe('context-lost')
    expect(copied.begin(key)).toBeNull()
  })

  it('retired document leases cannot erase new ownership after a module replacement', () => {
    const local = memoryStorage(); const session = memoryStorage()
    const oldDocument = store({ localStorage: local, sessionStorage: session })
    const oldLease = oldDocument.begin(key)!
    oldDocument.destroy()
    const newDocument = store({ localStorage: local, sessionStorage: session })
    newDocument.retry(key)
    newDocument.begin(key)
    const currentMarker = session.getItem(RECOVERY_ACTIVE_KEY)
    oldLease.dispose()
    oldDocument.block(key, 'runtime')
    expect(session.getItem(RECOVERY_ACTIVE_KEY)).toBe(currentMarker)
    expect(newDocument.getBlock(key)).toBeNull()
  })
})

describe('recovery storage budgets and fallback', () => {
  it('bounds history to the newest revisions and expires failures', () => {
    const local = memoryStorage()
    const recovery = store({ localStorage: local })
    for (let index = 0; index < RECOVERY_HISTORY_LIMIT + 5; index += 1) {
      vi.advanceTimersByTime(1)
      recovery.block(revision(index), 'load')
    }
    expect(JSON.parse(local.getItem(RECOVERY_HISTORY_KEY)!).blocks).toHaveLength(RECOVERY_HISTORY_LIMIT)
    expect(recovery.getBlock(revision(0))).toBeNull()
    expect(recovery.getBlock(revision(RECOVERY_HISTORY_LIMIT + 4))?.reason).toBe('load')
    vi.advanceTimersByTime(RECOVERY_EXPIRY_MS + 1)
    expect(recovery.getBlock(revision(RECOVERY_HISTORY_LIMIT + 4))).toBeNull()
  })

  it('bounds active markers without evicting a currently running renderer marker', () => {
    const session = memoryStorage()
    const recovery = store({ sessionStorage: session })
    for (let index = 0; index < RECOVERY_ACTIVE_LIMIT; index += 1) expect(recovery.begin(revision(index))).not.toBeNull()
    expect(recovery.begin(revision(RECOVERY_ACTIVE_LIMIT))).toBeNull()
    expect(JSON.parse(session.getItem(RECOVERY_ACTIVE_KEY)!).entries).toHaveLength(RECOVERY_ACTIVE_LIMIT)
    expect(recovery.getBlock(revision(RECOVERY_ACTIVE_LIMIT))?.reason).toBe('stopped')
  })

  it('ignores expired markers, corrupt storage, unrecognized schema, and raw source as keys', () => {
    const local = memoryStorage({ [RECOVERY_HISTORY_KEY]: '{bad' })
    const session = memoryStorage({ [RECOVERY_ACTIVE_KEY]: JSON.stringify({ version: 1, entries: [
      { key, owner: 'old-document', at: Date.now() - RECOVERY_EXPIRY_MS - 1 },
      { key: source, owner: 'old-document', at: Date.now() },
    ] }) })
    const recovery = store({ localStorage: local, sessionStorage: session })
    expect(recovery.getBlock(key)).toBeNull()
    expect(recovery.begin(source)).toBeNull()
    recovery.block(source, 'load')
    recovery.block(key, 'runtime')
    expect(recovery.getBlock(key)?.reason).toBe('runtime')
    expect(local.content() + session.content()).not.toContain(source)
    const unknown = store({ localStorage: memoryStorage({ [RECOVERY_HISTORY_KEY]: '{"version":999,"safeMode":true,"blocks":[]}' }) })
    expect(unknown.isSafeMode()).toBe(false)
  })

  it('preserves the guard in memory when browser persistence is unavailable', () => {
    const denied = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }
    const recovery = store({ localStorage: denied, sessionStorage: denied })
    const lease = recovery.begin(key)!
    expect(lease).not.toBeNull()
    expect(recovery.isPersistent()).toBe(false)
    lease.fail('runtime')
    expect(recovery.begin(key)).toBeNull()
    expect(recovery.getBlock(key)?.reason).toBe('runtime')
    recovery.retry(key)
    expect(recovery.begin(key)).not.toBeNull()
    recovery.setSafeMode(true)
    expect(recovery.begin(revision(3))).toBeNull()
  })

  it('keeps in-memory state when a storage quota write fails', () => {
    const values = memoryStorage()
    const exhausted = { getItem: values.getItem, setItem() { throw new Error('quota') } }
    const recovery = store({ localStorage: exhausted, sessionStorage: memoryStorage() })
    recovery.block(key, 'runtime')
    expect(recovery.getBlock(key)?.reason).toBe('runtime')
    expect(recovery.isPersistent()).toBe(false)
    recovery.retry(key)
    expect(recovery.begin(key)).not.toBeNull()
  })
})

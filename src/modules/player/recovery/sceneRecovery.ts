export type RecoveryReason =
  | 'load'
  | 'compile'
  | 'runtime'
  | 'context-lost'
  | 'startup-timeout'
  | 'progress-timeout'
  | 'stopped'
  | 'interrupted'

export type RecoveryBlock = Readonly<{ reason: RecoveryReason; at: number }>
export type RecoveryLease = { dispose(): void; fail(reason: RecoveryReason): void; confirmHealthy(): void }

/** Recovery contains identifiers and timestamps only, never submitted scene data. */
export const RECOVERY_HISTORY_KEY = 'mage.scene-recovery.v1'
export const RECOVERY_ACTIVE_KEY = 'mage.scene-recovery.active.v1'
const RECOVERY_HISTORY_VERSION = 3
export const RECOVERY_HISTORY_LIMIT = 64
export const RECOVERY_ACTIVE_LIMIT = 32
export const RECOVERY_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000
export const RECOVERY_OWNER_PROBE_MS = 1000

const channelName = 'mage.scene-recovery.owners.v1'
const keyPattern = /^sr1:[a-f0-9]{32}:[a-f0-9]{32}$/
const ownerPattern = /^[a-zA-Z0-9_-]{1,80}$/
const reasons = new Set<RecoveryReason>([
  'load', 'compile', 'runtime', 'context-lost', 'startup-timeout', 'progress-timeout', 'stopped', 'interrupted',
])

/** A bounded, incremental content fingerprint; this is an identity, not a security signature. */
const createFingerprint = () => {
  let a = 0x811c9dc5
  let b = 0x9e3779b9
  let c = 0x85ebca6b
  let d = 0xc2b2ae35
  let remaining = 1024 * 1024
  return {
    append(value: string) {
      remaining -= value.length
      if (remaining < 0) throw new Error('Fingerprint budget exceeded')
      for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i)
        a = Math.imul(a ^ code, 0x01000193)
        b = Math.imul(b ^ code, 0x85ebca6b)
        c = Math.imul(c ^ code, 0xc2b2ae35)
        d = Math.imul(d ^ code, 0x27d4eb2d)
      }
    },
    finish: () => [a, b, c, d].map((value) => (value >>> 0).toString(16).padStart(8, '0')).join(''),
  }
}

/**
 * Canonical JSON identity includes the whole revision, including template version/settings.
 * Inspect descriptors instead of invoking getters, toJSON, or user supplied functions.
 * Unusable data is left to the existing validation boundary, never executed to make a key.
 */
export const sceneRecoveryKey = (scene: unknown, sceneId?: string | number): string | null => {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) return null
  const content = createFingerprint()
  const visiting = new Set<object>()
  let nodes = 0
  const walk = (value: unknown, depth: number): void => {
    nodes += 1
    if (depth > 32 || nodes > 4096) throw new Error('Fingerprint structure budget exceeded')
    if (value === null) return content.append('null;')
    if (typeof value === 'string') {
      content.append(`s${value.length}:`)
      content.append(value)
      return content.append(';')
    }
    if (typeof value === 'boolean') return content.append(value ? 'true;' : 'false;')
    if (typeof value === 'number' && Number.isFinite(value)) return content.append(`n${value};`)
    if (typeof value !== 'object') throw new Error('Not JSON data')
    if (visiting.has(value)) throw new Error('Cyclic data')
    const array = Array.isArray(value)
    const prototype = Object.getPrototypeOf(value)
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      throw new Error('Not plain JSON data')
    }
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Reflect.ownKeys(descriptors)
    if (keys.length > 4096 || keys.some((key) => typeof key !== 'string')) throw new Error('Invalid JSON keys')
    visiting.add(value)
    if (array) {
      const length = descriptors.length.value as number
      if (length > 4096 || keys.length !== length + 1) throw new Error('Not a JSON array')
      content.append('[')
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)]
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new Error('Not a data property')
        walk(descriptor.value, depth + 1)
      }
      content.append(']')
    } else {
      content.append('{')
      for (const key of (keys as string[]).sort()) {
        const descriptor = descriptors[key]
        if (!('value' in descriptor) || !descriptor.enumerable) throw new Error('Not a data property')
        content.append(`k${key.length}:`)
        content.append(key)
        content.append(';')
        walk(descriptor.value, depth + 1)
      }
      content.append('}')
    }
    visiting.delete(value)
  }
  try {
    walk(scene, 0)
    const id = createFingerprint()
    if (sceneId !== undefined && typeof sceneId !== 'string' && typeof sceneId !== 'number') return null
    id.append(sceneId === undefined ? 'anonymous' : 'scene:')
    if (sceneId !== undefined) id.append(String(sceneId))
    return `sr1:${id.finish()}:${content.finish()}`
  } catch {
    return null
  }
}

type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem'>
type OwnerMessage = { kind: 'probe' | 'alive'; owner: string; target: string }
type RecoveryChannel = {
  postMessage(message: OwnerMessage): void
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void
  close(): void
}
type ActiveEntry = { key: string; owner: string; at: number }
type HistoryEntry = RecoveryBlock & { key: string }
type PersistentHistory = { safeMode: boolean; blocks: Map<string, RecoveryBlock> }

export type SceneRecoveryOptions = {
  localStorage?: RecoveryStorage | null
  sessionStorage?: RecoveryStorage | null
  now?: () => number
  ownerId?: string
  createChannel?: (() => RecoveryChannel) | null
  listenForStorage?: ((listener: () => void) => () => void) | null
}

const browserStorage = (kind: 'localStorage' | 'sessionStorage'): RecoveryStorage | null => {
  try { return typeof window === 'undefined' ? null : window[kind] } catch { return null }
}
const randomOwner = (): string => {
  try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }
}
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
)

export const createSceneRecoveryStore = (options: SceneRecoveryOptions = {}) => {
  const local = options.localStorage === undefined ? browserStorage('localStorage') : options.localStorage
  const session = options.sessionStorage === undefined ? browserStorage('sessionStorage') : options.sessionStorage
  const now = options.now ?? Date.now
  const owner = options.ownerId ?? randomOwner()
  let persistenceAvailable = local !== null && session !== null
  let localMemoryOnly = local === null
  let sessionMemoryOnly = session === null
  let safeMode = false
  let blocks = new Map<string, RecoveryBlock>()
  const listeners = new Set<() => void>()
  const leases = new Map<string, { at: number; tokens: Set<symbol> }>()
  const pending = new Map<string, ActiveEntry>()
  const carried = new Map<string, ActiveEntry>()
  const interruptionsWritten = new Map<string, number>()
  const retryGrants = new Map<string, RecoveryBlock>()
  const activeRetries = new Map<string, { token: symbol; block: RecoveryBlock }>()
  const playbackSessions = new Map<string, Set<symbol>>()
  const suspendedRetryGrants = new Set<string>()
  // A retry during an ownership probe stays local: the copied marker could still
  // belong to another live document, which must not be quarantined by this tab.
  const localRetryBlocks = new Map<string, RecoveryBlock>()
  let snapshot = 0
  let ownerTimer: ReturnType<typeof setTimeout> | undefined
  let destroyed = false

  const fresh = (at: unknown): at is number => (
    typeof at === 'number' && Number.isFinite(at) && at >= now() - RECOVERY_EXPIRY_MS && at <= now() + 60_000
  )
  const emit = () => {
    snapshot += 1
    for (const listener of listeners) listener()
  }
  const trimBlocks = () => {
    blocks = new Map([...blocks.entries()]
      .filter(([, block]) => fresh(block.at))
      .sort((left, right) => right[1].at - left[1].at)
      .slice(0, RECOVERY_HISTORY_LIMIT))
  }
  const readHistory = (): PersistentHistory | null => {
    if (localMemoryOnly || !local) return null
    try {
      const raw = local.getItem(RECOVERY_HISTORY_KEY)
      const value: unknown = raw && raw.length <= 32_768 ? JSON.parse(raw) : null
      const next = new Map<string, RecoveryBlock>()
      if (!isRecord(value) || ![1, 2, RECOVERY_HISTORY_VERSION].includes(value.version as number)
        || !Array.isArray(value.blocks)) return { safeMode: false, blocks: next }
      for (const item of value.blocks.slice(0, RECOVERY_HISTORY_LIMIT)) {
        if (!isRecord(item) || typeof item.key !== 'string' || !keyPattern.test(item.key)
          || typeof item.reason !== 'string' || !reasons.has(item.reason as RecoveryReason) || !fresh(item.at)) continue
        // Earlier history can contain compiler blocks written while the updated
        // frontend and renderer were rolling out separately. Retire only those
        // stale records; version 3 failures still require a deliberate retry.
        if (value.version !== RECOVERY_HISTORY_VERSION && item.reason === 'compile') continue
        next.set(item.key, { reason: item.reason as RecoveryReason, at: item.at })
      }
      return { safeMode: value.safeMode === true, blocks: next }
    } catch {
      // Corrupt JSON is harmless; storage denial keeps the working in-memory guard.
      try { local.getItem(RECOVERY_HISTORY_KEY) } catch { localMemoryOnly = true; persistenceAvailable = false }
      return null
    }
  }
  const refreshHistory = () => {
    const saved = readHistory()
    if (saved) { blocks = saved.blocks; safeMode = saved.safeMode }
    trimBlocks()
    for (const [key, block] of localRetryBlocks) if (!fresh(block.at)) localRetryBlocks.delete(key)
    const stillMatches = (key: string, permitted: RecoveryBlock) => {
      const latest = readBlock(key)
      return latest?.at === permitted.at && latest.reason === permitted.reason
    }
    for (const [key, permitted] of retryGrants) {
      if (!stillMatches(key, permitted)) {
        retryGrants.delete(key)
        suspendedRetryGrants.delete(key)
      }
    }
    for (const [key, attempt] of activeRetries) {
      if (!stillMatches(key, attempt.block)) activeRetries.delete(key)
    }
  }
  const saveHistory = () => {
    trimBlocks()
    if (localMemoryOnly || !local) return
    const entries: HistoryEntry[] = [...blocks].map(([key, block]) => ({ key, ...block }))
    try { local.setItem(RECOVERY_HISTORY_KEY, JSON.stringify({ version: RECOVERY_HISTORY_VERSION, safeMode, blocks: entries })) } catch {
      localMemoryOnly = true
      persistenceAvailable = false
    }
  }
  const saveActive = () => {
    if (sessionMemoryOnly || !session) return
    const entries: ActiveEntry[] = [
      ...[...leases].map(([key, lease]) => ({ key, owner, at: lease.at })),
      ...pending.values(),
    ].slice(0, RECOVERY_ACTIVE_LIMIT)
    try { session.setItem(RECOVERY_ACTIVE_KEY, JSON.stringify({ version: 1, entries })) } catch {
      sessionMemoryOnly = true
      persistenceAvailable = false
    }
  }

  refreshHistory()
  if (session) {
    try {
      const raw = session.getItem(RECOVERY_ACTIVE_KEY)
      const value: unknown = raw && raw.length <= 16_384 ? JSON.parse(raw) : null
      if (isRecord(value) && value.version === 1 && Array.isArray(value.entries)) {
        for (const item of value.entries.slice(0, RECOVERY_ACTIVE_LIMIT)) {
          if (!isRecord(item) || typeof item.key !== 'string' || !keyPattern.test(item.key)
            || typeof item.owner !== 'string' || !ownerPattern.test(item.owner) || !fresh(item.at)) continue
          const entry = { key: item.key, owner: item.owner, at: item.at }
          pending.set(entry.key, entry)
          carried.set(entry.key, entry)
        }
      }
    } catch {
      try { session.getItem(RECOVERY_ACTIVE_KEY) } catch { sessionMemoryOnly = true; persistenceAvailable = false }
    }
  }

  let channel: RecoveryChannel | null = null
  try {
    channel = options.createChannel === null ? null
      : options.createChannel ? options.createChannel()
        : typeof window !== 'undefined' && typeof window.BroadcastChannel === 'function'
          ? new window.BroadcastChannel(channelName) : null
  } catch { /* An unavailable cross-tab channel never disables the local guard. */ }
  const post = (message: OwnerMessage) => {
    try { channel?.postMessage(message) } catch { /* Conservative interrupted fallback. */ }
  }
  const receiveOwner = (event: MessageEvent<unknown>) => {
    const message = event.data
    if (destroyed || !isRecord(message) || !['probe', 'alive'].includes(String(message.kind))
      || typeof message.owner !== 'string' || typeof message.target !== 'string'
      || !ownerPattern.test(message.owner) || !ownerPattern.test(message.target)) return
    if (message.kind === 'probe' && message.target === owner) {
      post({ kind: 'alive', owner, target: message.owner })
      return
    }
    if (message.kind !== 'alive' || message.target !== owner) return
    refreshHistory()
    let changed = false
    for (const [key, entry] of carried) {
      if (entry.owner !== message.owner) continue
      pending.delete(key)
      carried.delete(key)
      const writtenAt = interruptionsWritten.get(key)
      const block = blocks.get(key)
      if (writtenAt !== undefined && block?.reason === 'interrupted' && block.at === writtenAt) blocks.delete(key)
      interruptionsWritten.delete(key)
      changed = true
    }
    if (changed) {
      if (!pending.size) clearTimeout(ownerTimer)
      saveHistory()
      saveActive()
      emit()
    }
  }
  channel?.addEventListener('message', receiveOwner)

  if (pending.size) {
    // sessionStorage can be copied when opening/duplicating a tab. Probe the old
    // document before converting its marker to an interrupted-playback suspicion.
    // A provisional block prevents source evaluation during this ownership check.
    ownerTimer = setTimeout(() => {
      refreshHistory()
      for (const key of pending.keys()) {
        if (!blocks.has(key)) {
          const at = now()
          const interruption = { reason: 'interrupted' as const, at }
          blocks.set(key, interruption)
          // Resolving our own probe is the same suspicion the user retried,
          // rather than a newer render failure arriving from another document.
          if (retryGrants.has(key)) retryGrants.set(key, interruption)
          interruptionsWritten.set(key, at)
        }
      }
      pending.clear()
      saveHistory()
      saveActive()
      emit()
    }, channel ? RECOVERY_OWNER_PROBE_MS : 0)
    for (const previousOwner of new Set([...pending.values()].map((entry) => entry.owner))) {
      post({ kind: 'probe', owner, target: previousOwner })
    }
  } else saveActive()

  const onStorage = () => { refreshHistory(); emit() }
  const listen = options.listenForStorage === undefined
    ? (listener: () => void) => {
      if (typeof window === 'undefined') return () => undefined
      const callback = (event: StorageEvent) => {
        if (event.key === null || event.key === RECOVERY_HISTORY_KEY) listener()
      }
      window.addEventListener('storage', callback)
      return () => window.removeEventListener('storage', callback)
    }
    : options.listenForStorage
  const stopListening = listen?.(onStorage)

  function readBlock(key: string): RecoveryBlock | null {
    const block = blocks.get(key)
    if (block) return block
    const entry = pending.get(key)
    return entry ? { reason: 'interrupted', at: entry.at } : localRetryBlocks.get(key) ?? null
  }
  const getBlock = (key: string): RecoveryBlock | null => {
    refreshHistory()
    return retryGrants.has(key) || activeRetries.has(key) ? null : readBlock(key)
  }
  const getAutomaticBlock = (key: string): RecoveryBlock | null => {
    refreshHistory()
    return readBlock(key)
  }
  const block = (key: string, reason: RecoveryReason) => {
    if (destroyed || !keyPattern.test(key) || !reasons.has(reason)) return
    refreshHistory()
    const previousBlock = readBlock(key)
    // Pausing a deliberate retry is not evidence that its earlier failure was
    // repaired. Keep that quarantine so manual Resume cannot later erase it.
    const nextReason = reason === 'stopped' && previousBlock && previousBlock.reason !== 'stopped'
      ? previousBlock.reason : reason
    pending.delete(key)
    carried.delete(key)
    interruptionsWritten.delete(key)
    retryGrants.delete(key)
    activeRetries.delete(key)
    suspendedRetryGrants.delete(key)
    localRetryBlocks.delete(key)
    // Distinguish two explicit failures even if separate tabs report them in
    // the same millisecond, so an older retry cannot mask the new failure.
    blocks.set(key, { reason: nextReason, at: Math.max(now(), (previousBlock?.at ?? -Infinity) + 1) })
    saveHistory()
    saveActive()
    emit()
  }
  const retireInterruption = (key: string, expected: RecoveryBlock) => {
    refreshHistory()
    const latest = readBlock(key)
    if (expected.reason !== 'interrupted' || latest?.reason !== 'interrupted' || latest.at !== expected.at) return
    // A deliberate attempt ended cleanly. Retire only the old suspicion, not
    // any observed failure, and never certify a still-running renderer as safe.
    blocks.delete(key)
    pending.delete(key)
    carried.delete(key)
    interruptionsWritten.delete(key)
    retryGrants.delete(key)
    suspendedRetryGrants.delete(key)
    localRetryBlocks.delete(key)
    saveHistory()
  }
  const finishLease = (key: string, token: symbol, clean: boolean) => {
    if (destroyed) return
    // A newer failure (including one from another tab) always takes precedence
    // over the permission that was used for this playback attempt.
    refreshHistory()
    const attempt = activeRetries.get(key)
    if (attempt?.token === token) {
      activeRetries.delete(key)
      if (clean && safeMode && playbackSessions.get(key)?.size) {
        // Global pause replaces the renderer while its outer player remains.
        // Keep only that already accepted attempt eligible for continuation.
        if (!retryGrants.has(key)) {
          retryGrants.set(key, attempt.block)
          suspendedRetryGrants.add(key)
        }
      } else if (clean) retireInterruption(key, attempt.block)
    }
    const entry = leases.get(key)
    entry?.tokens.delete(token)
    if (entry && entry.tokens.size === 0) leases.delete(key)
    saveActive()
  }
  const clearBlock = (key: string) => {
    blocks.delete(key)
    pending.delete(key)
    carried.delete(key)
    interruptionsWritten.delete(key)
    retryGrants.delete(key)
    activeRetries.delete(key)
    suspendedRetryGrants.delete(key)
    localRetryBlocks.delete(key)
    saveHistory()
    saveActive()
    emit()
  }

  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => snapshot,
    getBlock,
    getAutomaticBlock,
    block,
    retainPlaybackSession(key: string) {
      if (destroyed || !keyPattern.test(key)) return () => undefined
      const scope = Symbol()
      const sessions = playbackSessions.get(key) ?? new Set<symbol>()
      sessions.add(scope)
      playbackSessions.set(key, sessions)
      let released = false
      return () => {
        if (released) return
        released = true
        sessions.delete(scope)
        if (sessions.size) return
        playbackSessions.delete(key)
        // A later explicit Retry is independent of this suspended continuation.
        // retry() removes its suspended tag so releasing a scope cannot revoke it.
        if (suspendedRetryGrants.delete(key)) {
          const suspended = retryGrants.get(key)
          retryGrants.delete(key)
          if (suspended) retireInterruption(key, suspended)
        }
      }
    },
    isPersistent: () => persistenceAvailable,
    /** Server permission changes never carry a local retry into a later session. */
    revokeRetry(key: string) {
      retryGrants.delete(key)
      suspendedRetryGrants.delete(key)
      activeRetries.delete(key)
      emit()
    },
    isSafeMode() { refreshHistory(); return safeMode },
    setSafeMode(enabled: boolean) {
      if (destroyed) return
      refreshHistory()
      if (safeMode === enabled) return
      safeMode = enabled
      saveHistory()
      emit()
    },
    begin(key: string): RecoveryLease | null {
      refreshHistory()
      if (destroyed || !keyPattern.test(key) || safeMode) return null
      const previousBlock = readBlock(key)
      if (previousBlock && (!retryGrants.has(key) || activeRetries.has(key))) return null
      if (!leases.has(key) && leases.size + pending.size >= RECOVERY_ACTIVE_LIMIT) {
        block(key, 'stopped')
        return null
      }
      const token = Symbol()
      if (previousBlock) {
        retryGrants.delete(key)
        suspendedRetryGrants.delete(key)
        activeRetries.set(key, { token, block: previousBlock })
        if (pending.has(key)) {
          localRetryBlocks.set(key, previousBlock)
          pending.delete(key)
          carried.delete(key)
          interruptionsWritten.delete(key)
        }
      }
      const entry = leases.get(key) ?? { at: now(), tokens: new Set<symbol>() }
      entry.tokens.add(token)
      leases.set(key, entry)
      saveActive()
      let finished = false
      return {
        confirmHealthy() {
          if (finished || destroyed) return
          refreshHistory()
          const attempt = activeRetries.get(key)
          const latest = readBlock(key)
          // Only evidence from the exact live, explicitly retried renderer may
          // retire its remembered failure. Keep the active crash marker until
          // cleanup, and never let a late confirmation erase a newer fault.
          if (safeMode || attempt?.token !== token || !leases.get(key)?.tokens.has(token)
            || latest?.at !== attempt.block.at || latest.reason !== attempt.block.reason) return
          clearBlock(key)
        },
        dispose() {
          if (finished) return
          finished = true
          finishLease(key, token, true)
        },
        fail(reason: RecoveryReason) {
          if (finished) return
          finished = true
          finishLease(key, token, false)
          block(key, reason)
        },
      }
    },
    retry(key: string) {
      if (destroyed) return
      refreshHistory()
      const previousBlock = readBlock(key)
      if (!keyPattern.test(key) || !previousBlock) return
      // One document-local attempt. Shared quarantine stays intact, so another
      // blocked tab cannot start rendering merely because this tab chose Retry.
      retryGrants.set(key, previousBlock)
      suspendedRetryGrants.delete(key)
      emit()
    },
    resumeStoppedScene(key: string, expectedStoppedAt: number) {
      if (destroyed || !keyPattern.test(key)) return false
      refreshHistory()
      const latest = readBlock(key)
      if (safeMode || latest?.reason !== 'stopped' || latest.at !== expectedStoppedAt) return false
      // Resume reverses a manual pause across this browser. A crash/interruption
      // still needs its separate one-attempt Retry and can never be cleared here.
      clearBlock(key)
      return true
    },
    /** Explicit history reset, not a playback permission. Used by tests/admin tools. */
    clear(key: string) {
      if (destroyed) return
      refreshHistory()
      clearBlock(key)
    },
    /** Release infrastructure only. Kept markers model a document that no longer runs. */
    destroy() {
      destroyed = true
      clearTimeout(ownerTimer)
      stopListening?.()
      channel?.removeEventListener('message', receiveOwner)
      channel?.close()
      listeners.clear()
    },
  }
}

export const sceneRecovery = createSceneRecoveryStore()
if (import.meta.hot) import.meta.hot.dispose(() => sceneRecovery.destroy())

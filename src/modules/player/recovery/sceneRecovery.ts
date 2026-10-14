export type RecoveryReason =
  | 'load'
  | 'compiler-download'
  | 'graphics-download'
  | 'graphics-startup'
  | 'compiler-startup'
  | 'compile'
  | 'compile-timeout'
  | 'invalid-output'
  | 'runtime'
  | 'context-lost'
  | 'startup-timeout'
  | 'progress-timeout'
  | 'stopped'
  | 'interrupted'

export type RenderFailure = Exclude<RecoveryReason, 'load' | 'stopped'>
export type RecoveryBlock = Readonly<{ reason: RecoveryReason; at: number }>
export type RecoveryLease = { dispose(): void; fail(reason: RecoveryReason): void }

const MAX_RECOVERY_BLOCKS = 64
const keyPattern = /^sr1:[a-f0-9]{32}:[a-f0-9]{32}$/

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

/** Stops and failures belong to this page only; reloading starts a fresh session. */
export const createSceneRecoveryStore = () => {
  const blocks = new Map<string, RecoveryBlock>()
  const leases = new Map<string, Set<symbol>>()
  const listeners = new Set<() => void>()
  let safeMode = false
  let snapshot = 0
  let lastBlockAt = 0
  let destroyed = false

  const emit = () => {
    snapshot += 1
    for (const listener of listeners) listener()
  }
  const getBlock = (key: string): RecoveryBlock | null => blocks.get(key) ?? null
  const invalidateLeases = (key: string) => { leases.delete(key) }
  const block = (key: string, reason: RecoveryReason) => {
    if (destroyed || !keyPattern.test(key)) return
    // Retire every current renderer before subscribers create a replacement.
    // Its delayed failure or cleanup can no longer change the new attempt.
    invalidateLeases(key)
    lastBlockAt = Math.max(Date.now(), lastBlockAt + 1)
    blocks.delete(key)
    blocks.set(key, { reason, at: lastBlockAt })
    if (blocks.size > MAX_RECOVERY_BLOCKS) blocks.delete(blocks.keys().next().value!)
    emit()
  }
  const clearBlock = (key: string) => {
    invalidateLeases(key)
    if (blocks.delete(key)) emit()
  }

  return {
    subscribe(listener: () => void) {
      if (destroyed) return () => undefined
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => snapshot,
    getBlock,
    block,
    isSafeMode: () => safeMode,
    setSafeMode(enabled: boolean) {
      if (destroyed || safeMode === enabled) return
      safeMode = enabled
      if (enabled) leases.clear()
      emit()
    },
    begin(key: string): RecoveryLease | null {
      if (destroyed || !keyPattern.test(key) || safeMode || blocks.has(key)) return null
      const token = Symbol()
      const active = leases.get(key) ?? new Set<symbol>()
      active.add(token)
      leases.set(key, active)
      const isCurrent = () => !destroyed && leases.get(key)?.has(token) === true
      const dispose = () => {
        if (!isCurrent()) return
        active.delete(token)
        if (!active.size) leases.delete(key)
      }
      return {
        dispose,
        fail(reason: RecoveryReason) {
          if (!isCurrent()) return
          block(key, reason)
        },
      }
    },
    retry(key: string) {
      if (destroyed || safeMode || !keyPattern.test(key) || !blocks.has(key)) return
      clearBlock(key)
    },
    resumeStoppedScene(key: string, expectedStoppedAt: number) {
      if (destroyed || safeMode || !keyPattern.test(key)) return false
      const latest = blocks.get(key)
      if (latest?.reason !== 'stopped' || latest.at !== expectedStoppedAt) return false
      clearBlock(key)
      return true
    },
    /** Clear a page-session failure, including when resetting a test fixture. */
    clear(key: string) {
      if (!destroyed) clearBlock(key)
    },
    destroy() {
      destroyed = true
      blocks.clear()
      leases.clear()
      listeners.clear()
    },
  }
}

export const sceneRecovery = createSceneRecoveryStore()
if (import.meta.hot) import.meta.hot.dispose(() => sceneRecovery.destroy())

import { buildApiUrl } from '@shared/lib/api'

export type SceneAvailabilityTarget = number | 'custom' | 'draft-template' | 'draft-builder' | `template:${number}` | `status:${number}`
export type SceneAvailabilityCode =
  | 'CHECKING'
  | 'AVAILABLE'
  | 'SCENE_DISABLED'
  | 'SCENE_NOT_FOUND'
  | 'SCENE_UPGRADE_REQUIRED'
  | 'BUILDER_RENDERING_UNAVAILABLE'
  | 'CUSTOM_RENDERING_DISABLED'
  | 'STATUS_UNAVAILABLE'

export type SceneAvailabilitySnapshot = Readonly<{
  allowed: boolean
  code: SceneAvailabilityCode
  message: string
  checkedAt: number | null
}>

export const AVAILABILITY_POLL_MS = 10_000
export const AVAILABILITY_MAX_AGE_MS = 20_000
export const AVAILABILITY_TIMEOUT_MS = 5_000
export const AVAILABILITY_BATCH_SIZE = 100

const messages: Record<SceneAvailabilityCode, string> = {
  CHECKING: 'Checking whether this scene can play…',
  AVAILABLE: '',
  SCENE_DISABLED: 'This scene is currently unavailable.',
  SCENE_NOT_FOUND: 'This scene is no longer available.',
  SCENE_UPGRADE_REQUIRED: 'This scene needs an update from its creator before it can play.',
  BUILDER_RENDERING_UNAVAILABLE: 'Builder scene playback is not available yet.',
  CUSTOM_RENDERING_DISABLED: 'Scene playback is temporarily disabled.',
  STATUS_UNAVAILABLE: 'Playback is paused until scene availability can be checked.',
}

const snapshot = (code: SceneAvailabilityCode, checkedAt: number | null = null): SceneAvailabilitySnapshot => ({
  allowed: code === 'AVAILABLE', code, message: messages[code], checkedAt,
})
const checking = snapshot('CHECKING')
const unavailable = snapshot('STATUS_UNAVAILABLE')
const localTemplate = snapshot('AVAILABLE')
const localBuilder = snapshot('AVAILABLE')

function sceneId(target: SceneAvailabilityTarget): number | null {
  const id = typeof target === 'number' ? target
    : /^(template|status):[1-9]\d*$/.test(target) ? Number(target.slice(target.indexOf(':') + 1)) : NaN
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function isTarget(target: SceneAvailabilityTarget) {
  return target === 'custom' || target === 'draft-template' || target === 'draft-builder' || sceneId(target) !== null
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function globalCode(value: unknown): SceneAvailabilityCode {
  if (!record(value)) throw new Error('Invalid availability response')
  if (value.enabled === true && value.code === 'AVAILABLE') return 'AVAILABLE'
  if (value.enabled === false && value.code === 'CUSTOM_RENDERING_DISABLED') return 'CUSTOM_RENDERING_DISABLED'
  throw new Error('Invalid availability response')
}

function sceneCodes(value: unknown, ids: number[]) {
  if (!Array.isArray(value) || value.length !== ids.length) throw new Error('Invalid availability response')
  const result = new Map<number, SceneAvailabilityCode>()
  const requested = new Set(ids)
  for (const item of value) {
    if (!record(item) || typeof item.sceneId !== 'number' || !requested.has(item.sceneId) || result.has(item.sceneId)) {
      throw new Error('Invalid availability response')
    }
    if (item.available === true && item.code === 'AVAILABLE') result.set(item.sceneId, 'AVAILABLE')
    else if (item.available === false && ['SCENE_DISABLED', 'SCENE_NOT_FOUND', 'SCENE_UPGRADE_REQUIRED', 'BUILDER_RENDERING_UNAVAILABLE', 'CUSTOM_RENDERING_DISABLED'].includes(String(item.code))) {
      result.set(item.sceneId, item.code as SceneAvailabilityCode)
    } else throw new Error('Invalid availability response')
  }
  return result
}

/** Live permissions are memory-only. Template targets require full host-side validation. */
export function createSceneAvailabilityStore() {
  const listeners = new Map<SceneAvailabilityTarget, Set<() => void>>()
  const scenes = new Map<number, SceneAvailabilitySnapshot>()
  const memo = new Map<SceneAvailabilityTarget, SceneAvailabilitySnapshot>()
  const pending = new Set<SceneAvailabilityTarget>()
  let global = checking
  let generation = 0
  let work: Promise<void> | null = null
  let controller: AbortController | null = null
  let activeTargets = new Set<SceneAvailabilityTarget>()
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let expiryTimer: ReturnType<typeof setTimeout> | null = null
  let attached = false
  let pageHidden = false
  let disposed = false

  const reachable = () => !disposed && !pageHidden && navigator.onLine !== false && document.visibilityState !== 'hidden'
  const fresh = (state: SceneAvailabilitySnapshot) => state.checkedAt !== null && Date.now() - state.checkedAt >= 0 && Date.now() - state.checkedAt < AVAILABILITY_MAX_AGE_MS

  function getSnapshot(target: SceneAvailabilityTarget): SceneAvailabilitySnapshot {
    let result: SceneAvailabilitySnapshot
    if (!isTarget(target) || disposed || pageHidden || navigator.onLine === false) result = unavailable
    // Hidden pages cannot execute, but can retain their paused resources until a
    // fresh visible-page check. Offline/navigation failures still revoke them.
    else if (document.visibilityState === 'hidden') result = checking
    else if (target === 'draft-template') result = localTemplate
    else if (target === 'draft-builder') result = localBuilder
    else if (typeof target === 'string' && (target.startsWith('template:') || target.startsWith('status:'))) {
      const scene = scenes.get(sceneId(target)!)
      result = !scene ? checking : !fresh(scene) ? unavailable : scene
    }
    else if (global.code === 'CHECKING') result = checking
    else if (!fresh(global)) result = unavailable
    else if (!global.allowed || target === 'custom') result = global
    else {
      const scene = scenes.get(sceneId(target)!)
      if (!scene) result = checking
      else if (!fresh(scene)) result = unavailable
      else result = snapshot(scene.code, Math.min(scene.checkedAt!, global.checkedAt!))
    }
    const previous = memo.get(target)
    if (previous?.code === result.code && previous.checkedAt === result.checkedAt) return previous
    memo.set(target, result)
    return result
  }

  function emit() {
    for (const group of listeners.values()) for (const listener of [...group]) listener()
    scheduleExpiry()
  }

  function scheduleExpiry() {
    if (expiryTimer !== null) clearTimeout(expiryTimer)
    expiryTimer = null
    const times = [...listeners.keys()].map(getSnapshot).filter((state) => state.allowed && state.checkedAt !== null)
    if (!times.length) return
    const expires = Math.min(...times.map((state) => state.checkedAt! + AVAILABILITY_MAX_AGE_MS))
    expiryTimer = setTimeout(emit, Math.max(1, expires - Date.now()))
  }

  async function fetchJson(path: string, signal: AbortSignal): Promise<unknown> {
    const response = await fetch(buildApiUrl(path), { cache: 'no-store', credentials: 'omit', signal })
    if (!response.ok) throw new Error('Availability request failed')
    return response.json()
  }

  async function cycle(targets: Set<SceneAvailabilityTarget>) {
    const startedAt = Date.now()
    const version = generation
    const abort = new AbortController()
    controller = abort
    activeTargets = targets
    const ids = [...new Set([...targets].map(sceneId).filter((id): id is number => id !== null))]
    const requiresGlobal = [...targets].some(target => target === 'custom' || typeof target === 'number')
    const batches: number[][] = []
    for (let offset = 0; offset < ids.length; offset += AVAILABILITY_BATCH_SIZE) batches.push(ids.slice(offset, offset + AVAILABILITY_BATCH_SIZE))
    let timeout: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    // The deadline also works with a stalled body or a transport that ignores AbortSignal.
    const deadline = new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error('Availability request cancelled'))
      abort.signal.addEventListener('abort', onAbort, { once: true })
      timeout = setTimeout(() => abort.abort(), AVAILABILITY_TIMEOUT_MS)
    })
    try {
      const load = async () => {
        const nextScenes = new Map<number, SceneAvailabilityCode>()
        let nextBatch = 0
        const worker = async () => {
          while (nextBatch < batches.length && !abort.signal.aborted) {
            const batch = batches[nextBatch++]
            const codes = sceneCodes(await fetchJson(`/scene-availability?ids=${batch.join(',')}`, abort.signal), batch)
            for (const [id, code] of codes) nextScenes.set(id, code)
          }
        }
        const [nextGlobal] = await Promise.all([
          requiresGlobal ? fetchJson('/rendering-status', abort.signal).then(globalCode) : Promise.resolve(null),
          ...Array.from({ length: Math.min(2, batches.length) }, worker),
        ])
        return { nextGlobal, nextScenes }
      }
      const { nextGlobal, nextScenes } = await Promise.race([load(), deadline])
      if (version !== generation || abort.signal.aborted || !reachable()) return
      // Use request start time, not completion time, so a slow response cannot extend a stale permission.
      if (nextGlobal !== null) global = snapshot(nextGlobal, startedAt)
      for (const [id, code] of nextScenes) scenes.set(id, snapshot(code, startedAt))
      emit()
    } catch {
      if (version !== generation) return
      if (requiresGlobal) global = snapshot('STATUS_UNAVAILABLE', Date.now())
      for (const id of ids) scenes.set(id, unavailable)
      emit()
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
      if (onAbort) abort.signal.removeEventListener('abort', onAbort)
      abort.abort()
      if (controller === abort) controller = null
      activeTargets = new Set()
    }
  }

  function queue(targets: Iterable<SceneAvailabilityTarget>): Promise<void> {
    if (!reachable()) return Promise.resolve()
    for (const target of targets) if (target !== 'draft-template' && target !== 'draft-builder' && isTarget(target) && !activeTargets.has(target)) pending.add(target)
    if (!work) {
      work = Promise.resolve().then(async () => {
        while (pending.size && reachable()) {
          const targets = new Set(pending)
          pending.clear()
          await cycle(targets)
        }
      }).finally(() => { work = null })
    }
    // A caller can enqueue between the drain finishing and its finalizer running.
    // Keep that caller waiting until the newly queued IDs have also been checked.
    return work.then(() => pending.size && reachable() ? queue([]) : undefined)
  }

  function revoke() {
    generation++
    controller?.abort()
    activeTargets.clear()
    pending.clear()
    global = checking
    scenes.clear()
    emit()
  }

  function refresh() {
    return queue(listeners.keys())
  }

  function invalidate(target?: number) {
    // Revoke every live saved/custom permission atomically on an operator change.
    revoke()
    if (target !== undefined && isTarget(target)) pending.add(target)
    void refresh()
  }

  function resume() {
    pageHidden = false
    invalidate()
  }
  function suspend() {
    revoke()
  }
  function hidePage() {
    pageHidden = true
    revoke()
  }
  function visibility() {
    if (document.visibilityState === 'hidden') suspend()
    else resume()
  }
  function attach() {
    if (attached) return
    attached = true
    window.addEventListener('online', resume)
    window.addEventListener('offline', suspend)
    window.addEventListener('focus', resume)
    window.addEventListener('pageshow', resume)
    window.addEventListener('pagehide', hidePage)
    document.addEventListener('visibilitychange', visibility)
    pollTimer = setInterval(() => { void refresh() }, AVAILABILITY_POLL_MS)
  }
  function detach() {
    if (!attached) return
    attached = false
    window.removeEventListener('online', resume)
    window.removeEventListener('offline', suspend)
    window.removeEventListener('focus', resume)
    window.removeEventListener('pageshow', resume)
    window.removeEventListener('pagehide', hidePage)
    document.removeEventListener('visibilitychange', visibility)
    if (pollTimer !== null) clearInterval(pollTimer)
    if (expiryTimer !== null) clearTimeout(expiryTimer)
    pollTimer = null
    expiryTimer = null
    generation++
    controller?.abort()
    pending.clear()
    activeTargets.clear()
  }

  function subscribe(target: SceneAvailabilityTarget, listener: () => void) {
    if (disposed || !isTarget(target)) return () => {}
    const alreadyTracked = listeners.has(target)
    const group = listeners.get(target) ?? new Set<() => void>()
    group.add(listener)
    listeners.set(target, group)
    attach()
    if (!alreadyTracked) void queue([target])
    scheduleExpiry()
    return () => {
      group.delete(listener)
      if (!group.size) listeners.delete(target)
      if (!listeners.size) detach()
      else scheduleExpiry()
    }
  }

  async function check(target: SceneAvailabilityTarget) {
    if (disposed || !isTarget(target) || !reachable()) return unavailable
    if (target === 'draft-template') return getSnapshot(target)
    const unsubscribe = subscribe(target, () => {})
    try {
      await queue([target])
      return getSnapshot(target)
    } finally { unsubscribe() }
  }

  return {
    subscribe,
    getSnapshot,
    isAllowed: (target: SceneAvailabilityTarget) => getSnapshot(target).allowed,
    check,
    refresh,
    invalidate,
    dispose: () => {
      disposed = true
      revoke()
      detach()
      listeners.clear()
      memo.clear()
    },
  }
}

export const sceneAvailabilityStore = createSceneAvailabilityStore()

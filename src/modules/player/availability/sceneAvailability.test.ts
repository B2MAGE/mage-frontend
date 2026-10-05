import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AVAILABILITY_MAX_AGE_MS, AVAILABILITY_POLL_MS, AVAILABILITY_TIMEOUT_MS, createSceneAvailabilityStore } from './sceneAvailability'

const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 })
const global = (enabled = true) => ({ enabled, code: enabled ? 'AVAILABLE' : 'CUSTOM_RENDERING_DISABLED', message: 'private operator reason must never be shown' })
const scene = (sceneId: number, code = 'AVAILABLE') => ({ sceneId, available: code === 'AVAILABLE', code, message: 'private operator reason must never be shown' })
const idsIn = (url: string) => new URL(url, 'http://localhost').searchParams.get('ids')!.split(',').map(Number)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('shared live scene availability', () => {
  let store: ReturnType<typeof createSceneAvailabilityStore>
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'))
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      return json(url.includes('rendering-status') ? global() : idsIn(url).map((id) => scene(id)))
    })
    vi.stubGlobal('fetch', fetchMock)
    store = createSceneAvailabilityStore()
  })

  afterEach(() => {
    store.dispose()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fails closed before verification and shares one batch for duplicate listeners and checks', async () => {
    expect(store.isAllowed(7)).toBe(false)
    const release1 = store.subscribe(7, vi.fn())
    const release2 = store.subscribe(7, vi.fn())
    const [first, second] = await Promise.all([store.check(7), store.check(7)])
    expect(first.allowed).toBe(true)
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['/api/rendering-status', '/api/scene-availability?ids=7'])
    for (const [, options] of fetchMock.mock.calls) expect(options).toMatchObject({ cache: 'no-store', credentials: 'omit', signal: expect.any(AbortSignal) })
    release1()
    await vi.advanceTimersByTimeAsync(AVAILABILITY_POLL_MS)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    release2()
    await vi.advanceTimersByTimeAsync(AVAILABILITY_POLL_MS)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('checks fresh status again even if the cached permission is still recent', async () => {
    expect((await store.check(3)).allowed).toBe(true)
    expect((await store.check(3)).allowed).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('does not refetch just because another subscriber mounts for an already tracked scene', async () => {
    store.subscribe(3, vi.fn())
    await store.check(3)
    store.subscribe(3, vi.fn())
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('requires the global switch for unsaved custom previews without requesting a scene ID', async () => {
    fetchMock.mockResolvedValue(json(global(false)))
    const result = await store.check('custom')
    expect(result).toMatchObject({ allowed: false, code: 'CUSTOM_RENDERING_DISABLED', message: 'Scene playback is temporarily disabled.' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('lets validated draft templates preview locally while retaining offline/page lifecycle stops', async () => {
    fetchMock.mockRejectedValue(new Error('Unavailable backend'))
    store.subscribe('draft-template', vi.fn())
    expect((await store.check('draft-template')).allowed).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    expect(store.isAllowed('draft-template')).toBe(false)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    expect(store.isAllowed('draft-template')).toBe(true)
    window.dispatchEvent(new PageTransitionEvent('pagehide'))
    expect(store.isAllowed('draft-template')).toBe(false)
  })

  it('requires fresh per-scene verification for saved templates without the custom switch', async () => {
    fetchMock.mockImplementation(async input => json(String(input).includes('rendering-status') ? global(false) : [scene(47)]))
    expect(store.isAllowed('template:47')).toBe(false)
    store.subscribe('template:47', vi.fn())
    expect((await store.check('template:47')).allowed).toBe(true)
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['/api/scene-availability?ids=47'])
    expect((await store.check(47)).allowed).toBe(false)
    expect(store.isAllowed('template:47')).toBe(true)
    vi.setSystemTime(Date.now() + AVAILABILITY_MAX_AGE_MS)
    expect(store.isAllowed('template:47')).toBe(false)
  })

  it('keeps builder drafts unavailable even with custom playback enabled', async () => {
    store.subscribe('draft-builder', vi.fn())
    expect(await store.check('draft-builder')).toMatchObject({ allowed: false, code: 'BUILDER_RENDERING_UNAVAILABLE',
      message: 'Builder scene playback is not available yet.' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['SCENE_DISABLED', 'SCENE_NOT_FOUND', 'SCENE_UPGRADE_REQUIRED', 'BUILDER_RENDERING_UNAVAILABLE', 'CUSTOM_RENDERING_DISABLED'])('respects saved template denial %s without upgrading draft replacements', async code => {
    fetchMock.mockResolvedValue(json([scene(47, code)]))
    expect(await store.check('template:47')).toMatchObject({ allowed: false, code })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('revokes saved template permission immediately on focus and failed status checks', async () => {
    store.subscribe('template:47', vi.fn())
    await store.check('template:47')
    fetchMock.mockRejectedValue(new Error('Network lost'))
    window.dispatchEvent(new Event('focus'))
    expect(store.isAllowed('template:47')).toBe(false)
    expect(await store.check('template:47')).toMatchObject({ allowed: false, code: 'STATUS_UNAVAILABLE' })
  })

  it('shares one saved-ID query across template, custom, and metadata-only targets', async () => {
    const result = await Promise.all([store.check('template:47'), store.check(47), store.check('status:47')])
    expect(result.every(status => status.allowed)).toBe(true)
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['/api/rendering-status', '/api/scene-availability?ids=47'])
  })

  it('uses per-ID status to restore omitted source without granting custom rendering permission', async () => {
    fetchMock.mockImplementation(async input => json(String(input).includes('rendering-status') ? global(false) : [scene(47)]))
    expect((await store.check('status:47')).allowed).toBe(true)
    expect(store.isAllowed(47)).toBe(false)
    expect((await store.check(47)).allowed).toBe(false)
  })

  it('keeps legacy scenes unavailable until the server verifies an explicit upgrade', async () => {
    fetchMock.mockImplementation(async input => json(String(input).includes('rendering-status')
      ? global() : [scene(23, 'SCENE_UPGRADE_REQUIRED')]))
    expect(await store.check(23)).toMatchObject({ allowed: false, code: 'SCENE_UPGRADE_REQUIRED',
      message: 'This scene needs an update from its creator before it can play.' })
    expect(store.isAllowed(23)).toBe(false)
    fetchMock.mockImplementation(async input => json(String(input).includes('rendering-status') ? global() : [scene(23)]))
    expect((await store.check(23)).allowed).toBe(true)
  })

  it('stops active scenes when a poll sees a per-scene disable and can re-enable after a fresh poll', async () => {
    const listener = vi.fn()
    store.subscribe(9, listener)
    await store.check(9)
    let disabled = true
    fetchMock.mockImplementation(async (input) => json(String(input).includes('rendering-status') ? global() : [scene(9, disabled ? 'SCENE_DISABLED' : 'AVAILABLE')]))
    await vi.advanceTimersByTimeAsync(AVAILABILITY_POLL_MS)
    expect(store.getSnapshot(9)).toMatchObject({ allowed: false, code: 'SCENE_DISABLED', message: 'This scene is currently unavailable.' })
    expect(listener).toHaveBeenCalled()
    disabled = false
    await vi.advanceTimersByTimeAsync(AVAILABILITY_POLL_MS)
    expect(store.isAllowed(9)).toBe(true)
  })

  it('revokes every scene if the global switch changes, despite available individual statuses', async () => {
    store.subscribe(1, vi.fn())
    store.subscribe(2, vi.fn())
    await store.check(1)
    fetchMock.mockImplementation(async (input) => json(String(input).includes('rendering-status') ? global(false) : idsIn(String(input)).map((id) => scene(id))))
    await vi.advanceTimersByTimeAsync(AVAILABILITY_POLL_MS)
    expect(store.getSnapshot(1).code).toBe('CUSTOM_RENDERING_DISABLED')
    expect(store.isAllowed(2)).toBe(false)
  })

  it('fails closed on network errors, non-OK responses, and malformed status contracts', async () => {
    for (const outcome of [() => Promise.reject(new Error('network')), () => Promise.resolve(new Response('no', { status: 503 })), () => Promise.resolve(json({ enabled: true, code: 'CUSTOM_RENDERING_DISABLED' }))]) {
      fetchMock.mockImplementation(outcome)
      expect((await store.check(5)).code).toBe('STATUS_UNAVAILABLE')
      expect(store.isAllowed(5)).toBe(false)
    }
  })

  it.each([
    { payload: [] }, { payload: [scene(5), scene(5)] }, { payload: [scene(99)] },
    { payload: [{ sceneId: 5, available: true, code: 'SCENE_DISABLED' }] },
    { payload: [{ sceneId: 5, available: true, code: 'unrecognized' }] },
  ])('rejects missing, duplicate, unrelated, or inconsistent scene rows: $payload', async ({ payload }) => {
    fetchMock.mockImplementation(async (input) => json(String(input).includes('rendering-status') ? global() : payload))
    expect((await store.check(5)).code).toBe('STATUS_UNAVAILABLE')
  })

  it('ignores local storage and client-provided template metadata, and rejects invalid scene IDs', async () => {
    localStorage.setItem('mage:availability', JSON.stringify({ enabled: true, sceneId: 1 }))
    expect(store.isAllowed(1)).toBe(false)
    for (const id of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) expect((await store.check(id)).allowed).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    localStorage.removeItem('mage:availability')
  })

  it('revokes immediately offline and only resumes after successful online verification', async () => {
    store.subscribe(2, vi.fn())
    await store.check(2)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    expect(store.isAllowed(2)).toBe(false)
    const calls = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(AVAILABILITY_POLL_MS)
    expect(fetchMock).toHaveBeenCalledTimes(calls)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    expect(store.isAllowed(2)).toBe(false)
    await store.check(2)
    expect(store.isAllowed(2)).toBe(true)
  })

  it.each(['focus', 'pageshow'])('revokes on %s before rechecking, including cached status', async (event) => {
    store.subscribe(2, vi.fn())
    await store.check(2)
    window.dispatchEvent(new Event(event))
    expect(store.isAllowed(2)).toBe(false)
    await store.check(2)
    expect(store.isAllowed(2)).toBe(true)
  })

  it('suspends on hidden/pagehide and rechecks when visible/pageshow', async () => {
    store.subscribe(2, vi.fn())
    await store.check(2)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(store.isAllowed(2)).toBe(false)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(store.isAllowed(2)).toBe(false)
    await store.check(2)
    expect(store.isAllowed(2)).toBe(true)
    window.dispatchEvent(new Event('pagehide'))
    expect(store.isAllowed(2)).toBe(false)
    window.dispatchEvent(new Event('pageshow'))
    expect(store.isAllowed(2)).toBe(false)
    await store.check(2)
    expect(store.isAllowed(2)).toBe(true)
  })

  it('synchronous permission expires even when a suspended tab has not run any timers', async () => {
    store.subscribe(2, vi.fn())
    await store.check(2)
    vi.setSystemTime(Date.now() + AVAILABILITY_MAX_AGE_MS)
    expect(store.isAllowed(2)).toBe(false)
    expect(store.getSnapshot(2).code).toBe('STATUS_UNAVAILABLE')
  })

  it('keeps a hidden saved template non-executable until fresh approval, but treats offline as failure', async () => {
    store.subscribe('template:2', vi.fn())
    await store.check('template:2')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(store.getSnapshot('template:2').code).toBe('CHECKING')
    await vi.advanceTimersByTimeAsync(AVAILABILITY_MAX_AGE_MS * 2)
    expect(store.getSnapshot('template:2')).toMatchObject({ code: 'CHECKING', allowed: false })
    expect(fetchMock).toHaveBeenCalledOnce()
    const next = deferred<Response>()
    fetchMock.mockReturnValue(next.promise)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(store.isAllowed('template:2')).toBe(false)
    const checked = store.check('template:2')
    next.resolve(json([scene(2)]))
    expect((await checked).allowed).toBe(true)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    expect(store.getSnapshot('template:2').code).toBe('STATUS_UNAVAILABLE')
  })

  it('starts the freshness window when the request starts, not when a delayed response arrives', async () => {
    const begunAt = Date.now()
    const response = deferred<Response>()
    fetchMock.mockReturnValue(response.promise)
    const checked = store.check('custom')
    await vi.advanceTimersByTimeAsync(4_000)
    response.resolve(json(global()))
    expect((await checked).checkedAt).toBe(begunAt)
    vi.setSystemTime(begunAt + AVAILABILITY_MAX_AGE_MS)
    expect(store.isAllowed('custom')).toBe(false)
  })

  it('fails closed if the system clock moves backward', async () => {
    await store.check(2)
    vi.setSystemTime(Date.now() - 1)
    expect(store.isAllowed(2)).toBe(false)
  })

  it('times out stalled fetches, aborts them, and never accepts their late results', async () => {
    const response = deferred<Response>()
    fetchMock.mockReturnValue(response.promise)
    store.subscribe('custom', vi.fn())
    const checked = store.check('custom')
    await vi.advanceTimersByTimeAsync(AVAILABILITY_TIMEOUT_MS)
    expect((await checked).allowed).toBe(false)
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
    response.resolve(json(global()))
    await Promise.resolve()
    expect(store.isAllowed('custom')).toBe(false)
  })

  it('ignores an old successful reply after operator invalidation and a newer disabled response', async () => {
    const old = deferred<Response>()
    fetchMock.mockReturnValueOnce(old.promise)
    store.subscribe('custom', vi.fn())
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockResolvedValue(json(global(false)))
    store.invalidate()
    expect(store.isAllowed('custom')).toBe(false)
    await store.check('custom')
    expect(store.getSnapshot('custom').code).toBe('CUSTOM_RENDERING_DISABLED')
    old.resolve(json(global()))
    await Promise.resolve()
    expect(store.getSnapshot('custom').code).toBe('CUSTOM_RENDERING_DISABLED')
  })

  it('atomically revokes all active permissions while a scene mutation is rechecked', async () => {
    store.subscribe(1, vi.fn())
    store.subscribe(2, vi.fn())
    await store.check(1)
    store.invalidate(1)
    expect(store.isAllowed(1)).toBe(false)
    expect(store.isAllowed(2)).toBe(false)
    await store.check(2)
    expect(store.isAllowed(1)).toBe(true)
    expect(store.isAllowed(2)).toBe(true)
  })

  it('chunks large collections at 100 IDs and bounds concurrent scene requests to two', async () => {
    let active = 0
    let maximumActive = 0
    const pendingBatches: Array<{ ids: number[], response: ReturnType<typeof deferred<Response>> }> = []
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('rendering-status')) return json(global())
      active++
      maximumActive = Math.max(maximumActive, active)
      const response = deferred<Response>()
      pendingBatches.push({ ids: idsIn(url), response })
      try { return await response.promise } finally { active-- }
    })
    for (let id = 1; id <= 251; id++) store.subscribe(id, vi.fn())
    const checked = store.check(251)
    await Promise.resolve()
    expect(pendingBatches).toHaveLength(2)
    expect(pendingBatches.map((batch) => batch.ids.length)).toEqual([100, 100])
    pendingBatches[0].response.resolve(json(pendingBatches[0].ids.map((id) => scene(id))))
    await vi.advanceTimersByTimeAsync(1)
    expect(pendingBatches).toHaveLength(3)
    expect(pendingBatches[2].ids).toHaveLength(51)
    for (const batch of pendingBatches.slice(1)) batch.response.resolve(json(batch.ids.map((id) => scene(id))))
    expect((await checked).allowed).toBe(true)
    expect(maximumActive).toBe(2)
    expect(new Set(pendingBatches.flatMap((batch) => batch.ids)).size).toBe(251)
  })

  it('queues newly subscribed IDs behind the current bounded cycle', async () => {
    const old = deferred<Response>()
    fetchMock.mockReturnValueOnce(old.promise)
    store.subscribe(1, vi.fn())
    await Promise.resolve()
    const checked = store.check(2)
    old.resolve(json(global()))
    expect((await checked).allowed).toBe(true)
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/rendering-status', '/api/scene-availability?ids=1',
      '/api/rendering-status', '/api/scene-availability?ids=2',
    ])
  })

  it('aborts in-flight requests and removes polling when the last subscriber leaves', async () => {
    const response = deferred<Response>()
    fetchMock.mockReturnValue(response.promise)
    const release = store.subscribe('custom', vi.fn())
    await Promise.resolve()
    const signal = fetchMock.mock.calls[0][1]?.signal
    release()
    expect(signal?.aborted).toBe(true)
    response.resolve(json(global()))
    await vi.advanceTimersByTimeAsync(AVAILABILITY_POLL_MS * 2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.isAllowed('custom')).toBe(false)
  })

  it('does not restore permissions or restart polling after disposal', async () => {
    const response = deferred<Response>()
    fetchMock.mockReturnValue(response.promise)
    store.subscribe('custom', vi.fn())
    await Promise.resolve()
    store.dispose()
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
    response.resolve(json(global()))
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(AVAILABILITY_POLL_MS * 2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await store.check('custom')).allowed).toBe(false)
  })
})

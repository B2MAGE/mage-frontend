import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MagePlayerController } from './engineAdapter'

const engine = vi.hoisted(() => ({
  initMAGE: vi.fn(), start: vi.fn(), pause: vi.fn(), play: vi.fn(), dispose: vi.fn(),
  loadPreset: vi.fn(), loadAudio: vi.fn(), unloadAudio: vi.fn(), isAudioLoaded: vi.fn(),
  seek: vi.fn(), getAudioDuration: vi.fn(), getEngineTime: vi.fn(), setEngineTime: vi.fn(),
  setSyntheticPreview: vi.fn(), setAudioResponseMode: vi.fn(), setAudioResponseConfig: vi.fn(),
  captureFramePreview: vi.fn(),
}))
const recovery = vi.hoisted(() => ({
  begin: vi.fn(), dispose: vi.fn(), fail: vi.fn(), block: vi.fn(), revokeRetry: vi.fn(),
  getBlock: vi.fn(), getAutomaticBlock: vi.fn(), isSafeMode: vi.fn(),
}))

vi.mock('@notrac/mage', () => ({ initMAGE: engine.initMAGE }))
vi.mock('../recovery/sceneRecovery', () => ({
  sceneRecoveryKey: (_scene: unknown, id?: string | number) => `recovery:${id ?? 'custom'}`,
  sceneRecovery: recovery,
}))
vi.mock('../recovery/renderRecoveryMonitor', () => ({
  monitorSceneRendering: () => ({ dispose: vi.fn(), setPaused: vi.fn() }),
}))

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const source = { visualizer: { shader: 'sphere(1);' } }
const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

describe('engine availability boundary with the real polling store', () => {
  let store: (typeof import('../availability/sceneAvailability'))['sceneAvailabilityStore']
  let createMagePlayer: (typeof import('./engineAdapter'))['createMagePlayer']
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
  let enabled: boolean
  let disabledIds: Set<number>
  let players: MagePlayerController[]

  async function create(options?: Parameters<typeof createMagePlayer>[1]) {
    const player = await createMagePlayer(document.createElement('canvas'), options)
    players.push(player)
    return player
  }

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'))
    vi.resetModules()
    vi.resetAllMocks()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    enabled = true
    disabledIds = new Set()
    players = []
    engine.initMAGE.mockReturnValue(engine)
    engine.loadPreset.mockReturnValue(source)
    engine.getAudioDuration.mockReturnValue(120)
    engine.getEngineTime.mockReturnValue(1)
    engine.isAudioLoaded.mockReturnValue(false)
    engine.captureFramePreview.mockResolvedValue('data:image/png;base64,frame')
    recovery.begin.mockImplementation(() => ({ dispose: recovery.dispose, fail: recovery.fail }))
    recovery.getBlock.mockReturnValue(null)
    recovery.getAutomaticBlock.mockReturnValue(null)
    recovery.isSafeMode.mockReturnValue(false)
    fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname.endsWith('rendering-status')) return json({ enabled, code: enabled ? 'AVAILABLE' : 'CUSTOM_RENDERING_DISABLED' })
      return json(url.searchParams.get('ids')!.split(',').map(Number).map((sceneId) => ({
        sceneId, available: !disabledIds.has(sceneId), code: disabledIds.has(sceneId) ? 'SCENE_DISABLED' : 'AVAILABLE',
      })))
    })
    vi.stubGlobal('fetch', fetchMock)
    ;({ sceneAvailabilityStore: store } = await import('../availability/sceneAvailability'))
    ;({ createMagePlayer } = await import('./engineAdapter'))
    window.dispatchEvent(new PageTransitionEvent('pageshow'))
  })

  afterEach(() => {
    for (const player of players) player.dispose()
    store.dispose()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not initialize or compile an engine before the initial live check completes', async () => {
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    const creating = create({ sceneKey: 47 })
    await vi.advanceTimersByTimeAsync(0)
    expect(engine.initMAGE).not.toHaveBeenCalled()
    expect(engine.loadPreset).not.toHaveBeenCalled()
    pending.resolve(json({ enabled: true, code: 'AVAILABLE' }))
    const player = await creating
    player.loadSceneBlob(source)
    expect(engine.initMAGE).toHaveBeenCalledTimes(1)
    expect(engine.loadPreset).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['/api/rendering-status', '/api/scene-availability?ids=47'])
  })

  it('ignores a superseded initial response when focus forces another check before engine creation', async () => {
    const first = deferred<Response>()
    const fresh = deferred<Response>()
    fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(fresh.promise)
    const creating = create({ sceneKey: 47, initialSceneBlob: template })
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    first.resolve(json([{ sceneId: 47, available: true, code: 'AVAILABLE' }]))
    await vi.advanceTimersByTimeAsync(0)
    expect(engine.initMAGE).not.toHaveBeenCalled()
    expect(engine.loadPreset).not.toHaveBeenCalled()
    fresh.resolve(json([{ sceneId: 47, available: true, code: 'AVAILABLE' }]))
    const player = await creating
    player.loadSceneBlob(template)
    expect(engine.initMAGE).toHaveBeenCalledOnce()
    expect(engine.loadPreset).toHaveBeenCalledOnce()
  })

  it('plays, resets, and captures a validated unsaved template with custom rendering disabled', async () => {
    enabled = false
    const player = await create({ initialSceneBlob: template })
    player.loadSceneBlob(template)
    expect(engine.loadPreset.mock.lastCall?.[0]).toHaveProperty('visualizer.shader')
    player.resetPlayback()
    player.setPlaybackState('playing')
    await expect(player.captureFramePreview!()).resolves.toBe('data:image/png;base64,frame')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(engine.loadPreset).toHaveBeenCalledTimes(2)
  })

  it('verifies saved template status while custom rendering is disabled and stops on scene disable', async () => {
    enabled = false
    const player = await create({ sceneKey: 47, initialSceneBlob: template })
    player.loadSceneBlob(template)
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['/api/scene-availability?ids=47'])
    expect(recovery.begin).toHaveBeenCalledWith('recovery:47')
    disabledIds.add(47)
    await vi.advanceTimersByTimeAsync(10000)
    expect(engine.dispose).toHaveBeenCalledOnce()
    expect(recovery.revokeRetry).toHaveBeenCalledWith('recovery:47')
    expect(() => player.resetPlayback()).toThrow()
    expect(() => player.setPlaybackState('playing')).toThrow()
  })

  it.each(['disabled', 'network'])('does not allocate a saved template engine when its status is %s', async reason => {
    enabled = false
    if (reason === 'disabled') disabledIds.add(47)
    else fetchMock.mockRejectedValue(new Error('Offline'))
    await expect(create({ sceneKey: 47, initialSceneBlob: template })).rejects.toThrow()
    expect(engine.initMAGE).not.toHaveBeenCalled()
    expect(recovery.begin).not.toHaveBeenCalled()
  })

  it('does not inherit template permission through mode changes, raw matching source, or recovery identity', async () => {
    enabled = false
    const player = await create({ initialSceneBlob: template })
    player.loadSceneBlob(template)
    const resolvedSource = engine.loadPreset.mock.lastCall![0]
    for (const candidate of [source, resolvedSource, { schemaVersion: 1, kind: 'custom', scene: source }, { ...template, source: 'sphere(1);' }]) {
      expect(() => player.loadSceneBlob(candidate, { recoverySceneBlob: template })).toThrow()
      expect(() => player.updateRecoveryIdentity!(candidate, { recoverySceneBlob: template })).toThrow()
    }
    expect(engine.loadPreset).toHaveBeenCalledOnce()
    await expect(create({ initialSceneBlob: resolvedSource })).rejects.toThrow()
    expect(engine.initMAGE).toHaveBeenCalledOnce()
  })

  it('revalidates source changed while saved template authorization is in flight', async () => {
    enabled = false
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    const changing: Record<string, unknown> = { ...template }
    const creation = create({ sceneKey: 47, initialSceneBlob: changing })
    await vi.advanceTimersByTimeAsync(0)
    Object.assign(changing, { visualizer: { shader: 'sphere(1);' } })
    pending.resolve(json([{ sceneId: 47, available: true, code: 'AVAILABLE' }]))
    const player = await creation
    expect(() => player.loadSceneBlob(changing)).toThrow()
    expect(engine.loadPreset).not.toHaveBeenCalled()
  })

  it('does not use a metadata-only status permission to allocate an empty custom controller', async () => {
    enabled = false
    expect((await store.check('status:47')).allowed).toBe(true)
    await expect(create({ sceneKey: 47 })).rejects.toThrow()
    await expect(create({ sceneKey: 'status:47' })).rejects.toThrow()
    expect(engine.initMAGE).not.toHaveBeenCalled()
  })

  it('rechecks saved template status before capture and discards revoked in-flight results', async () => {
    enabled = false
    const player = await create({ sceneKey: 47, initialSceneBlob: template })
    player.loadSceneBlob(template)
    const pending = deferred<string>()
    engine.captureFramePreview.mockReturnValue(pending.promise)
    const capture = player.captureFramePreview!().catch(() => null)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    disabledIds.add(47)
    store.invalidate(47)
    await store.check('template:47')
    pending.resolve('data:image/png;base64,late')
    await expect(capture).resolves.toBeNull()
    expect(engine.dispose).toHaveBeenCalledOnce()
  })

  it.each(['global', 'scene', 'network'])('does not initialize for a %s denial, even with cached source', async (kind) => {
    if (kind === 'global') enabled = false
    if (kind === 'scene') disabledIds.add(47)
    if (kind === 'network') fetchMock.mockRejectedValue(new Error('offline'))
    await expect(create({ sceneKey: 47 })).rejects.toThrow()
    expect(engine.initMAGE).not.toHaveBeenCalled()
    expect(recovery.begin).not.toHaveBeenCalled()
    expect(recovery.block).not.toHaveBeenCalled()
  })

  it('keeps the saved ID guard when load options are omitted and rejects a different ID', async () => {
    const player = await create({ sceneKey: 47 })
    player.loadSceneBlob(source)
    expect(recovery.begin).toHaveBeenCalledWith('recovery:47')
    expect(() => player.loadSceneBlob(source, { sceneKey: 48 })).toThrow()
    expect(engine.loadPreset).toHaveBeenCalledTimes(1)
  })

  it('stops a playing saved scene within 10 seconds of a server disable without marking it crashed', async () => {
    const player = await create({ sceneKey: 47 })
    player.loadSceneBlob(source)
    disabledIds.add(47)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(engine.dispose).toHaveBeenCalledTimes(1)
    expect(recovery.dispose).toHaveBeenCalledTimes(1)
    expect(recovery.revokeRetry).toHaveBeenCalledWith('recovery:47')
    expect(recovery.fail).not.toHaveBeenCalled()
    expect(recovery.block).not.toHaveBeenCalled()
    expect(() => player.setPlaybackState('playing')).toThrow()
    expect(() => player.resetPlayback()).toThrow()
    expect(() => player.loadSceneBlob(source)).toThrow()
  })

  it('stops custom editor previews through the global switch with no saved scene ID', async () => {
    const player = await create()
    player.loadSceneBlob(source)
    enabled = false
    await vi.advanceTimersByTimeAsync(10_000)
    expect(engine.dispose).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.every(([url]) => String(url) === '/api/rendering-status')).toBe(true)
  })

  it('deduplicates requests across simultaneous players and stops both on emergency disable', async () => {
    const [first, second] = await Promise.all([create({ sceneKey: 47 }), create({ sceneKey: 47 })])
    first.loadSceneBlob(source)
    second.loadSceneBlob(source)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    enabled = false
    await vi.advanceTimersByTimeAsync(10_000)
    expect(engine.dispose).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('stops within 15 seconds when the next status request stalls forever', async () => {
    const player = await create({ sceneKey: 47 })
    player.loadSceneBlob(source)
    fetchMock.mockReturnValue(new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(15_000)
    expect(engine.dispose).toHaveBeenCalledTimes(1)
    expect(recovery.fail).not.toHaveBeenCalled()
    expect(() => player.setPlaybackState('playing')).toThrow()
  })

  it('guards reset and playback synchronously when timers have not run after a long suspension', async () => {
    const player = await create({ sceneKey: 47 })
    player.loadSceneBlob(source)
    const compiled = engine.loadPreset.mock.calls.length
    const starts = engine.start.mock.calls.length
    vi.setSystemTime(Date.now() + 20_000)
    expect(() => player.resetPlayback()).toThrow()
    expect(() => player.setPlaybackState('playing')).toThrow()
    expect(engine.loadPreset).toHaveBeenCalledTimes(compiled)
    expect(engine.start).toHaveBeenCalledTimes(starts)
  })

  it('stops pending audio on invalidation and never resumes after audio finishes late', async () => {
    const player = await create({ sceneKey: 47 })
    player.loadSceneBlob(source)
    const loading = player.loadAudio({ sourcePath: '/music.mp3' }).then(() => 'loaded', () => 'cancelled')
    expect(engine.loadAudio).toHaveBeenCalledWith('/music.mp3')
    const playCalls = engine.play.mock.calls.length
    disabledIds.add(47)
    store.invalidate(47)
    await store.check(47)
    expect(engine.dispose).toHaveBeenCalledTimes(1)
    engine.isAudioLoaded.mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(50)
    expect(await loading).toBe('cancelled')
    expect(engine.play).toHaveBeenCalledTimes(playCalls)
  })

  it('refreshes availability before thumbnail capture, refusing a newly disabled scene', async () => {
    const player = await create({ sceneKey: 47 })
    player.loadSceneBlob(source)
    disabledIds.add(47)
    await expect(player.captureFramePreview!()).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(engine.captureFramePreview).not.toHaveBeenCalled()
    expect(engine.dispose).toHaveBeenCalledTimes(1)
  })

  it.each(['dispose', 'replacement', 'disable'])('discards a pending thumbnail after %s', async (change) => {
    const player = await create({ sceneKey: 47 })
    player.loadSceneBlob(source)
    const pending = deferred<string>()
    engine.captureFramePreview.mockReturnValue(pending.promise)
    const capturing = player.captureFramePreview!().catch(() => null)
    await vi.advanceTimersByTimeAsync(0)
    expect(engine.captureFramePreview).toHaveBeenCalledTimes(1)
    if (change === 'dispose') player.dispose()
    if (change === 'replacement') player.loadSceneBlob({ visualizer: { shader: 'box(1);' } })
    if (change === 'disable') store.invalidate(47)
    pending.resolve('data:image/png;base64,stale')
    expect(await capturing).toBeNull()
  })

  it.each(['custom', 'template'] as const)('suspends a playing saved %s on focus and resumes its engine, audio, and position after approval', async kind => {
    const scene = kind === 'template' ? template : source
    const target = kind === 'template' ? 'template:47' as const : 47
    const player = await create({ sceneKey: 47, initialSceneBlob: scene })
    player.loadSceneBlob(scene)
    engine.isAudioLoaded.mockReturnValue(true)
    await player.loadAudio({ sourcePath: '/music.mp3', sourceLabel: 'Current track' })
    player.seekAudio(42)
    const starting = engine.start.mock.calls.length
    const playing = engine.play.mock.calls.length
    const seeking = engine.seek.mock.calls.length
    const pending = deferred<Response>()
    fetchMock.mockImplementation(async input => String(input).includes('rendering-status')
      ? json({ enabled: true, code: 'AVAILABLE' }) : pending.promise)
    engine.pause.mockClear()

    window.dispatchEvent(new Event('focus'))
    expect(store.getSnapshot(target).code).toBe('CHECKING')
    expect(engine.pause).toHaveBeenCalledOnce()
    expect(engine.dispose).not.toHaveBeenCalled()
    expect(recovery.revokeRetry).not.toHaveBeenCalled()
    expect(player.getPlaybackState()).toBe('playing')
    await vi.advanceTimersByTimeAsync(1000)
    expect(player.getAudioState().currentTime).toBe(42)
    expect(() => player.loadSceneBlob(scene)).toThrow()
    expect(() => player.resetPlayback()).toThrow()
    expect(() => player.setPlaybackState('playing')).toThrow()
    await expect(player.loadAudio({ sourcePath: '/other.mp3' })).rejects.toThrow()
    await expect(player.captureFramePreview!()).rejects.toThrow()
    expect(engine.loadPreset).toHaveBeenCalledOnce()
    expect(engine.loadAudio).toHaveBeenCalledOnce()
    expect(engine.captureFramePreview).not.toHaveBeenCalled()
    expect(engine.start).toHaveBeenCalledTimes(starting)
    expect(engine.play).toHaveBeenCalledTimes(playing)

    pending.resolve(json([{ sceneId: 47, available: true, code: 'AVAILABLE' }]))
    await store.check(target)
    expect(engine.initMAGE).toHaveBeenCalledOnce()
    expect(engine.loadPreset).toHaveBeenCalledOnce()
    expect(engine.loadAudio).toHaveBeenCalledOnce()
    expect(engine.seek).toHaveBeenCalledTimes(seeking)
    expect(engine.play).toHaveBeenCalledTimes(playing + 1)
    expect(player.getAudioState()).toMatchObject({ currentTime: 42, isLoaded: true, sourcePath: 'Current track' })
    expect(engine.dispose).not.toHaveBeenCalled()
  })

  it('retains a deliberately paused scene and audio after a successful focus recheck', async () => {
    const player = await create({ sceneKey: 47, initialSceneBlob: template })
    player.loadSceneBlob(template)
    engine.isAudioLoaded.mockReturnValue(true)
    await player.loadAudio({ sourcePath: '/music.mp3' })
    player.seekAudio(31)
    player.setPlaybackState('paused')
    const playing = engine.play.mock.calls.length
    const starting = engine.start.mock.calls.length
    window.dispatchEvent(new Event('focus'))
    expect(engine.dispose).not.toHaveBeenCalled()
    await store.check('template:47')
    expect(player.getPlaybackState()).toBe('paused')
    expect(player.getAudioState().currentTime).toBe(31)
    expect(engine.play).toHaveBeenCalledTimes(playing)
    expect(engine.start).toHaveBeenCalledTimes(starting)
    expect(engine.initMAGE).toHaveBeenCalledOnce()
  })

  it.each(['timers running', 'timers suspended'] as const)('holds pending hidden audio with %s until the visible-page recheck', async timerState => {
    const player = await create({ sceneKey: 47, initialSceneBlob: template })
    player.loadSceneBlob(template)
    const completed = vi.fn()
    const loading = player.loadAudio({ sourcePath: '/music.mp3' }).then(completed)
    const playing = engine.play.mock.calls.length
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(store.getSnapshot('template:47').code).toBe('CHECKING')
    engine.isAudioLoaded.mockReturnValue(true)
    if (timerState === 'timers suspended') vi.setSystemTime(Date.now() + 60000)
    else await vi.advanceTimersByTimeAsync(6000)
    expect(completed).not.toHaveBeenCalled()
    expect(engine.play).toHaveBeenCalledTimes(playing)
    expect(engine.dispose).not.toHaveBeenCalled()
    expect(engine.loadAudio).toHaveBeenCalledOnce()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await store.check('template:47')
    await vi.advanceTimersByTimeAsync(50)
    await loading
    expect(completed).toHaveBeenCalledOnce()
    expect(engine.play).toHaveBeenCalledTimes(playing + 1)
    expect(engine.initMAGE).toHaveBeenCalledOnce()
    expect(engine.loadAudio).toHaveBeenCalledOnce()
  })

  it.each(['disabled', 'network', 'malformed', 'timeout'] as const)('disposes a suspended renderer if the focus recheck ends in %s', async outcome => {
    const player = await create({ sceneKey: 47, initialSceneBlob: template })
    player.loadSceneBlob(template)
    const pending = deferred<Response>()
    fetchMock.mockReturnValue(pending.promise)
    const starts = engine.start.mock.calls.length
    window.dispatchEvent(new Event('focus'))
    expect(engine.pause).toHaveBeenCalled()
    expect(engine.dispose).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(0)
    const checking = store.check('template:47')
    if (outcome === 'disabled') pending.resolve(json([{ sceneId: 47, available: false, code: 'SCENE_DISABLED' }]))
    if (outcome === 'malformed') pending.resolve(json({ available: true }))
    if (outcome === 'network') pending.reject(new Error('Disconnected'))
    if (outcome === 'timeout') await vi.advanceTimersByTimeAsync(5000)
    await checking
    expect(engine.dispose).toHaveBeenCalledOnce()
    expect(recovery.revokeRetry).toHaveBeenCalledWith('recovery:47')
    expect(recovery.fail).not.toHaveBeenCalled()
    expect(() => player.setPlaybackState('playing')).toThrow()
    expect(engine.start).toHaveBeenCalledTimes(starts)
    pending.resolve(json([{ sceneId: 47, available: true, code: 'AVAILABLE' }]))
    await vi.advanceTimersByTimeAsync(0)
    expect(engine.initMAGE).toHaveBeenCalledOnce()
    expect(engine.start).toHaveBeenCalledTimes(starts)
  })

  it('discards an earlier capture after a benign recheck without replacing the renderer', async () => {
    const player = await create({ sceneKey: 47, initialSceneBlob: template })
    player.loadSceneBlob(template)
    const pendingCapture = deferred<string>()
    engine.captureFramePreview.mockReturnValue(pendingCapture.promise)
    const result = player.captureFramePreview!().catch(() => null)
    await vi.advanceTimersByTimeAsync(0)
    expect(engine.captureFramePreview).toHaveBeenCalledOnce()
    window.dispatchEvent(new Event('focus'))
    await store.check('template:47')
    pendingCapture.resolve('data:image/png;base64,old-permission')
    expect(await result).toBeNull()
    expect(engine.dispose).not.toHaveBeenCalled()
    expect(engine.initMAGE).toHaveBeenCalledOnce()
  })

  it('only exempts the fixed bundled brand object, not copies or unrelated scene source', async () => {
    const { BRAND_SCENE } = await import('../templates/platformBrandScene')
    enabled = false
    const player = await create({ platformArtwork: 'brand' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(Object.isFrozen(BRAND_SCENE)).toBe(true)
    expect(Object.isFrozen(BRAND_SCENE.visualizer)).toBe(true)
    player.loadSceneBlob(BRAND_SCENE)
    expect(() => player.loadSceneBlob({ ...BRAND_SCENE })).toThrow()
    expect(() => player.loadSceneBlob(source)).toThrow()
    expect(() => player.loadSceneBlob(BRAND_SCENE, { sceneKey: 47 })).toThrow()
    expect(engine.loadPreset).toHaveBeenCalledTimes(1)
    await expect(create({ platformArtwork: 'brand', sceneKey: 47 })).rejects.toThrow()
  })
})

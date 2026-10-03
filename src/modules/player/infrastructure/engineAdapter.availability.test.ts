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
const source = { visualizer: { shader: 'sphere(1);' }, audioPath: '/music.mp3' }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
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
    const loading = player.loadAudio().then(() => 'loaded', () => 'cancelled')
    const playCalls = engine.play.mock.calls.length
    store.invalidate(47)
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

  it('revokes a retry grant on focus and requires a new player after permission returns', async () => {
    const player = await create({ sceneKey: 47 })
    player.loadSceneBlob(source)
    window.dispatchEvent(new Event('focus'))
    expect(engine.dispose).toHaveBeenCalledTimes(1)
    expect(recovery.revokeRetry).toHaveBeenCalledWith('recovery:47')
    await store.check(47)
    expect(() => player.setPlaybackState('playing')).toThrow()
    const replacement = await create({ sceneKey: 47 })
    replacement.loadSceneBlob(source)
    expect(engine.initMAGE).toHaveBeenCalledTimes(2)
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

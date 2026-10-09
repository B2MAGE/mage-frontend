import { customDocument } from '@shared/test/sceneDocument'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MagePlayerController, MagePlayerOptions } from './playerController'
import type { IsolatedPlayer } from '../isolation/isolatedPlayer'

const mocks = vi.hoisted(() => ({ create: vi.fn(), begin: vi.fn(), disposeLease: vi.fn(), fail: vi.fn(), block: vi.fn(), revokeRetry: vi.fn() }))
vi.mock('../isolation/isolatedPlayer', () => ({ createIsolatedPlayer: mocks.create }))
vi.mock('../isolation/rendererConfig', () => ({ getIsolatedRendererUrl: () => 'https://renderer.example.net/index.html' }))
vi.mock('../recovery/sceneRecovery', () => ({
  sceneRecoveryKey: (_scene: unknown, id?: string | number) => 'recovery:' + (id ?? 'custom'),
  sceneRecovery: { begin: mocks.begin, block: mocks.block, revokeRetry: mocks.revokeRetry,
    getBlock: () => null, getAutomaticBlock: () => null, isSafeMode: () => false, subscribe: () => () => {} },
}))
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const source = customDocument({ visualizer: { shader: 'sphere(1);' } })
const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fakeBridge() {
  const state = { time: 0, duration: 0, volume: 1, loaded: false, playing: false }
  return { ready: Promise.resolve(), loadScene: vi.fn(async () => {}),
    loadAudio: vi.fn<IsolatedPlayer['loadAudio']>(async (_source, _signal, beforeCommit) => {
      await beforeCommit?.()
      state.loaded = true; state.duration = 120
    }),
    getAudioState: () => ({ ...state }), play: vi.fn(async () => { state.playing = true }),
    pause: vi.fn(() => { state.playing = false }), setRenderingSuspended: vi.fn(), clearAudio: vi.fn(),
    seek: vi.fn((value: number) => { state.time = value }), reset: vi.fn(), setVolume: vi.fn(),
    setSynthetic: vi.fn(), setAudioResponse: vi.fn(), getAudioResponseCapabilities: vi.fn(() => null),
    capture: vi.fn(async () => new Blob(['verified'], { type: 'image/png' })), dispose: vi.fn(), state }
}

describe('isolated controller with the real availability polling store', () => {
  let store: (typeof import('../availability/sceneAvailability'))['sceneAvailabilityStore']
  let createMagePlayer: (typeof import('./engineAdapter'))['createMagePlayer']
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
  let enabled: boolean, disabledIds: Set<number>, players: MagePlayerController[], bridges: ReturnType<typeof fakeBridge>[]

  async function create(options: MagePlayerOptions = {}) {
    const player = await createMagePlayer(document.createElement('div'), { initialSceneBlob: source, ...options })
    players.push(player)
    return player
  }
  async function loaded(options: MagePlayerOptions = {}) {
    const player = await create(options)
    await player.loadSceneBlob(options.initialSceneBlob ?? source)
    return player
  }

  beforeEach(async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T12:00:00Z')); vi.resetModules(); vi.resetAllMocks()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    enabled = true; disabledIds = new Set(); players = []; bridges = []
    mocks.create.mockImplementation(() => { const next = fakeBridge(); bridges.push(next); return next })
    mocks.begin.mockImplementation(() => ({ dispose: mocks.disposeLease, fail: mocks.fail }))
    fetchMock = vi.fn<typeof fetch>().mockImplementation(async input => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname.endsWith('rendering-status')) return json({ enabled, code: enabled ? 'AVAILABLE' : 'CUSTOM_RENDERING_DISABLED' })
      return json(url.searchParams.get('ids')!.split(',').map(Number).map(sceneId => ({ sceneId,
        available: !disabledIds.has(sceneId), code: disabledIds.has(sceneId) ? 'SCENE_DISABLED' : 'AVAILABLE' })))
    })
    vi.stubGlobal('fetch', fetchMock)
    ;({ sceneAvailabilityStore: store } = await import('../availability/sceneAvailability'))
    ;({ createMagePlayer } = await import('./engineAdapter'))
    window.dispatchEvent(new PageTransitionEvent('pageshow'))
  })
  afterEach(() => {
    for (const player of players) player.dispose()
    store.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  })

  it('allocates no frame before the initial live permission check', async () => {
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    const creating = create({ sceneKey: 47 })
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.create).not.toHaveBeenCalled()
    pending.resolve(json({ enabled: true, code: 'AVAILABLE' }))
    const player = await creating
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(bridges[0].loadScene).not.toHaveBeenCalled()
    await player.loadSceneBlob(source)
    expect(bridges[0].loadScene).toHaveBeenCalledOnce()
  })

  it('ignores stale initial approval after focus starts a newer check', async () => {
    const first = deferred<Response>(), fresh = deferred<Response>()
    fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(fresh.promise)
    const creating = create({ sceneKey: 47, initialSceneBlob: template })
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    first.resolve(json([{ sceneId: 47, available: true, code: 'AVAILABLE' }]))
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.create).not.toHaveBeenCalled()
    fresh.resolve(json([{ sceneId: 47, available: true, code: 'AVAILABLE' }]))
    await creating
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it('allows validated draft templates while the custom gate is disabled', async () => {
    enabled = false
    const player = await loaded({ initialSceneBlob: template })
    player.resetPlayback(); player.setPlaybackState('playing')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(bridges[0].loadScene).toHaveBeenCalledOnce()
    expect(bridges[0].reset).toHaveBeenCalledOnce()
  })

  it('checks saved templates independently and stops them on per-scene disable', async () => {
    enabled = false
    const player = await loaded({ initialSceneBlob: template, sceneKey: 47 })
    expect(fetchMock.mock.calls.every(([url]) => String(url) === '/api/scene-availability?ids=47')).toBe(true)
    disabledIds.add(47)
    await vi.advanceTimersByTimeAsync(10000)
    expect(bridges[0].dispose).toHaveBeenCalledOnce()
    expect(mocks.revokeRetry).toHaveBeenCalledWith('recovery:47')
    expect(() => player.resetPlayback()).toThrow()
  })

  it.each(['global', 'scene', 'network'])('allocates no renderer for a %s denial', async kind => {
    if (kind === 'global') enabled = false
    if (kind === 'scene') disabledIds.add(47)
    if (kind === 'network') fetchMock.mockRejectedValue(new Error('Offline'))
    await expect(create({ sceneKey: 47 })).rejects.toThrow()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.begin).not.toHaveBeenCalled()
    expect(mocks.block).not.toHaveBeenCalled()
  })

  it('cannot promote raw or custom source using a template recovery identity', async () => {
    enabled = false
    const player = await loaded({ initialSceneBlob: template })
    await expect(player.loadSceneBlob(source, { recoverySceneBlob: template })).rejects.toThrow()
    expect(bridges[0].loadScene).toHaveBeenCalledOnce()
    expect(bridges[0].dispose).toHaveBeenCalledOnce()
  })

  it('does not treat metadata-only permission as an empty custom controller grant', async () => {
    enabled = false
    expect((await store.check('status:47')).allowed).toBe(true)
    await expect(create({ sceneKey: 47, initialSceneBlob: undefined })).rejects.toThrow()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('validates caller mutations again before sending a loaded scene', async () => {
    const pending = deferred<Response>()
    fetchMock.mockReturnValueOnce(pending.promise)
    const changing: Record<string, unknown> = { ...template }
    const creating = create({ initialSceneBlob: changing, sceneKey: 47 })
    await vi.advanceTimersByTimeAsync(0)
    changing.visualizer = source.scene.visualizer
    pending.resolve(json([{ sceneId: 47, available: true, code: 'AVAILABLE' }]))
    const player = await creating
    await expect(player.loadSceneBlob(changing)).rejects.toThrow()
    expect(bridges[0].loadScene).not.toHaveBeenCalled()
  })

  it('deduplicates simultaneous players and stops both when the global switch changes', async () => {
    const [first, second] = await Promise.all([create({ sceneKey: 47 }), create({ sceneKey: 47 })])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await Promise.all([first.loadSceneBlob(source), second.loadSceneBlob(source)])
    enabled = false
    await vi.advanceTimersByTimeAsync(10000)
    expect(bridges.every(bridge => bridge.dispose.mock.calls.length === 1)).toBe(true)
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  it('stops by the permission deadline when polling stalls', async () => {
    const player = await loaded({ sceneKey: 47 })
    fetchMock.mockReturnValue(new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(15000)
    expect(bridges[0].dispose).toHaveBeenCalledOnce()
    expect(() => player.setPlaybackState('playing')).toThrow()
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  it('blocks controls synchronously when permission expired but timers have not run', async () => {
    const player = await loaded({ sceneKey: 47 })
    const calls = bridges[0].play.mock.calls.length
    vi.setSystemTime(Date.now() + 20000)
    expect(() => player.setPlaybackState('playing')).toThrow()
    expect(() => player.resetPlayback()).toThrow()
    expect(bridges[0].play).toHaveBeenCalledTimes(calls)
  })

  it.each(['custom', 'template'])('preserves %s audio and scene on a benign focus check', async kind => {
    const scene = kind === 'template' ? template : source
    const target = kind === 'template' ? 'template:47' : 47
    const player = await loaded({ sceneKey: 47, initialSceneBlob: scene })
    await player.loadAudio({ sourcePath: 'blob:http://localhost/music', sourceLabel: 'Current track' })
    player.seekAudio(42)
    const pending = deferred<Response>()
    fetchMock.mockImplementation(async input => String(input).includes('rendering-status')
      ? json({ enabled: true, code: 'AVAILABLE' }) : pending.promise)
    bridges[0].pause.mockClear(); bridges[0].play.mockClear()
    window.dispatchEvent(new Event('focus'))
    expect(bridges[0].pause).not.toHaveBeenCalled()
    expect(bridges[0].setRenderingSuspended).toHaveBeenLastCalledWith(true)
    expect(bridges[0].state.playing).toBe(true)
    expect(bridges[0].dispose).not.toHaveBeenCalled()
    expect(player.getPlaybackState()).toBe('playing')
    expect(() => player.resetPlayback()).toThrow()
    pending.resolve(json([{ sceneId: 47, available: true, code: 'AVAILABLE' }]))
    await store.check(target)
    expect(bridges[0].loadScene).toHaveBeenCalledOnce()
    expect(bridges[0].loadAudio).toHaveBeenCalledOnce()
    expect(bridges[0].play).toHaveBeenCalledOnce()
    expect(bridges[0].setRenderingSuspended).toHaveBeenLastCalledWith(false)
    expect(player.getAudioState()).toMatchObject({ currentTime: 42, isLoaded: true, sourcePath: 'Current track' })
  })

  it.each(['disabled', 'network', 'malformed', 'timeout'])('disposes after a focus check ends in %s', async outcome => {
    const player = await loaded({ sceneKey: 47, initialSceneBlob: template })
    const pending = deferred<Response>()
    fetchMock.mockReturnValue(pending.promise)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    const checking = store.check('template:47')
    if (outcome === 'disabled') pending.resolve(json([{ sceneId: 47, available: false, code: 'SCENE_DISABLED' }]))
    if (outcome === 'malformed') pending.resolve(json({ available: true }))
    if (outcome === 'network') pending.reject(new Error('Offline'))
    if (outcome === 'timeout') await vi.advanceTimersByTimeAsync(5000)
    await checking
    expect(bridges[0].dispose).toHaveBeenCalledOnce()
    expect(() => player.setPlaybackState('playing')).toThrow()
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  it('holds decoded hidden audio until a successful visible-page recheck', async () => {
    const player = await loaded({ sceneKey: 47, initialSceneBlob: template })
    const work = deferred<void>(), completed = vi.fn()
    bridges[0].loadAudio.mockImplementationOnce(async (_source, _signal, beforeCommit) => {
      await work.promise
      await beforeCommit?.()
    })
    const loading = player.loadAudio({ sourcePath: 'blob:http://localhost/music' }).then(completed)
    await vi.advanceTimersByTimeAsync(0)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    work.resolve()
    await vi.advanceTimersByTimeAsync(6000)
    expect(completed).not.toHaveBeenCalled()
    expect(bridges[0].dispose).not.toHaveBeenCalled()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await store.check('template:47')
    await loading
    expect(completed).toHaveBeenCalledOnce()
    expect(bridges[0].loadAudio).toHaveBeenCalledOnce()
  })

  it('rejects capture before invoking the renderer if the fresh check denies it', async () => {
    const player = await loaded({ sceneKey: 47 })
    disabledIds.add(47)
    await expect(player.captureFramePreview!()).rejects.toThrow()
    expect(bridges[0].capture).not.toHaveBeenCalled()
    expect(bridges[0].dispose).toHaveBeenCalledOnce()
  })

  it('discards an earlier capture even after a benign check restores permission', async () => {
    const player = await loaded({ initialSceneBlob: template, sceneKey: 47 })
    const pending = deferred<Blob>()
    bridges[0].capture.mockReturnValueOnce(pending.promise)
    const result = player.captureFramePreview!()
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(new Event('focus'))
    await store.check('template:47')
    pending.resolve(new Blob(['checked'], { type: 'image/png' }))
    await expect(result).resolves.toBeNull()
    expect(bridges[0].dispose).not.toHaveBeenCalled()
  })
})

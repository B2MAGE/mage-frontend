import { customDocument } from '@shared/test/sceneDocument'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MagePlayerController } from './playerController'
import type { IsolatedPlayer } from '../isolation/isolatedPlayer'
import { normalizeAudioResponseConfig } from '@shared/lib'

const mocks = vi.hoisted(() => ({ create: vi.fn(), check: vi.fn(), begin: vi.fn(), block: vi.fn(), revokeRetry: vi.fn(),
  statuses: new Map<unknown, { allowed: boolean; code: string }>(), availabilityListeners: new Map<unknown, Set<() => void>>(),
  recoveryListeners: new Set<() => void>(), blocked: new Map<string, { reason: string }>(), safeMode: false,
  leases: [] as Array<{ dispose: ReturnType<typeof vi.fn>; fail: ReturnType<typeof vi.fn>; confirmHealthy: ReturnType<typeof vi.fn> }>,
}))
vi.mock('../isolation/isolatedPlayer', () => ({ createIsolatedPlayer: mocks.create }))
vi.mock('../isolation/rendererConfig', () => ({ getIsolatedRendererUrl: () => 'https://renderer.example.net/index.html' }))
vi.mock('../availability/sceneAvailability', () => ({ sceneAvailabilityStore: {
  check: mocks.check,
  getSnapshot: (target: unknown) => mocks.statuses.get(target) ?? { allowed: true, code: 'ALLOWED' },
  isAllowed: (target: unknown) => (mocks.statuses.get(target) ?? { allowed: true }).allowed,
  subscribe(target: unknown, listener: () => void) {
    const group = mocks.availabilityListeners.get(target) ?? new Set()
    group.add(listener)
    mocks.availabilityListeners.set(target, group)
    return () => group.delete(listener)
  },
} }))
vi.mock('../recovery/sceneRecovery', async importActual => ({ ...await importActual<object>(), sceneRecovery: {
  begin: mocks.begin, block: mocks.block, revokeRetry: mocks.revokeRetry,
  getBlock: (key: string) => mocks.blocked.get(key) ?? null,
  getAutomaticBlock: (key: string) => mocks.blocked.get(key) ?? null,
  isSafeMode: () => mocks.safeMode,
  subscribe(listener: () => void) { mocks.recoveryListeners.add(listener); return () => mocks.recoveryListeners.delete(listener) },
} }))
import { createIsolatedMageController } from './isolatedController'
import { sceneRecoveryKey } from '../recovery/sceneRecovery'
import { extractLiveSceneSettings } from '../liveSceneSettings'

const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
const custom = customDocument({ visualizer: { shader: 'sphere(0.5);' } })
const controllers: MagePlayerController[] = []
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
function setAvailability(target: unknown, code: string) {
  mocks.statuses.set(target, { allowed: code === 'ALLOWED', code })
  for (const callback of mocks.availabilityListeners.get(target) ?? []) callback()
}
function bridge() {
  const state = { time: 0, duration: 0, loaded: false, playing: false, volume: 1 }
  return { ready: Promise.resolve(), loadScene: vi.fn<(scene: unknown, profile?: unknown) => Promise<void>>(async () => {}),
    loadAudio: vi.fn<IsolatedPlayer['loadAudio']>(async (_source, _signal, beforeCommit) => {
      await beforeCommit?.()
      state.loaded = true; state.duration = 60
    }),
    play: vi.fn(async () => { state.playing = true }), pause: vi.fn(() => { state.playing = false }),
    seek: vi.fn((time: number) => { state.time = Math.min(60, time) }), setVolume: vi.fn((volume: number) => { state.volume = volume }),
    clearAudio: vi.fn(() => { state.loaded = false; state.duration = 0; state.time = 0 }),
    reset: vi.fn(() => { state.time = 0; state.playing = false }), setSynthetic: vi.fn(), setRenderingSuspended: vi.fn(),
    setAudioResponse: vi.fn(), setSceneSettings: vi.fn(), getAudioResponseCapabilities: vi.fn(() => null),
    getAudioState: () => ({ ...state }), capture: vi.fn<(request?: unknown) => Promise<Blob>>(async () => new Blob(['verified-raster'], { type: 'image/png' })),
    dispose: vi.fn(), state }
}
let playerBridge: ReturnType<typeof bridge>
async function create(scene: unknown = template, sceneKey?: number) {
  const player = await createIsolatedMageController(document.createElement('div'), { initialSceneBlob: scene, sceneKey })
  controllers.push(player)
  return player
}
async function loaded(scene: unknown = template, sceneKey?: number) {
  const player = await create(scene, sceneKey)
  await player.loadSceneBlob(scene, { sceneKey })
  return player
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.statuses.clear(); mocks.availabilityListeners.clear(); mocks.recoveryListeners.clear(); mocks.blocked.clear()
  mocks.safeMode = false; mocks.leases.length = 0
  mocks.check.mockReset().mockImplementation(async target => mocks.statuses.get(target) ?? { allowed: true, code: 'ALLOWED' })
  mocks.begin.mockReset().mockImplementation(() => {
    const lease = { dispose: vi.fn(), fail: vi.fn(), confirmHealthy: vi.fn() }
    mocks.leases.push(lease)
    return lease
  })
  playerBridge = bridge()
  mocks.create.mockReset().mockReturnValue(playerBridge)
})
afterEach(() => {
  for (const player of controllers.splice(0)) { try { player.dispose() } catch { /* Exercise failed cleanup too. */ } }
  vi.useRealTimers()
})

describe('isolated controller guards', () => {
  it('validates before checking permission or allocating the frame', async () => {
    await expect(create(customDocument({ ...custom.scene, intent: { fov: 400 } }))).rejects.toThrow(/fov/)
    await expect(createIsolatedMageController(document.createElement('div'), {})).rejects.toThrow(/initial scene/)
    expect(mocks.check).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('does not create a frame when the custom gate is denied', async () => {
    mocks.statuses.set('custom', { allowed: false, code: 'CUSTOM_RENDERING_DISABLED' })
    await expect(create(custom)).rejects.toThrow(/unavailable|stopped/)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.availabilityListeners.get('custom')?.size).toBe(0)
  })

  it('requires fresh permission after asynchronous startup', async () => {
    const ready = deferred<void>()
    playerBridge.ready = ready.promise
    const pending = create(custom)
    await flush()
    setAvailability('custom', 'CUSTOM_RENDERING_DISABLED')
    ready.resolve()
    await expect(pending).rejects.toThrow(/stopped/)
    expect(playerBridge.dispose).toHaveBeenCalledOnce()
    expect(mocks.begin).not.toHaveBeenCalled()
  })

  it('records recovery before sending source and waits for the child load', async () => {
    const work = deferred<void>()
    playerBridge.loadScene.mockReturnValueOnce(work.promise)
    const player = await create()
    const pending = player.loadSceneBlob(template)
    await flush()
    expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(playerBridge.loadScene.mock.invocationCallOrder[0])
    expect(player.getAudioResponseCapabilities()).toBeNull()
    expect(playerBridge.play).not.toHaveBeenCalled()
    work.resolve()
    await pending
    expect(playerBridge.play).toHaveBeenCalledOnce()
  })

  it('rejects invalid replacements without touching the live renderer or audio', async () => {
    const player = await loaded()
    playerBridge.pause.mockClear(); playerBridge.loadScene.mockClear()
    await expect(player.loadSceneBlob({ ...template, visualizer: custom.scene.visualizer })).rejects.toThrow()
    expect(playerBridge.pause).not.toHaveBeenCalled()
    expect(playerBridge.loadScene).not.toHaveBeenCalled()
  })

  it('suspends and resumes the same scene/audio after a permission recheck', async () => {
    const player = await loaded(custom)
    await player.loadAudio({ sourcePath: 'blob:http://localhost/music', sourceLabel: 'Music' })
    playerBridge.loadScene.mockClear(); playerBridge.play.mockClear()
    setAvailability('custom', 'CHECKING')
    expect(playerBridge.setRenderingSuspended).toHaveBeenLastCalledWith(true)
    expect(playerBridge.pause).not.toHaveBeenCalled()
    expect(player.getPlaybackState()).toBe('playing')
    setAvailability('custom', 'ALLOWED')
    expect(playerBridge.setRenderingSuspended).toHaveBeenLastCalledWith(false)
    expect(playerBridge.play).toHaveBeenCalledOnce()
    expect(playerBridge.loadScene).not.toHaveBeenCalled()
    expect(playerBridge.clearAudio).not.toHaveBeenCalled()
    expect(player.getAudioState()).toMatchObject({ sourcePath: 'Music', isLoaded: true })
  })

  it('does not resume a deliberately paused scene after recheck', async () => {
    const player = await loaded(custom)
    player.setPlaybackState('paused'); playerBridge.play.mockClear()
    setAvailability('custom', 'CHECKING'); setAvailability('custom', 'ALLOWED')
    expect(playerBridge.play).not.toHaveBeenCalled()
  })

  it.each(['view-first', 'permission-first'])('keeps independent visual suspension causes active until both release, %s', async order => {
    const player = await loaded(custom)
    await player.loadAudio({ sourcePath: 'blob:music' })
    playerBridge.play.mockClear()
    player.setRenderingSuspended!(true)
    setAvailability('custom', 'CHECKING')
    if (order === 'view-first') player.setRenderingSuspended!(false)
    else setAvailability('custom', 'ALLOWED')
    expect(playerBridge.setRenderingSuspended).toHaveBeenLastCalledWith(true)
    expect(playerBridge.play).not.toHaveBeenCalled()
    expect(playerBridge.pause).not.toHaveBeenCalled()
    mocks.create.mock.calls[0][0].onHealthy()
    expect(mocks.leases[0].confirmHealthy).not.toHaveBeenCalled()
    if (order === 'view-first') setAvailability('custom', 'ALLOWED')
    else player.setRenderingSuspended!(false)
    expect(playerBridge.setRenderingSuspended).toHaveBeenLastCalledWith(false)
    expect(playerBridge.play).toHaveBeenCalledOnce()
    expect(playerBridge.loadScene).toHaveBeenCalledOnce()
    expect(playerBridge.loadAudio).toHaveBeenCalledOnce()
  })

  it('disposes on actual revocation and withdraws retry permission', async () => {
    const player = await loaded(custom, 7)
    setAvailability(7, 'SCENE_DISABLED')
    expect(playerBridge.dispose).toHaveBeenCalledOnce()
    expect(mocks.revokeRetry).toHaveBeenCalledWith(sceneRecoveryKey(custom, 7))
    expect(() => player.setPlaybackState('playing')).toThrow(/stopped/)
    expect(mocks.leases[0].dispose).toHaveBeenCalledOnce()
    expect(mocks.leases[0].fail).not.toHaveBeenCalled()
  })

  it('retargets template/custom and saved scene permissions without replacing parent audio', async () => {
    const player = await loaded(template, 2)
    await player.loadAudio({ sourcePath: 'blob:http://localhost/music' })
    playerBridge.state.time = 13
    await player.loadSceneBlob(custom, { sceneKey: 3 })
    expect(mocks.check).toHaveBeenLastCalledWith(3)
    expect(mocks.availabilityListeners.get('template:2')?.size).toBe(0)
    expect(mocks.availabilityListeners.get(3)?.size).toBe(1)
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(playerBridge.clearAudio).not.toHaveBeenCalled()
    expect(player.getAudioState()).toMatchObject({ currentTime: 13, isLoaded: true })
    expect(mocks.leases[0].dispose).toHaveBeenCalledOnce()
  })

  it('never sends a retargeted scene when its gate is denied', async () => {
    const player = await loaded(template)
    mocks.statuses.set('custom', { allowed: false, code: 'CUSTOM_RENDERING_DISABLED' })
    playerBridge.loadScene.mockClear()
    await expect(player.loadSceneBlob(custom)).rejects.toThrow(/unavailable|stopped/)
    expect(playerBridge.loadScene).not.toHaveBeenCalled()
    expect(playerBridge.dispose).toHaveBeenCalledOnce()
  })

  it('ignores stale permission completions during rapid scene switches', async () => {
    const player = await loaded(template)
    const permission = deferred<{ allowed: boolean; code: string }>()
    mocks.check.mockImplementationOnce(() => permission.promise)
    const stale = player.loadSceneBlob(custom)
    await flush()
    await player.loadSceneBlob(template)
    permission.resolve({ allowed: true, code: 'ALLOWED' })
    await expect(stale).rejects.toThrow(/scene changed/)
    expect(playerBridge.loadScene).toHaveBeenCalledTimes(2)
  })

  it('cannot complete an old load into a newer generation', async () => {
    const player = await loaded(template)
    const work = deferred<void>()
    playerBridge.loadScene.mockReturnValueOnce(work.promise)
    const stale = player.loadSceneBlob(custom)
    void Promise.resolve(stale).catch(() => {})
    await new Promise(resolve => setTimeout(resolve, 360))
    await player.loadSceneBlob(template)
    work.resolve()
    await expect(stale).rejects.toThrow(/scene changed/)
    expect(playerBridge.dispose).not.toHaveBeenCalled()
  })

  it('coalesces rapid editor changes into one latest pending source without tripping the protocol limit', async () => {
    vi.useFakeTimers()
    const player = await loaded()
    await player.loadAudio({ sourcePath: 'blob:http://localhost/music', sourceLabel: 'Music' })
    player.seekAudio(42)
    player.setAudioVolume(0.4)
    const attempts: Array<Promise<unknown>> = []
    for (let index = 0; index < 12; index++) {
      attempts.push(Promise.resolve(player.loadSceneBlob(customDocument({ visualizer: { shader: `sphere(${index / 20 + 0.1});` } }))).catch(error => error))
      await flush()
    }
    await vi.advanceTimersByTimeAsync(349)
    expect(playerBridge.loadScene).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    const outcomes = await Promise.all(attempts)
    expect(outcomes.slice(0, -1).every(outcome => outcome instanceof Error)).toBe(true)
    expect(outcomes.at(-1)).toBeUndefined()
    expect(playerBridge.loadScene).toHaveBeenCalledTimes(2)
    expect(playerBridge.loadScene.mock.lastCall?.[0]).toMatchObject({ kind: 'custom', scene: { visualizer: { shader: 'sphere(0.65);' } } })
    expect(mocks.begin).toHaveBeenCalledTimes(2)
    expect(playerBridge.dispose).not.toHaveBeenCalled()
    expect(mocks.leases.every(lease => lease.fail.mock.calls.length === 0)).toBe(true)
    expect(playerBridge.pause).not.toHaveBeenCalled()
    expect(playerBridge.loadAudio).toHaveBeenCalledOnce()
    expect(player.getAudioState()).toMatchObject({ currentTime: 42, volume: 0.4 })
    expect(playerBridge.state.playing).toBe(true)
    expect(playerBridge.setRenderingSuspended).toHaveBeenLastCalledWith(false)
  })

  it('keeps music running while a scene compiles and respects a user pause before completion', async () => {
    vi.useFakeTimers()
    const player = await loaded(custom)
    await player.loadAudio({ sourcePath: 'blob:http://localhost/music' })
    player.seekAudio(42)
    const compilation = deferred<void>()
    playerBridge.loadScene.mockReturnValueOnce(compilation.promise)
    const loading = player.loadSceneBlob(customDocument({ visualizer: { shader: 'box(0.5);' } }))
    await vi.advanceTimersByTimeAsync(350)
    expect(playerBridge.loadScene).toHaveBeenCalledTimes(2)
    expect(playerBridge.setRenderingSuspended).toHaveBeenLastCalledWith(true)
    expect(playerBridge.pause).not.toHaveBeenCalled()
    expect(playerBridge.state).toMatchObject({ playing: true, time: 42 })
    player.setPlaybackState('paused')
    playerBridge.play.mockClear()
    compilation.resolve(); await loading
    expect(playerBridge.play).not.toHaveBeenCalled()
    expect(playerBridge.state).toMatchObject({ playing: false, time: 42 })
    expect(player.getPlaybackState()).toBe('paused')
    expect(playerBridge.setRenderingSuspended).toHaveBeenLastCalledWith(false)
  })

  it('cancels a queued editor change on disposal before sending its source', async () => {
    vi.useFakeTimers()
    const player = await loaded()
    const pending = Promise.resolve(player.loadSceneBlob(custom)).catch(error => error)
    await flush()
    player.dispose()
    await vi.advanceTimersByTimeAsync(500)
    expect(await pending).toBeInstanceOf(Error)
    expect(playerBridge.loadScene).toHaveBeenCalledOnce()
  })

  it('quarantines child load failures and closes the frame', async () => {
    const player = await create()
    playerBridge.loadScene.mockRejectedValueOnce(new Error('Child failed'))
    await expect(player.loadSceneBlob(template)).rejects.toThrow('Child failed')
    expect(playerBridge.dispose).toHaveBeenCalledOnce()
    expect(mocks.leases[0].fail).toHaveBeenCalledWith('load')
  })

  it.each(['runtime', 'context-lost', 'startup-timeout', 'progress-timeout', 'compile'])('records %s from the child boundary', async reason => {
    await loaded()
    mocks.create.mock.calls[0][0].onFailure(reason)
    expect(mocks.leases[0].fail).toHaveBeenCalledWith(reason)
    expect(playerBridge.dispose).toHaveBeenCalledOnce()
  })

  it('preserves compile rejection when the pending scene load subsequently rejects', async () => {
    const work = deferred<void>()
    playerBridge.loadScene.mockReturnValueOnce(work.promise)
    const player = await create(custom)
    const pending = player.loadSceneBlob(custom)
    const rejected = expect(pending).rejects.toThrow('Isolated player stopped.')
    await flush()
    mocks.create.mock.calls[0][0].onFailure('compile')
    work.reject(new Error('Isolated player stopped.'))
    await rejected
    expect(mocks.leases[0].fail).toHaveBeenCalledExactlyOnceWith('compile')
    expect(player.getStoppedRecoveryKey?.()).toBe(sceneRecoveryKey(custom))
    expect(playerBridge.dispose).toHaveBeenCalledOnce()
    expect(playerBridge.play).not.toHaveBeenCalled()
  })

  it('distinguishes deliberate stop from ordinary pause', async () => {
    const player = await loaded()
    player.setPlaybackState('paused')
    expect(mocks.leases[0].fail).not.toHaveBeenCalled()
    player.stopRendering!()
    expect(mocks.leases[0].fail).toHaveBeenCalledWith('stopped')
  })

  it('confirms a healthy current lease without replacing the player or music', async () => {
    const player = await loaded()
    await player.loadAudio({ sourcePath: 'blob:local-track' })
    player.seekAudio(23)
    mocks.create.mock.calls[0][0].onHealthy()
    expect(mocks.leases[0].confirmHealthy).toHaveBeenCalledOnce()
    expect(playerBridge.loadScene).toHaveBeenCalledOnce()
    expect(playerBridge.dispose).not.toHaveBeenCalled()
    expect(playerBridge.clearAudio).not.toHaveBeenCalled()
    expect(player.getAudioState().currentTime).toBe(23)
  })

  it('ignores healthy signals while loading, paused or checking availability', async () => {
    const player = await create()
    const onHealthy = mocks.create.mock.calls[0][0].onHealthy
    const work = deferred<void>()
    playerBridge.loadScene.mockReturnValueOnce(work.promise)
    const pending = player.loadSceneBlob(template)
    await flush()
    onHealthy()
    expect(mocks.leases[0].confirmHealthy).not.toHaveBeenCalled()
    work.resolve()
    await pending
    player.setPlaybackState('paused')
    onHealthy()
    player.setPlaybackState('playing')
    setAvailability('draft-template', 'CHECKING')
    onHealthy()
    expect(mocks.leases[0].confirmHealthy).not.toHaveBeenCalled()
    setAvailability('draft-template', 'ALLOWED')
    onHealthy()
    expect(mocks.leases[0].confirmHealthy).toHaveBeenCalledOnce()
  })

  it.each(['dispose', 'deny', 'safe-mode', 'failure'])('ignores late healthy signals after %s', async action => {
    const player = await loaded(custom)
    const callbacks = mocks.create.mock.calls[0][0]
    if (action === 'dispose') player.dispose()
    else if (action === 'deny') setAvailability('custom', 'CUSTOM_RENDERING_DISABLED')
    else if (action === 'failure') callbacks.onFailure('runtime')
    else mocks.safeMode = true
    callbacks.onHealthy()
    expect(mocks.leases[0].confirmHealthy).not.toHaveBeenCalled()
  })

  it('disposes running direct controllers on global safe mode', async () => {
    const player = await loaded()
    mocks.safeMode = true
    for (const listener of [...mocks.recoveryListeners]) listener()
    expect(playerBridge.dispose).toHaveBeenCalledOnce()
    expect(() => player.resetPlayback()).toThrow(/stopped/)
  })

  it('keeps the unfinished marker when disposal fails', async () => {
    const player = await loaded()
    playerBridge.dispose.mockImplementation(() => { throw new Error('Cleanup failed') })
    expect(() => player.dispose()).toThrow('Cleanup failed')
    expect(mocks.leases[0].dispose).not.toHaveBeenCalled()
    expect(mocks.block).toHaveBeenCalledWith(sceneRecoveryKey(template), 'interrupted')
  })

  it('ends its marker and listeners on pagehide, with no resume after pageshow', async () => {
    const player = await loaded()
    window.dispatchEvent(new PageTransitionEvent('pagehide'))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(playerBridge.dispose).toHaveBeenCalledOnce()
    expect(mocks.leases[0].dispose).toHaveBeenCalledOnce()
    expect(mocks.recoveryListeners.size).toBe(0)
    expect(() => player.setPlaybackState('playing')).toThrow(/stopped/)
  })
})

describe('isolated controls and media', () => {
  it('preserves pause through a scene switch', async () => {
    const player = await loaded()
    player.setPlaybackState('paused'); playerBridge.play.mockClear()
    await player.loadSceneBlob(custom)
    expect(playerBridge.play).not.toHaveBeenCalled()
    expect(player.getPlaybackState()).toBe('paused')
  })

  it('updates response configuration without reloading music or the scene', async () => {
    const player = await loaded(custom)
    playerBridge.loadScene.mockClear()
    const state = player.setAudioResponseSettings('mapped-v1', normalizeAudioResponseConfig({ sensitivity: 1.5 }).config)
    expect(playerBridge.setAudioResponse).toHaveBeenCalledWith('mapped-v1', state.effectiveConfig)
    expect(playerBridge.loadScene).not.toHaveBeenCalled()
    expect(playerBridge.clearAudio).not.toHaveBeenCalled()
  })

  it('restores saved settings when resetting an override', async () => {
    const player = await loaded(custom)
    player.setAudioResponseOverride({ sensitivity: 1.5 })
    expect(player.getAudioResponseState().effectiveMode).toBe('mapped-v1')
    player.resetPlayback()
    expect(player.getAudioResponseState()).toMatchObject({ override: null, effectiveMode: 'legacy' })
    expect(playerBridge.reset).toHaveBeenCalledOnce()
  })

  it('moves recovery identity after a response-only edit without reloading', async () => {
    const player = await loaded(custom)
    const next = customDocument({ ...custom.scene, audioResponse: 'mapped-v1' })
    player.setAudioResponseSettings('mapped-v1')
    player.updateRecoveryIdentity!(next)
    expect(playerBridge.loadScene).toHaveBeenCalledOnce()
    expect(mocks.begin).toHaveBeenLastCalledWith(sceneRecoveryKey(next))
    expect(mocks.leases[0].dispose).toHaveBeenCalledOnce()
    expect(() => player.updateRecoveryIdentity!(customDocument({ visualizer: { shader: 'box(1, 1, 1);' } }))).toThrow(/complete scene load/)
  })

  it('keeps original editor identity separate from validated preview source', async () => {
    const player = await create()
    await player.loadSceneBlob(template, { recoverySceneBlob: { ...template, parameters: { speed: 1 } } })
    expect(mocks.begin).toHaveBeenCalledWith(sceneRecoveryKey({ ...template, parameters: { speed: 1 } }))
    expect(playerBridge.loadScene.mock.calls[0][0]).not.toHaveProperty('recoverySceneBlob')
  })

  it('does not classify audio decode failures as shader failures', async () => {
    const player = await loaded()
    playerBridge.loadAudio.mockRejectedValueOnce(new Error('Unsupported audio'))
    await expect(player.loadAudio({ sourcePath: 'blob:http://localhost/music' })).rejects.toThrow('Unsupported audio')
    expect(mocks.leases[0].fail).not.toHaveBeenCalled()
    expect(playerBridge.dispose).not.toHaveBeenCalled()
  })

  it('keeps the previous label, time and volume while a replacement decodes or fails', async () => {
    const player = await loaded()
    await player.loadAudio({ sourcePath: 'blob:original', sourceLabel: 'Original' })
    player.seekAudio(23); player.setAudioVolume(0.4)
    const work = deferred<void>()
    playerBridge.loadAudio.mockReturnValueOnce(work.promise)
    const loading = player.loadAudio({ sourcePath: 'blob:replacement', sourceLabel: 'Replacement' })
    const rejected = expect(loading).rejects.toThrow('Unsupported audio')
    await flush()
    expect(player.getAudioState()).toMatchObject({ sourcePath: 'Original', currentTime: 23, volume: 0.4, isLoaded: true })
    work.reject(new Error('Unsupported audio'))
    await rejected
    expect(player.getAudioState()).toMatchObject({ sourcePath: 'Original', currentTime: 23, volume: 0.4, isLoaded: true })
    expect(playerBridge.clearAudio).not.toHaveBeenCalled()
    expect(playerBridge.dispose).not.toHaveBeenCalled()
  })

  it('aborts the in-flight bridge candidate when another selection is awaiting permission', async () => {
    const player = await loaded()
    await player.loadAudio({ sourcePath: 'blob:original', sourceLabel: 'Original' })
    const work = deferred<void>()
    playerBridge.loadAudio.mockReturnValueOnce(work.promise)
    const pending = player.loadAudio({ sourcePath: 'blob:stale', sourceLabel: 'Stale' })
    const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(playerBridge.loadAudio).toHaveBeenCalledTimes(2))
    const staleSignal = playerBridge.loadAudio.mock.calls[1][1]!
    const permission = deferred<{ allowed: boolean; code: string }>()
    mocks.check.mockReturnValueOnce(permission.promise)
    const latest = player.loadAudio({ sourcePath: 'blob:latest', sourceLabel: 'Latest' })
    await cancelled
    expect(staleSignal.aborted).toBe(true)
    work.resolve()
    await flush()
    expect(player.getAudioState().sourcePath).toBe('Original')
    permission.resolve({ allowed: true, code: 'ALLOWED' })
    await latest
    expect(player.getAudioState().sourcePath).toBe('Latest')
  })

  it.each(['permission', 'decode', 'final-permission'])('cancels a candidate during %s and keeps the original label', async phase => {
    const player = await loaded(custom)
    await player.loadAudio({ sourcePath: 'blob:original', sourceLabel: 'Original' })
    const permission = deferred<{ allowed: boolean; code: string }>()
    const work = deferred<void>()
    if (phase === 'permission') mocks.check.mockReturnValueOnce(permission.promise)
    else playerBridge.loadAudio.mockImplementationOnce(async (_source, signal, beforeCommit) => {
      await work.promise
      await beforeCommit?.()
      if (!signal?.aborted) playerBridge.state.duration = 10
    })
    const abort = new AbortController()
    const pending = player.loadAudio({ sourcePath: 'blob:replacement', sourceLabel: 'Replacement', signal: abort.signal })
    const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    if (phase !== 'permission') await vi.waitFor(() => expect(playerBridge.loadAudio).toHaveBeenCalledTimes(2))
    if (phase === 'final-permission') { setAvailability('custom', 'CHECKING'); work.resolve(); await flush() }
    abort.abort()
    await cancelled
    work.resolve(); permission.resolve({ allowed: true, code: 'ALLOWED' })
    setAvailability('custom', 'ALLOWED')
    await flush()
    expect(player.getAudioState()).toMatchObject({ sourcePath: 'Original', duration: 60, isLoaded: true })
    expect(playerBridge.clearAudio).not.toHaveBeenCalled()
    expect(playerBridge.dispose).not.toHaveBeenCalled()
  })

  it('holds the replacement before commit until a new permission check finishes', async () => {
    const player = await loaded(custom)
    await player.loadAudio({ sourcePath: 'blob:original', sourceLabel: 'Original' })
    const work = deferred<void>()
    playerBridge.loadAudio.mockImplementationOnce(async (_source, _signal, beforeCommit) => {
      await work.promise
      await beforeCommit?.()
      playerBridge.state.duration = 10
    })
    const loading = player.loadAudio({ sourcePath: 'blob:replacement', sourceLabel: 'Replacement' })
    await vi.waitFor(() => expect(playerBridge.loadAudio).toHaveBeenCalledTimes(2))
    setAvailability('custom', 'CHECKING')
    work.resolve(); await flush()
    expect(player.getAudioState()).toMatchObject({ sourcePath: 'Original', duration: 60 })
    setAvailability('custom', 'ALLOWED')
    await loading
    expect(player.getAudioState()).toMatchObject({ sourcePath: 'Replacement', duration: 10 })
  })

  it('does not let an earlier play rejection quarantine a later deliberate pause', async () => {
    const player = await loaded()
    const work = deferred<void>()
    playerBridge.play.mockReturnValueOnce(work.promise)
    player.setPlaybackState('playing')
    player.setPlaybackState('paused')
    work.reject(new Error('Earlier audio resume failed'))
    await flush()
    expect(player.getPlaybackState()).toBe('paused')
    expect(mocks.leases[0].fail).not.toHaveBeenCalled()
    expect(playerBridge.dispose).not.toHaveBeenCalled()
  })

  it('prevents a superseded audio request from overwriting the latest track label', async () => {
    const player = await loaded()
    const work = deferred<void>()
    playerBridge.loadAudio.mockReturnValueOnce(work.promise)
    const stale = player.loadAudio({ sourcePath: 'blob:http://localhost/old', sourceLabel: 'Old' })
    await flush()
    await player.loadAudio({ sourcePath: 'blob:http://localhost/new', sourceLabel: 'New' })
    work.resolve()
    await expect(stale).rejects.toThrow(/Audio changed/)
    expect(player.getAudioState().sourcePath).toBe('New')
  })

  it.each(['clear', 'dispose', 'safe-mode'])('rejects audio completed after %s', async action => {
    const player = await loaded()
    const work = deferred<void>()
    playerBridge.loadAudio.mockReturnValueOnce(work.promise)
    const pending = player.loadAudio({ sourcePath: 'blob:http://localhost/music' })
    await flush()
    if (action === 'clear') player.clearAudio()
    else if (action === 'dispose') player.dispose()
    else { mocks.safeMode = true; for (const listener of [...mocks.recoveryListeners]) listener() }
    work.resolve()
    await expect(pending).rejects.toThrow()
    expect(player.getAudioState().sourcePath).toBeNull()
  })

  it('forwards bounded volume, seek and simulated beat controls', async () => {
    const player = await loaded()
    player.setAudioVolume(7); player.seekAudio(-1); player.setSyntheticPreview(true, 42, 0.5)
    expect(playerBridge.setVolume).toHaveBeenCalledWith(1)
    expect(playerBridge.seek).toHaveBeenCalledWith(0)
    expect(playerBridge.setSynthetic).toHaveBeenCalledWith(true, 42, 0.5)
  })

  it('returns only the requested checked image as a bounded data URL', async () => {
    const player = await loaded()
    const image = await player.captureFramePreview!({ width: 10000, height: 10000 })
    expect(image).toMatch(/^data:image\/png;base64,/)
    const request = playerBridge.capture.mock.calls[0][0] as unknown as { width: number; height: number }
    expect(request.width * request.height).toBeLessThanOrEqual(230400)
  })

  it('rejects concurrent capture work and discards old-scene results', async () => {
    const player = await loaded()
    const work = deferred<Blob>()
    playerBridge.capture.mockReturnValueOnce(work.promise)
    const pending = player.captureFramePreview!()
    await flush()
    await expect(player.captureFramePreview!()).rejects.toThrow(/already in progress/)
    await player.loadSceneBlob(custom)
    work.resolve(new Blob(['verified-raster'], { type: 'image/png' }))
    await expect(pending).resolves.toBeNull()
  })

  it('does not allocate a capture while a replacement view waits for permission, including an earlier pending check', async () => {
    const player = await loaded()
    const permission = deferred<{ allowed: boolean; code: string }>()
    mocks.check.mockReturnValueOnce(permission.promise)
    const pending = player.captureFramePreview!()
    await flush()
    player.setRenderingSuspended!(true)
    permission.resolve({ allowed: true, code: 'ALLOWED' })
    await expect(pending).resolves.toBeNull()
    await expect(player.captureFramePreview!()).resolves.toBeNull()
    expect(playerBridge.capture).not.toHaveBeenCalled()
    player.setRenderingSuspended!(false)
    await expect(player.captureFramePreview!()).resolves.toMatch(/^data:image\/png;base64,/)
    expect(playerBridge.capture).toHaveBeenCalledOnce()
  })
})

describe('isolated live scene settings', () => {
  const cameraAndEffects = customDocument({
    ...custom.scene,
    visualizer: { ...custom.scene.visualizer, scale: 120 },
    controls: { position0: { x: 1, y: 2, z: 6 }, target0: { x: 0, y: 1, z: 0 }, zoom0: 1.2 },
    intent: { fov: 96, autoRotate: false, camTilt: 0.3, time_multiplier: 1.2 },
    fx: { bloom: { enabled: true, strength: 0.4 }, passes: { rgbShift: true }, params: { rgbShift: { amount: 0.02 } } },
    state: { volume_multiplier: 0.8 },
  })

  it.each([
    { name: 'current custom', initial: custom, next: cameraAndEffects },
    { name: 'template', initial: template, next: { ...template, parameters: { speed: 1.3, scale: 90 },
      settings: { camera: { fov: 96, autoRotate: false }, bloom: { enabled: true, strength: 0.4 } } } },
  ])('updates camera and effects for $name while music and playback keep their state', async ({ initial, next }) => {
    const player = await loaded(initial, 7)
    await player.loadAudio({ sourcePath: 'blob:music', sourceLabel: 'Music' })
    player.seekAudio(23); player.setAudioVolume(0.4)
    playerBridge.loadScene.mockClear(); playerBridge.loadAudio.mockClear(); playerBridge.play.mockClear()
    playerBridge.seek.mockClear(); playerBridge.setVolume.mockClear(); playerBridge.setRenderingSuspended.mockClear()
    player.updateSceneSettings!(next, { sceneKey: 7 })
    expect(playerBridge.setSceneSettings).toHaveBeenCalledExactlyOnceWith(extractLiveSceneSettings(next))
    expect(playerBridge.loadScene).not.toHaveBeenCalled()
    expect(playerBridge.loadAudio).not.toHaveBeenCalled()
    expect(playerBridge.clearAudio).not.toHaveBeenCalled()
    expect(playerBridge.play).not.toHaveBeenCalled()
    expect(playerBridge.pause).not.toHaveBeenCalled()
    expect(playerBridge.reset).not.toHaveBeenCalled()
    expect(playerBridge.seek).not.toHaveBeenCalled()
    expect(playerBridge.setVolume).not.toHaveBeenCalled()
    expect(playerBridge.setRenderingSuspended).not.toHaveBeenCalled()
    expect(playerBridge.setAudioResponse).not.toHaveBeenCalled()
    expect(player.getPlaybackState()).toBe('playing')
    expect(player.getAudioState()).toMatchObject({ currentTime: 23, volume: 0.4, sourcePath: 'Music', isLoaded: true })
    expect(mocks.begin).toHaveBeenLastCalledWith(sceneRecoveryKey(next, 7))
    expect(mocks.leases[0].dispose).toHaveBeenCalledOnce()
    expect(mocks.check).toHaveBeenCalledTimes(3)
  })

  it('keeps rapid updates current for response state, capture and failure recovery', async () => {
    const player = await loaded(custom)
    let next = custom as Record<string, unknown>
    for (let index = 0; index < 20; index++) {
      next = customDocument({ ...custom.scene, intent: { fov: 70 + index }, audioResponse: 'mapped-v1',
        audioResponseConfig: normalizeAudioResponseConfig({ version: 1, sensitivity: 0.5 + index / 20 }).config })
      player.updateSceneSettings!(next)
    }
    expect(playerBridge.loadScene).toHaveBeenCalledOnce()
    expect(playerBridge.setSceneSettings).toHaveBeenCalledTimes(20)
    expect(playerBridge.setSceneSettings).toHaveBeenLastCalledWith(extractLiveSceneSettings(next))
    expect(player.getAudioResponseState().savedConfig?.sensitivity).toBe(1.45)
    expect(mocks.leases.slice(0, -1).every(lease => lease.dispose.mock.calls.length === 1)).toBe(true)
    const capture = await player.captureFramePreview!()
    expect(capture).toMatch(/^data:image\/png;base64,/)
    expect(playerBridge.setSceneSettings.mock.invocationCallOrder.at(-1)).toBeLessThan(playerBridge.capture.mock.invocationCallOrder[0])
    mocks.create.mock.calls[0][0].onFailure('runtime')
    expect(player.getStoppedRecoveryKey!()).toBe(sceneRecoveryKey(next))
    expect(mocks.leases.at(-1)?.fail).toHaveBeenCalledExactlyOnceWith('runtime')
  })

  it('preserves an override while saving the next response and only forwards effective response changes', async () => {
    const player = await loaded(custom)
    const override = normalizeAudioResponseConfig({ version: 1, sensitivity: 1.8 }).config
    player.setAudioResponseOverride(override)
    playerBridge.setAudioResponse.mockClear()
    const config = normalizeAudioResponseConfig({ version: 1, sensitivity: 0.6 }).config
    player.updateSceneSettings!(customDocument({ ...cameraAndEffects.scene, audioResponse: 'mapped-v1', audioResponseConfig: config }))
    expect(player.getAudioResponseState()).toMatchObject({ savedMode: 'mapped-v1', savedConfig: config, override, effectiveConfig: override })
    expect(playerBridge.setAudioResponse).not.toHaveBeenCalled()
    player.setAudioResponseOverride(null)
    expect(playerBridge.setAudioResponse).toHaveBeenCalledExactlyOnceWith('mapped-v1', config)
    playerBridge.setAudioResponse.mockClear()
    player.updateSceneSettings!(customDocument({ ...cameraAndEffects.scene, audioResponse: 'mapped-v1', audioResponseConfig: config, intent: { fov: 100 } }))
    expect(playerBridge.setAudioResponse).not.toHaveBeenCalled()
    player.updateSceneSettings!(cameraAndEffects)
    expect(playerBridge.setAudioResponse).toHaveBeenCalledExactlyOnceWith('legacy', undefined)
    expect(player.getAudioResponseState()).toMatchObject({ savedMode: 'legacy', savedConfig: null, override: null })
  })

  it('preserves user pause and independent view suspension while editing', async () => {
    const player = await loaded(custom)
    player.setPlaybackState('paused')
    player.setRenderingSuspended!(true)
    playerBridge.play.mockClear(); playerBridge.pause.mockClear(); playerBridge.setRenderingSuspended.mockClear()
    player.updateSceneSettings!(cameraAndEffects)
    expect(player.getPlaybackState()).toBe('paused')
    expect(playerBridge.play).not.toHaveBeenCalled()
    expect(playerBridge.pause).not.toHaveBeenCalled()
    expect(playerBridge.setRenderingSuspended).not.toHaveBeenCalled()
    expect(await player.captureFramePreview!()).toBeNull()
  })

  it.each([
    { name: 'invalid camera', scene: customDocument({ ...custom.scene, intent: { fov: 400 } }) },
    { name: 'forbidden nested field', scene: customDocument({ ...cameraAndEffects.scene, fx: { bloom: { enabled: true, shader: 'box(1);' } } }) },
    { name: 'new source', scene: customDocument({ visualizer: { shader: 'box(1);' } }) },
    { name: 'new skybox', scene: customDocument({ ...custom.scene, visualizer: { ...custom.scene.visualizer, skyboxPreset: 2 } }) },
    { name: 'runtime time', scene: customDocument({ ...custom.scene, state: { time: 12 } }) },
    { name: 'new template', scene: template },
    { name: 'route identity', scene: cameraAndEffects, key: 8 },
  ])('rejects $name before changing the live scene, audio response or recovery lease', async ({ scene, key }) => {
    const player = await loaded(custom, 7)
    const before = player.getAudioResponseState()
    expect(() => player.updateSceneSettings!(scene, { sceneKey: key ?? 7 })).toThrow()
    expect(playerBridge.setSceneSettings).not.toHaveBeenCalled()
    expect(playerBridge.setAudioResponse).not.toHaveBeenCalled()
    expect(player.getAudioResponseState()).toEqual(before)
    expect(mocks.begin).toHaveBeenCalledOnce()
    expect(mocks.leases[0].dispose).not.toHaveBeenCalled()
    expect(playerBridge.dispose).not.toHaveBeenCalled()
    player.updateSceneSettings!(cameraAndEffects, { sceneKey: 7 })
    expect(playerBridge.setSceneSettings).toHaveBeenCalledOnce()
  })

  it.each(['CHECKING', 'CUSTOM_RENDERING_DISABLED', 'stopped', 'disposed', 'safe-mode'])('blocks live edits while %s', async status => {
    const player = await loaded(custom)
    if (status === 'stopped') player.stopRendering!()
    else if (status === 'disposed') player.dispose()
    else if (status === 'safe-mode') mocks.safeMode = true
    else setAvailability('custom', status)
    expect(() => player.updateSceneSettings!(cameraAndEffects)).toThrow()
    expect(playerBridge.setSceneSettings).not.toHaveBeenCalled()
    expect(mocks.begin).toHaveBeenCalledOnce()
  })

  it('refuses a blocked next recovery revision without changing the permitted scene', async () => {
    const player = await loaded(custom)
    mocks.begin.mockReturnValueOnce(null)
    expect(() => player.updateSceneSettings!(cameraAndEffects)).toThrow(/Automatic rendering is paused/)
    expect(playerBridge.setSceneSettings).not.toHaveBeenCalled()
    expect(playerBridge.dispose).not.toHaveBeenCalled()
    expect(mocks.leases[0].dispose).not.toHaveBeenCalled()
    expect(player.getAudioResponseState().savedMode).toBe('legacy')
    player.updateSceneSettings!(cameraAndEffects)
    expect(playerBridge.setSceneSettings).toHaveBeenCalledOnce()
  })

  it('rejects updates before scene load and rolls back a rejected bridge enqueue', async () => {
    const player = await create(custom)
    expect(() => player.updateSceneSettings!(cameraAndEffects)).toThrow(/Load a scene/)
    await player.loadSceneBlob(custom)
    playerBridge.setSceneSettings.mockImplementationOnce(() => { throw new Error('Cannot enqueue') })
    expect(() => player.updateSceneSettings!(customDocument({ ...cameraAndEffects.scene, audioResponse: 'mapped-v1' }))).toThrow('Cannot enqueue')
    expect(player.getAudioResponseState().savedMode).toBe('legacy')
    expect(playerBridge.setAudioResponse).not.toHaveBeenCalled()
    expect(mocks.leases[0].dispose).not.toHaveBeenCalled()
    expect(mocks.leases[1].dispose).toHaveBeenCalledOnce()
    player.stopRendering!()
    expect(player.getStoppedRecoveryKey!()).toBe(sceneRecoveryKey(custom))
  })

  it('keeps the saved document recovery identity when preview defaults change under the same key', async () => {
    const player = await loaded(custom)
    player.updateSceneSettings!(customDocument({ ...cameraAndEffects.scene, audioResponse: 'mapped-v1' }), { recoverySceneBlob: custom })
    expect(mocks.begin).toHaveBeenCalledOnce()
    expect(mocks.leases[0].dispose).not.toHaveBeenCalled()
    expect(player.getAudioResponseState().savedMode).toBe('mapped-v1')
    player.setAudioResponseSettings('mapped-v1')
    player.updateRecoveryIdentity!(cameraAndEffects, { recoverySceneBlob: custom })
    expect(mocks.begin).toHaveBeenCalledOnce()
    expect(playerBridge.loadScene).toHaveBeenCalledOnce()
  })

  it('rejects a captured frame when a newer settings update arrives during capture', async () => {
    const player = await loaded(custom)
    const capture = deferred<Blob>()
    playerBridge.capture.mockReturnValueOnce(capture.promise)
    const pending = player.captureFramePreview!()
    await flush()
    player.updateSceneSettings!(cameraAndEffects)
    capture.resolve(new Blob(['old-settings'], { type: 'image/png' }))
    expect(await pending).toBeNull()
  })
})

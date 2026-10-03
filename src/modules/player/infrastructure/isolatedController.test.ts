import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MagePlayerController } from './playerController'
import { normalizeAudioResponseConfig } from '@shared/lib'

const mocks = vi.hoisted(() => ({ create: vi.fn(), check: vi.fn(), begin: vi.fn(), block: vi.fn(), revokeRetry: vi.fn(),
  statuses: new Map<unknown, { allowed: boolean; code: string }>(), availabilityListeners: new Map<unknown, Set<() => void>>(),
  recoveryListeners: new Set<() => void>(), blocked: new Map<string, { reason: string }>(), safeMode: false,
  leases: [] as Array<{ dispose: ReturnType<typeof vi.fn>; fail: ReturnType<typeof vi.fn> }>,
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

const template = { schemaVersion: 1, kind: 'template', templateId: 'reaction-rings-v1', templateVersion: 1 }
const custom = { visualizer: { shader: 'sphere(0.5);' } }
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
    loadAudio: vi.fn(async () => { state.loaded = true; state.duration = 60 }),
    play: vi.fn(async () => { state.playing = true }), pause: vi.fn(() => { state.playing = false }),
    seek: vi.fn((time: number) => { state.time = Math.min(60, time) }), setVolume: vi.fn((volume: number) => { state.volume = volume }),
    clearAudio: vi.fn(() => { state.loaded = false; state.duration = 0; state.time = 0 }),
    reset: vi.fn(() => { state.time = 0; state.playing = false }), setSynthetic: vi.fn(),
    setAudioResponse: vi.fn(), getAudioResponseCapabilities: vi.fn(() => null),
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
    const lease = { dispose: vi.fn(), fail: vi.fn() }
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
    await expect(create({ ...custom, intent: { fov: 400 } })).rejects.toThrow(/fov/)
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
    await expect(player.loadSceneBlob({ ...template, visualizer: custom.visualizer })).rejects.toThrow()
    expect(playerBridge.pause).not.toHaveBeenCalled()
    expect(playerBridge.loadScene).not.toHaveBeenCalled()
  })

  it('suspends and resumes the same scene/audio after a permission recheck', async () => {
    const player = await loaded(custom)
    await player.loadAudio({ sourcePath: 'blob:http://localhost/music', sourceLabel: 'Music' })
    playerBridge.loadScene.mockClear(); playerBridge.play.mockClear()
    setAvailability('custom', 'CHECKING')
    expect(playerBridge.pause).toHaveBeenCalled()
    expect(player.getPlaybackState()).toBe('playing')
    setAvailability('custom', 'ALLOWED')
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
    const attempts: Array<Promise<unknown>> = []
    for (let index = 0; index < 12; index++) {
      attempts.push(Promise.resolve(player.loadSceneBlob({ visualizer: { shader: `sphere(${index / 20 + 0.1});` } })).catch(error => error))
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

  it.each(['runtime', 'context-lost', 'startup-timeout', 'progress-timeout'])('records %s from the child boundary', async reason => {
    await loaded()
    mocks.create.mock.calls[0][0].onFailure(reason)
    expect(mocks.leases[0].fail).toHaveBeenCalledWith(reason)
    expect(playerBridge.dispose).toHaveBeenCalledOnce()
  })

  it('distinguishes deliberate stop from ordinary pause', async () => {
    const player = await loaded()
    player.setPlaybackState('paused')
    expect(mocks.leases[0].fail).not.toHaveBeenCalled()
    player.stopRendering!()
    expect(mocks.leases[0].fail).toHaveBeenCalledWith('stopped')
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
    const next = { ...custom, audioResponse: 'mapped-v1' }
    player.setAudioResponseSettings('mapped-v1')
    player.updateRecoveryIdentity!(next)
    expect(playerBridge.loadScene).toHaveBeenCalledOnce()
    expect(mocks.begin).toHaveBeenLastCalledWith(sceneRecoveryKey(next))
    expect(mocks.leases[0].dispose).toHaveBeenCalledOnce()
    expect(() => player.updateRecoveryIdentity!({ visualizer: { shader: 'box(1, 1, 1);' } })).toThrow(/complete scene load/)
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
})

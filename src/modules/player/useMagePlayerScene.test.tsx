import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { customDocument } from '@shared/test/sceneDocument'
import { buildAudioResponseController } from '@shared/test/audioResponseController'
import type { MagePlayerController } from './infrastructure/playerController'
import { useMagePlayerScene } from './useMagePlayerScene'

const mocks = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('./infrastructure/engineAdapter', () => ({ createMagePlayer: mocks.create }))
vi.mock('./availability/sceneAvailability', () => ({ sceneAvailabilityStore: { isAllowed: () => true } }))
vi.mock('./recovery/sceneRecovery', async importOriginal => ({
  ...await importOriginal<object>(), sceneRecovery: { isSafeMode: () => false, getBlock: () => null },
}))

const firstScene = customDocument({ visualizer: { shader: 'sphere(1);' } })
const nextScene = customDocument({ visualizer: { shader: 'box(1);' } })
const settingsRevision = customDocument({ ...firstScene.scene, intent: { fov: 80 } })
type Options = Parameters<typeof useMagePlayerScene>[0]

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function controller() {
  const audio = { currentTime: 0, duration: 0, hasSource: false, isLoaded: false, sourcePath: null, volume: 1 }
  return {
    ...buildAudioResponseController(),
    dispose: vi.fn(), clearAudio: vi.fn(() => audio), getAudioState: vi.fn(() => audio),
    getPlaybackState: vi.fn(() => 'paused' as const), setPlaybackState: vi.fn(state => state),
    loadSceneBlob: vi.fn(async () => {}), loadAudio: vi.fn(async () => audio),
    resetPlayback: vi.fn(() => 'paused' as const), seekAudio: vi.fn(() => audio),
    setAudioVolume: vi.fn(() => audio), setSyntheticPreview: vi.fn(),
    setRenderingSuspended: vi.fn(), updateSceneSettings: vi.fn(),
  } satisfies MagePlayerController
}

function options(): Options {
  return { hostRef: { current: document.createElement('div') }, sceneBlob: firstScene,
    renderProfile: 'preview', availabilityPending: false, recoveryRevision: 0,
    playbackIntentRef: { current: { playback: 'paused', initialPlayback: 'paused', sceneKey: undefined } },
    onReplaceRetiredRenderer: vi.fn(), onCreated: vi.fn(), onReady: vi.fn(), onError: vi.fn(),
    onDispose: vi.fn(), onCapabilities: vi.fn() }
}

async function start() { await act(async () => { await vi.advanceTimersByTimeAsync(20) }) }
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks() })
afterEach(() => { vi.useRealTimers() })

describe('useMagePlayerScene lifecycle ownership', () => {
  it('reports a first-scene startup failure instead of staying in loading', async () => {
    mocks.create.mockRejectedValue(new Error('Renderer startup failed'))
    const initial = options()
    const { result } = renderHook(useMagePlayerScene, { initialProps: initial })
    await start()
    expect(result.current.status).toBe('error')
    expect(result.current.loadError).toContain('Renderer startup failed')
    expect(initial.onError).toHaveBeenCalledOnce()
    expect(initial.onReplaceRetiredRenderer).not.toHaveBeenCalled()
  })

  it.each([['source', nextScene], ['live settings', settingsRevision]] as const)('replaces a failed pending factory when a newer %s revision is now requested', async (_kind, sceneBlob) => {
    const startup = deferred<MagePlayerController>(), initial = options()
    mocks.create.mockReturnValue(startup.promise)
    const { result, rerender } = renderHook(useMagePlayerScene, { initialProps: initial })
    await start()
    rerender({ ...initial, sceneBlob })
    await act(async () => { startup.reject(new Error('Older startup failed')) })
    expect(initial.onReplaceRetiredRenderer).toHaveBeenCalledOnce()
    expect(initial.onError).not.toHaveBeenCalled()
    expect(result.current.loadError).toBeNull()
  })

  it('loads only the latest scene when a pending factory resolves after replacement', async () => {
    const startup = deferred<MagePlayerController>(), initial = options(), player = controller()
    mocks.create.mockReturnValue(startup.promise)
    const { rerender } = renderHook(useMagePlayerScene, { initialProps: initial })
    await start()
    rerender({ ...initial, sceneBlob: nextScene })
    await act(async () => { startup.resolve(player) })
    expect(player.loadSceneBlob).toHaveBeenCalledExactlyOnceWith(nextScene)
    expect(initial.onReady).toHaveBeenCalledExactlyOnceWith(player, false)
  })

  it('cancels ownership while creation is pending and disposes a late result once', async () => {
    const startup = deferred<MagePlayerController>(), initial = options(), player = controller()
    mocks.create.mockReturnValue(startup.promise)
    const { unmount } = renderHook(useMagePlayerScene, { initialProps: initial })
    await start()
    const signal = mocks.create.mock.calls[0][1].signal as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => { startup.resolve(player) })
    expect(player.dispose).toHaveBeenCalledOnce()
    expect(player.loadSceneBlob).not.toHaveBeenCalled()
    expect(initial.onCreated).not.toHaveBeenCalled()
    expect(initial.onReady).not.toHaveBeenCalled()
  })

  it.each(['success', 'failure'] as const)('ignores an older scene load %s after the replacement is ready', async outcome => {
    const olderLoad = deferred<void>(), initial = options(), player = controller()
    player.loadSceneBlob.mockReturnValueOnce(olderLoad.promise)
    mocks.create.mockResolvedValue(player)
    const { result, rerender } = renderHook(useMagePlayerScene, { initialProps: initial })
    await start()
    expect(player.loadSceneBlob).toHaveBeenCalledExactlyOnceWith(firstScene)
    rerender({ ...initial, sceneBlob: nextScene })
    await act(async () => {})
    expect(result.current.status).toBe('ready')
    expect(initial.onReady).toHaveBeenCalledOnce()
    await act(async () => {
      if (outcome === 'success') olderLoad.resolve()
      else olderLoad.reject(new Error('Retired load failed'))
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.loadError).toBeNull()
    expect(initial.onReady).toHaveBeenCalledOnce()
    expect(initial.onError).not.toHaveBeenCalled()
    expect(player.updateSceneSettings).not.toHaveBeenCalled()
  })

  it('waits to load the newest scene while its availability is being checked', async () => {
    const initial = { ...options(), availabilityPending: true }, player = controller()
    mocks.create.mockResolvedValue(player)
    const { result, rerender } = renderHook(useMagePlayerScene, { initialProps: initial })
    await start()
    expect(result.current.status).toBe('loading')
    expect(player.loadSceneBlob).not.toHaveBeenCalled()
    rerender({ ...initial, sceneBlob: nextScene, availabilityPending: false })
    await act(async () => {})
    expect(player.loadSceneBlob).toHaveBeenCalledExactlyOnceWith(nextScene)
    expect(result.current.status).toBe('ready')
  })

  it('cancels StrictMode’s retired animation frame and disposes the active renderer on unmount', async () => {
    const initial = options(), player = controller()
    mocks.create.mockResolvedValue(player)
    const { unmount } = renderHook(useMagePlayerScene, { initialProps: initial,
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode> })
    await start()
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(initial.onReady).toHaveBeenCalledOnce()
    unmount()
    expect(player.dispose).toHaveBeenCalledOnce()
    expect(mocks.create.mock.calls[0][1].signal.aborted).toBe(true)
  })
})

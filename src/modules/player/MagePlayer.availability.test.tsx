import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer } from './MagePlayer'
import { createMagePlayer, type MagePlayerController } from './infrastructure/engineAdapter'
import { sceneRecovery, sceneRecoveryKey } from './recovery/sceneRecovery'
import { buildMagePlayerController, buildMagePlayerSceneBlob, buildMagePlayerTrack } from './test-fixtures'
import type { SceneAvailabilityTarget } from './availability/sceneAvailability'

type Target = SceneAvailabilityTarget
type Permission = { allowed: boolean; code: string; message: string; checkedAt: number | null }
const permissions = vi.hoisted(() => {
  const states = new Map<Target, Permission>()
  const listeners = new Map<Target, Set<() => void>>()
  const checking = { allowed: false, code: 'CHECKING', message: 'Checking whether this scene can play…', checkedAt: null }
  return {
    states, listeners,
    store: {
      getSnapshot: (target: Target) => states.get(target) ?? checking,
      subscribe: (target: Target, listener: () => void) => {
        const group = listeners.get(target) ?? new Set<() => void>()
        group.add(listener)
        listeners.set(target, group)
        return () => { group.delete(listener) }
      },
      isAllowed: (target: Target) => states.get(target)?.allowed === true,
      check: vi.fn(async () => undefined),
    },
  }
})

vi.mock('./availability/sceneAvailability', () => ({ sceneAvailabilityStore: permissions.store }))
vi.mock('./infrastructure/engineAdapter', () => ({ createMagePlayer: vi.fn() }))

const keys = new Set<string>()
const allowed = { allowed: true, code: 'AVAILABLE', message: '', checkedAt: 1 }
const disabled = { allowed: false, code: 'SCENE_DISABLED', message: 'This scene is temporarily unavailable.', checkedAt: 1 }
const globalDisabled = { allowed: false, code: 'CUSTOM_RENDERING_DISABLED', message: 'Scene playback is temporarily disabled.', checkedAt: 1 }
const checking = { allowed: false, code: 'CHECKING', message: 'Checking whether this scene can play…', checkedAt: null }

function permission(target: Target, value: Permission) {
  act(() => {
    permissions.states.set(target, value)
    permissions.listeners.get(target)?.forEach(listener => listener())
  })
}

function remember(scene: unknown, id: number) {
  const key = sceneRecoveryKey(scene, id)!
  keys.add(key)
  return key
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createMagePlayer).mockReset()
  permissions.states.clear()
  permissions.listeners.clear()
  sceneRecovery.setSafeMode(false)
  for (const key of keys) sceneRecovery.clear(key)
})

afterEach(() => {
  cleanup()
  sceneRecovery.setSafeMode(false)
  for (const key of keys) sceneRecovery.clear(key)
})

describe('MagePlayer live availability', () => {
  it.each(['permission-check', 'compilation'] as const)('allows an immediate music pause during %s and does not resume it on completion', async pendingReason => {
    const scene = buildMagePlayerSceneBlob()
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValueOnce(controller)
    permission(930, allowed)
    const tracks = [buildMagePlayerTrack()]
    const view = render(<MagePlayer sceneBlob={scene} sceneKey={930} playlistTracks={tracks} selectedTrackId="track-1" />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause scene and audio playback' })).toBeEnabled())
    const compiling = deferred<void>()
    if (pendingReason === 'permission-check') permission(930, checking)
    else {
      vi.mocked(controller.loadSceneBlob).mockReturnValueOnce(compiling.promise)
      view.rerender(<MagePlayer sceneBlob={buildMagePlayerSceneBlob({ visualizer: { shader: 'box(0.5);' } })}
        sceneKey={930} playlistTracks={tracks} selectedTrackId="track-1" />)
      await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledTimes(2))
    }
    const pause = screen.getByRole('button', { name: 'Pause scene and audio playback' })
    expect(pause).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Add audio tracks' })).toBeDisabled()
    fireEvent.click(pause)
    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    expect(screen.getByRole('button', { name: 'Play scene and audio playback' })).toBeDisabled()
    vi.mocked(controller.setPlaybackState).mockClear()
    if (pendingReason === 'permission-check') permission(930, allowed)
    else await act(async () => { compiling.resolve() })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play scene and audio playback' })).toBeEnabled())
    expect(controller.setPlaybackState).not.toHaveBeenCalledWith('playing')
    expect(controller.loadAudio).toHaveBeenCalledOnce()
    expect(createMagePlayer).toHaveBeenCalledOnce()
  })

  it('aborts pending startup as soon as navigation removes the player', async () => {
    const creation = deferred<MagePlayerController>()
    vi.mocked(createMagePlayer).mockReturnValueOnce(creation.promise)
    permission(931, allowed)
    const scene = buildMagePlayerSceneBlob()
    const key = remember(scene, 931)
    const view = render(<MagePlayer sceneBlob={scene} sceneKey={931} />)
    await waitFor(() => expect(createMagePlayer).toHaveBeenCalledOnce())
    const signal = vi.mocked(createMagePlayer).mock.calls[0][1]?.signal
    expect(signal?.aborted).toBe(false)
    view.unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => { creation.reject(new DOMException('Cancelled', 'AbortError')) })
    expect(sceneRecovery.getBlock(key)).toBeNull()
    expect(createMagePlayer).toHaveBeenCalledOnce()
  })

  it('suspends previous visuals while a different scene target is checked without pausing its music', async () => {
    const scene = buildMagePlayerSceneBlob()
    const setRenderingSuspended = vi.fn()
    const controller = buildMagePlayerController({ setRenderingSuspended })
    vi.mocked(createMagePlayer).mockResolvedValueOnce(controller)
    permission(932, allowed)
    permission(933, checking)
    const tracks = [buildMagePlayerTrack()]
    const view = render(<MagePlayer sceneBlob={scene} sceneKey={932} playlistTracks={tracks} selectedTrackId="track-1" />)
    await waitFor(() => expect(controller.loadAudio).toHaveBeenCalledOnce())
    vi.mocked(controller.setPlaybackState).mockClear()
    const replacement = buildMagePlayerSceneBlob({ visualizer: { shader: 'box(0.5);' } })
    view.rerender(<MagePlayer sceneBlob={replacement} sceneKey={933} playlistTracks={tracks} selectedTrackId="track-1" />)
    expect(setRenderingSuspended).toHaveBeenLastCalledWith(true)
    expect(controller.setPlaybackState).not.toHaveBeenCalledWith('paused')
    expect(controller.loadSceneBlob).toHaveBeenCalledOnce()
    expect(controller.loadAudio).toHaveBeenCalledOnce()
    expect(controller.dispose).not.toHaveBeenCalled()
    permission(933, allowed)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenLastCalledWith(replacement, { sceneKey: 933 }))
    expect(setRenderingSuspended).toHaveBeenLastCalledWith(false)
    expect(controller.loadAudio).toHaveBeenCalledOnce()
    expect(createMagePlayer).toHaveBeenCalledOnce()
  })

  it('replaces a failed older compilation only for the newly permitted scene and leaves the failed version blocked', async () => {
    const first = buildMagePlayerSceneBlob()
    const compilingScene = buildMagePlayerSceneBlob({ visualizer: { shader: 'box(0.5);' } })
    const nextScene = buildMagePlayerSceneBlob({ visualizer: { shader: 'sphere(0.2);' } })
    const failedKey = remember(compilingScene, 934)
    remember(first, 934)
    remember(nextScene, 935)
    const compile = deferred<void>()
    let stopped = false
    const retired = buildMagePlayerController({
      getStoppedRecoveryKey: () => stopped ? failedKey : null,
      setRenderingSuspended: vi.fn(() => { if (stopped) throw new Error('This preview has stopped.') }),
      loadSceneBlob: vi.fn<MagePlayerController['loadSceneBlob']>().mockReturnValueOnce(undefined).mockReturnValueOnce(compile.promise),
    })
    const fresh = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValueOnce(retired).mockResolvedValueOnce(fresh)
    permission(934, allowed)
    permission(935, checking)
    const view = render(<MagePlayer sceneBlob={first} sceneKey={934} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause scene and audio playback' })).toBeEnabled())
    view.rerender(<MagePlayer sceneBlob={compilingScene} sceneKey={934} />)
    await waitFor(() => expect(retired.loadSceneBlob).toHaveBeenCalledTimes(2))
    view.rerender(<MagePlayer sceneBlob={nextScene} sceneKey={935} />)
    await act(async () => {
      stopped = true
      sceneRecovery.block(failedKey, 'compile')
      compile.reject(new Error('Isolated player stopped.'))
    })
    expect(createMagePlayer).toHaveBeenCalledOnce()
    expect(screen.getByText(checking.message)).toBeInTheDocument()
    permission(935, allowed)
    await waitFor(() => expect(fresh.loadSceneBlob).toHaveBeenCalledWith(nextScene, { sceneKey: 935 }))
    expect(createMagePlayer).toHaveBeenCalledTimes(2)
    expect(retired.loadSceneBlob).toHaveBeenCalledTimes(2)
    expect(sceneRecovery.getBlock(failedKey)?.reason).toBe('compile')
    view.rerender(<MagePlayer sceneBlob={compilingScene} sceneKey={934} />)
    expect(screen.getByRole('button', { name: 'Retry scene' })).toBeInTheDocument()
    expect(createMagePlayer).toHaveBeenCalledTimes(2)
  })

  it.each(['playing', 'paused'] as const)('retains the authorized renderer, playlist, position, and %s choice through a permission recheck', async initialPlayback => {
    const scene = buildMagePlayerSceneBlob()
    const controller = buildMagePlayerController()
    const onCapture = vi.fn()
    const onPlaylistChange = vi.fn()
    const onSelectedTrackChange = vi.fn()
    const tracks = [buildMagePlayerTrack(), buildMagePlayerTrack({ id: 'track-2', name: 'second.mp3', sourcePath: '/second.mp3' })]
    vi.mocked(createMagePlayer).mockResolvedValueOnce(controller)
    permission(920, allowed)
    const view = render(<MagePlayer sceneBlob={scene} sceneKey={920} initialPlayback={initialPlayback}
      playlistTracks={tracks} selectedTrackId="track-2" onPlaylistChange={onPlaylistChange}
      onSelectedTrackChange={onSelectedTrackChange} onCaptureFramePreviewChange={onCapture} />)
    await waitFor(() => expect(controller.loadAudio).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Seek scene audio' })).toBeEnabled())
    fireEvent.change(screen.getByRole('slider', { name: 'Seek scene audio' }), { target: { value: '42' } })
    expect(screen.getByRole('slider', { name: 'Seek scene audio' })).toHaveValue('42')
    const canvas = view.container.querySelector('.mage-player__render-host')
    const sourceLoads = vi.mocked(controller.loadSceneBlob).mock.calls.length
    const trackLoads = vi.mocked(controller.loadAudio).mock.calls.length
    const playlistChanges = onPlaylistChange.mock.calls.length
    const selectionChanges = onSelectedTrackChange.mock.calls.length
    const oldCapture = onCapture.mock.lastCall![0] as () => Promise<string | null>

    permission(920, checking)
    expect(screen.getByText(checking.message)).toBeInTheDocument()
    expect(view.container.querySelector('.mage-player__render-host')).toBe(canvas)
    expect(controller.dispose).not.toHaveBeenCalled()
    expect(onCapture).toHaveBeenLastCalledWith(null)
    await expect(oldCapture()).resolves.toBeNull()
    expect(controller.captureFramePreview).not.toHaveBeenCalled()
    expect(createMagePlayer).toHaveBeenCalledOnce()
    expect(controller.loadSceneBlob).toHaveBeenCalledTimes(sourceLoads)
    expect(controller.loadAudio).toHaveBeenCalledTimes(trackLoads)
    const add = screen.queryByRole('button', { name: 'Add audio tracks' })
    expect(add === null || add.hasAttribute('disabled')).toBe(true)

    permission(920, allowed)
    await waitFor(() => expect(onCapture.mock.lastCall?.[0]).toEqual(expect.any(Function)))
    expect(screen.getByRole('slider', { name: 'Seek scene audio' })).toHaveValue('42')
    expect(screen.getByRole('button', { name: 'Track 2/2: second.mp3' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `${initialPlayback === 'playing' ? 'Pause' : 'Play'} scene and audio playback` })).toBeEnabled()
    expect(view.container.querySelector('.mage-player__render-host')).toBe(canvas)
    expect(createMagePlayer).toHaveBeenCalledOnce()
    expect(controller.loadSceneBlob).toHaveBeenCalledTimes(sourceLoads)
    expect(controller.loadAudio).toHaveBeenCalledTimes(trackLoads)
    expect(controller.clearAudio).not.toHaveBeenCalled()
    expect(controller.resetPlayback).not.toHaveBeenCalled()
    expect(onPlaylistChange).toHaveBeenCalledTimes(playlistChanges)
    expect(onSelectedTrackChange).toHaveBeenCalledTimes(selectionChanges)
  })

  it.each([disabled, globalDisabled, { allowed: false, code: 'STATUS_UNAVAILABLE', message: 'Playback is paused until scene availability can be checked.', checkedAt: null }])('disposes the retained renderer when checking ends in $code', async result => {
      const controller = buildMagePlayerController()
      vi.mocked(createMagePlayer).mockResolvedValueOnce(controller)
      permission(921, allowed)
      const view = render(<MagePlayer sceneBlob={buildMagePlayerSceneBlob()} sceneKey={921} />)
      await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledOnce())
      permission(921, checking)
      expect(controller.dispose).not.toHaveBeenCalled()
      permission(921, result)
      expect(controller.dispose).toHaveBeenCalledOnce()
      expect(view.container.querySelector('.mage-player__render-host')).toBeNull()
      expect(screen.getByText(result.message)).toBeInTheDocument()
      expect(createMagePlayer).toHaveBeenCalledOnce()
    })

  it('retains the paused renderer when its source changes during checking and delays replacement until allowed', async () => {
    const first = buildMagePlayerSceneBlob()
    const second = buildMagePlayerSceneBlob({ visualizer: { shader: 'box(1);' } })
    const controller = buildMagePlayerController()
    const tracks = [buildMagePlayerTrack(), buildMagePlayerTrack({ id: 'next', name: 'next.mp3', sourcePath: '/next.mp3' })]
    vi.mocked(createMagePlayer).mockResolvedValueOnce(controller)
    permission(922, allowed)
    const view = render(<MagePlayer sceneBlob={first} sceneKey={922} playlistTracks={tracks} selectedTrackId={tracks[0].id} />)
    await waitFor(() => expect(controller.loadAudio).toHaveBeenCalledOnce())
    const sourceLoads = vi.mocked(controller.loadSceneBlob).mock.calls.length
    const trackLoads = vi.mocked(controller.loadAudio).mock.calls.length
    permission(922, checking)
    view.rerender(<MagePlayer sceneBlob={second} sceneKey={922} playlistTracks={tracks} selectedTrackId="next" />)
    await act(async () => {})
    expect(controller.loadSceneBlob).toHaveBeenCalledTimes(sourceLoads)
    expect(controller.loadAudio).toHaveBeenCalledTimes(trackLoads)
    expect(controller.dispose).not.toHaveBeenCalled()
    expect(createMagePlayer).toHaveBeenCalledOnce()
    permission(922, allowed)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenLastCalledWith(second, { sceneKey: 922 }))
    await waitFor(() => expect(controller.loadAudio).toHaveBeenLastCalledWith({ sourceLabel: 'next.mp3', sourcePath: '/next.mp3', signal: expect.any(AbortSignal) }))
    expect(createMagePlayer).toHaveBeenCalledOnce()
  })

  it('retains the renderer for a track-only change and delays loading that audio until allowed', async () => {
    const scene = buildMagePlayerSceneBlob()
    const controller = buildMagePlayerController()
    const tracks = [buildMagePlayerTrack(), buildMagePlayerTrack({ id: 'next', name: 'next.mp3', sourcePath: '/next.mp3' })]
    vi.mocked(createMagePlayer).mockResolvedValueOnce(controller)
    permission(924, allowed)
    const view = render(<MagePlayer sceneBlob={scene} sceneKey={924} playlistTracks={tracks} selectedTrackId={tracks[0].id} />)
    await waitFor(() => expect(controller.loadAudio).toHaveBeenCalledOnce())
    const sourceLoads = vi.mocked(controller.loadSceneBlob).mock.calls.length
    permission(924, checking)
    view.rerender(<MagePlayer sceneBlob={scene} sceneKey={924} playlistTracks={tracks} selectedTrackId="next" />)
    await act(async () => {})
    expect(controller.loadAudio).toHaveBeenCalledOnce()
    expect(controller.dispose).not.toHaveBeenCalled()
    permission(924, allowed)
    await waitFor(() => expect(controller.loadAudio).toHaveBeenLastCalledWith({ sourceLabel: 'next.mp3', sourcePath: '/next.mp3', signal: expect.any(AbortSignal) }))
    expect(controller.loadSceneBlob).toHaveBeenCalledTimes(sourceLoads)
    expect(controller.loadAudio).toHaveBeenCalledTimes(2)
    expect(createMagePlayer).toHaveBeenCalledOnce()
  })

  it('cannot allocate a replacement renderer after an actual denial turns into checking', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValueOnce(controller)
    permission(923, allowed)
    const view = render(<MagePlayer sceneBlob={buildMagePlayerSceneBlob()} sceneKey={923} />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledOnce())
    permission(923, disabled)
    expect(controller.dispose).toHaveBeenCalledOnce()
    permission(923, checking)
    await act(async () => {})
    expect(createMagePlayer).toHaveBeenCalledOnce()
    expect(view.container.querySelector('.mage-player__render-host')).toBeNull()
  })

  it.each(['resolves', 'rejects'] as const)('recovers initialization that %s after a recheck begins without loading under unknown permission', async outcome => {
    const creation = deferred<MagePlayerController>()
    const lateController = buildMagePlayerController()
    const freshController = buildMagePlayerController()
    const scene = buildMagePlayerSceneBlob()
    vi.mocked(createMagePlayer).mockReturnValueOnce(creation.promise).mockResolvedValueOnce(freshController)
    permission(925, allowed)
    render(<MagePlayer sceneBlob={scene} sceneKey={925} />)
    await waitFor(() => expect(createMagePlayer).toHaveBeenCalledOnce())
    permission(925, checking)
    await act(async () => {
      if (outcome === 'resolves') creation.resolve(lateController)
      else creation.reject(new Error('Permission changed while initializing'))
    })
    expect(lateController.loadSceneBlob).not.toHaveBeenCalled()
    expect(freshController.loadSceneBlob).not.toHaveBeenCalled()
    expect(createMagePlayer).toHaveBeenCalledOnce()
    if (outcome === 'resolves') expect(lateController.dispose).toHaveBeenCalledOnce()
    expect(screen.queryByText('Permission changed while initializing')).not.toBeInTheDocument()
    permission(925, allowed)
    await waitFor(() => expect(freshController.loadSceneBlob).toHaveBeenCalledOnce())
    expect(freshController.loadSceneBlob).toHaveBeenCalledWith(scene, { sceneKey: 925 })
    expect(createMagePlayer).toHaveBeenCalledTimes(2)
    expect(freshController.dispose).not.toHaveBeenCalled()
  })

  it.each([
    ['unknown', undefined],
    ['globally disabled', globalDisabled],
    ['scene disabled', disabled],
    ['status unavailable', { allowed: false, code: 'STATUS_UNAVAILABLE', message: 'Playback is paused until scene availability can be checked.', checkedAt: null }],
  ] as const)('does not initialize cached source when permission is %s', async (_label, status) => {
    const scene = buildMagePlayerSceneBlob()
    remember(scene, 901)
    if (status) permission(901, status)
    const view = render(<MagePlayer sceneBlob={scene} sceneKey={901} posterUrl="/saved.png" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(view.container.querySelector('img')).toHaveAttribute('src', '/saved.png')
    await act(async () => {})
    expect(createMagePlayer).not.toHaveBeenCalled()
    expect(view.container.querySelector('.mage-player__render-host')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry scene' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resume scene' })).not.toBeInTheDocument()
  })

  it('checks anonymous editor source against the global switch, ignoring a scene ID inside source', async () => {
    permission('custom', globalDisabled)
    permission(901, allowed)
    render(<MagePlayer sceneBlob={buildMagePlayerSceneBlob({ sceneId: 901 })} />)
    expect(screen.getByText('Scene playback is temporarily disabled.')).toBeInTheDocument()
    await act(async () => {})
    expect(createMagePlayer).not.toHaveBeenCalled()
  })

  it('checks status again without granting permission or mounting a renderer', async () => {
    permission(902, { allowed: false, code: 'STATUS_UNAVAILABLE', message: 'Playback is paused until scene availability can be checked.', checkedAt: null })
    render(<MagePlayer sceneBlob={buildMagePlayerSceneBlob()} sceneKey={902} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(permissions.store.check).toHaveBeenCalledWith(902)
    expect(createMagePlayer).not.toHaveBeenCalled()
  })

  it('requests freshly restored source only after permission allows the saved scene', async () => {
    const onAvailabilityRestored = vi.fn(async () => undefined)
    permission('status:903', disabled)
    const view = render(<MagePlayer sceneBlob={null} sceneKey={903} onAvailabilityRestored={onAvailabilityRestored} />)
    expect(onAvailabilityRestored).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument()
    permission('status:903', allowed)
    await waitFor(() => expect(onAvailabilityRestored).toHaveBeenCalledOnce())
    expect(screen.getByText('Loading this scene…')).toBeInTheDocument()
    expect(createMagePlayer).not.toHaveBeenCalled()

    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValueOnce(controller)
    const restored = buildMagePlayerSceneBlob({ visualizer: { shader: 'repaired' } })
    permission(903, allowed)
    view.rerender(<MagePlayer sceneBlob={restored} sceneKey={903} onAvailabilityRestored={onAvailabilityRestored} />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledWith(restored, { sceneKey: 903 }))
    expect(onAvailabilityRestored).toHaveBeenCalledOnce()
  })

  it('catches a source refresh rejection and offers a deliberate retry without rendering defaults', async () => {
    const onAvailabilityRestored = vi.fn().mockRejectedValueOnce(new Error('Source download failed')).mockResolvedValueOnce(undefined)
    permission('status:904', allowed)
    render(<MagePlayer sceneBlob={null} sceneKey={904} onAvailabilityRestored={onAvailabilityRestored} />)
    expect(await screen.findByText('This scene could not be loaded. You can check again.')).toBeInTheDocument()
    expect(createMagePlayer).not.toHaveBeenCalled()
    expect(screen.queryByText('Source download failed')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(onAvailabilityRestored).toHaveBeenCalledTimes(2))
    expect(screen.getByText('Loading this scene…')).toBeInTheDocument()
    expect(createMagePlayer).not.toHaveBeenCalled()
  })

  it('ignores a source refresh rejection after moving to a different saved scene', async () => {
    const oldSource = deferred<void>()
    const oldRestore = vi.fn(() => oldSource.promise)
    permission('status:905', allowed)
    const view = render(<MagePlayer sceneBlob={null} sceneKey={905} onAvailabilityRestored={oldRestore} />)
    await waitFor(() => expect(oldRestore).toHaveBeenCalledOnce())
    const nextRestore = vi.fn(async () => undefined)
    permission('status:906', allowed)
    view.rerender(<MagePlayer sceneBlob={null} sceneKey={906} onAvailabilityRestored={nextRestore} />)
    await waitFor(() => expect(nextRestore).toHaveBeenCalledOnce())
    await act(async () => oldSource.reject(new Error('Stale source failure')))
    expect(screen.getByText('Loading this scene…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument()
    expect(createMagePlayer).not.toHaveBeenCalled()
  })

  it('restores an initially unavailable template with custom rendering disabled after checking fresh source', async () => {
    const onAvailabilityRestored = vi.fn(async () => undefined)
    const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
    permission('custom', globalDisabled)
    permission(917, globalDisabled)
    permission('status:917', disabled)
    const view = render(<MagePlayer sceneBlob={null} sceneKey={917} onAvailabilityRestored={onAvailabilityRestored} />)
    expect(onAvailabilityRestored).not.toHaveBeenCalled()
    expect(createMagePlayer).not.toHaveBeenCalled()
    permission('status:917', allowed)
    await waitFor(() => expect(onAvailabilityRestored).toHaveBeenCalledOnce())
    expect(createMagePlayer).not.toHaveBeenCalled()
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValueOnce(controller)
    permission('template:917', allowed)
    view.rerender(<MagePlayer sceneBlob={template} sceneKey={917} onAvailabilityRestored={onAvailabilityRestored} />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledWith(template, { sceneKey: 917 }))
    expect(createMagePlayer).toHaveBeenCalledExactlyOnceWith(expect.any(HTMLDivElement), expect.objectContaining({ initialSceneBlob: template, sceneKey: 917 }))
  })

  it('does not render an unexpected custom response obtained through metadata-only restoration', async () => {
    const onAvailabilityRestored = vi.fn(async () => undefined)
    permission('status:918', allowed)
    permission(918, globalDisabled)
    const view = render(<MagePlayer sceneBlob={null} sceneKey={918} onAvailabilityRestored={onAvailabilityRestored} />)
    await waitFor(() => expect(onAvailabilityRestored).toHaveBeenCalledOnce())
    view.rerender(<MagePlayer sceneBlob={buildMagePlayerSceneBlob()} sceneKey={918} onAvailabilityRestored={onAvailabilityRestored} />)
    expect(screen.getByText('Scene playback is temporarily disabled.')).toBeInTheDocument()
    expect(createMagePlayer).not.toHaveBeenCalled()
    expect(view.container.querySelector('.mage-player__render-host')).toBeNull()
  })

  it('ends a draft template renderer and its capture when the editor switches to custom mode', async () => {
    const pending = deferred<string>()
    const controller = buildMagePlayerController({ captureFramePreview: vi.fn(() => pending.promise) })
    vi.mocked(createMagePlayer).mockResolvedValueOnce(controller)
    const onCapture = vi.fn()
    const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
    permission('draft-template', allowed)
    permission('custom', globalDisabled)
    const view = render(<MagePlayer sceneBlob={template} onCaptureFramePreviewChange={onCapture} />)
    await waitFor(() => expect(onCapture.mock.lastCall?.[0]).toEqual(expect.any(Function)))
    const capture = (onCapture.mock.lastCall![0] as () => Promise<string | null>)()
    view.rerender(<MagePlayer sceneBlob={buildMagePlayerSceneBlob()} onCaptureFramePreviewChange={onCapture} />)
    expect(controller.dispose).toHaveBeenCalledOnce()
    expect(onCapture).toHaveBeenLastCalledWith(null)
    expect(createMagePlayer).toHaveBeenCalledOnce()
    pending.resolve('data:image/png;base64,old-template')
    await expect(capture).resolves.toBeNull()
  })

  it('disposes running rendering, withdraws capture access, and restores the current editor and playlist props', async () => {
    const scene = buildMagePlayerSceneBlob({ visualizer: { shader: 'unsaved-edit' } })
    const saved = buildMagePlayerSceneBlob({ visualizer: { shader: 'saved-revision' } })
    remember(saved, 907)
    const first = buildMagePlayerController()
    const restored = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValueOnce(first).mockResolvedValueOnce(restored)
    const onCapture = vi.fn()
    const onCapabilities = vi.fn()
    const track = buildMagePlayerTrack()
    permission(907, allowed)
    render(<MagePlayer sceneBlob={scene} recoverySceneBlob={saved} sceneKey={907}
      playlistTracks={[track]} selectedTrackId={track.id} simulatedBeat={{ enabled: true, bpm: 150 }}
      onCaptureFramePreviewChange={onCapture} onAudioResponseCapabilitiesChange={onCapabilities}/>)
    await waitFor(() => expect(first.loadAudio).toHaveBeenCalled())
    await waitFor(() => expect(onCapture.mock.lastCall?.[0]).toEqual(expect.any(Function)))
    const oldCapture = onCapture.mock.lastCall![0] as () => Promise<string | null>

    permission(907, disabled)
    expect(first.dispose).toHaveBeenCalledOnce()
    expect(onCapture).toHaveBeenLastCalledWith(null)
    expect(onCapabilities).toHaveBeenLastCalledWith(null)
    expect(screen.queryByRole('button', { name: 'Add audio tracks' })).not.toBeInTheDocument()
    await expect(oldCapture()).resolves.toBeNull()
    expect(first.captureFramePreview).not.toHaveBeenCalled()

    permission(907, allowed)
    await waitFor(() => expect(restored.loadSceneBlob).toHaveBeenCalledWith(scene, { sceneKey: 907, recoverySceneBlob: saved }))
    await waitFor(() => expect(restored.loadAudio).toHaveBeenCalledWith({ sourceLabel: track.name, sourcePath: track.sourcePath, signal: expect.any(AbortSignal) }))
    expect(restored.setSyntheticPreview).toHaveBeenCalledWith(true, 24, 1.25)
    expect(createMagePlayer).toHaveBeenCalledTimes(2)
  })

  it('discards a capture that finishes after playback has been disabled', async () => {
    const captured = deferred<string>()
    const controller = buildMagePlayerController({ captureFramePreview: vi.fn(() => captured.promise) })
    vi.mocked(createMagePlayer).mockResolvedValueOnce(controller)
    const onCapture = vi.fn()
    permission(908, allowed)
    render(<MagePlayer sceneBlob={buildMagePlayerSceneBlob()} sceneKey={908} onCaptureFramePreviewChange={onCapture}/>)
    await waitFor(() => expect(onCapture.mock.lastCall?.[0]).toEqual(expect.any(Function)))
    const pendingCapture = (onCapture.mock.lastCall![0] as () => Promise<string | null>)()
    permission(908, disabled)
    captured.resolve('data:image/png;base64,stale')
    await expect(pendingCapture).resolves.toBeNull()
    expect(onCapture).toHaveBeenLastCalledWith(null)
  })

  it('disposes an engine created too late after permission was withdrawn without loading its source', async () => {
    const creation = deferred<MagePlayerController>()
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockReturnValueOnce(creation.promise)
    permission(909, allowed)
    render(<MagePlayer sceneBlob={buildMagePlayerSceneBlob()} sceneKey={909}/>)
    await waitFor(() => expect(createMagePlayer).toHaveBeenCalledOnce())
    permission(909, disabled)
    await act(async () => creation.resolve(controller))
    expect(controller.dispose).toHaveBeenCalledOnce()
    expect(controller.loadSceneBlob).not.toHaveBeenCalled()
  })

  it('discards a capture from an older editor revision after the source changes', async () => {
    const captured = deferred<string>()
    const controller = buildMagePlayerController({ captureFramePreview: vi.fn(() => captured.promise) })
    vi.mocked(createMagePlayer).mockResolvedValueOnce(controller)
    const original = buildMagePlayerSceneBlob({ visualizer: { shader: 'old' } })
    const revised = buildMagePlayerSceneBlob({ visualizer: { shader: 'new' } })
    const onCapture = vi.fn()
    permission(912, allowed)
    const view = render(<MagePlayer sceneBlob={original} sceneKey={912} onCaptureFramePreviewChange={onCapture}/>)
    await waitFor(() => expect(onCapture.mock.lastCall?.[0]).toEqual(expect.any(Function)))
    const pendingCapture = (onCapture.mock.lastCall![0] as () => Promise<string | null>)()
    view.rerender(<MagePlayer sceneBlob={revised} sceneKey={912} onCaptureFramePreviewChange={onCapture}/>)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenLastCalledWith(revised, { sceneKey: 912 }))
    captured.resolve('data:image/png;base64,old-revision')
    await expect(pendingCapture).resolves.toBeNull()
  })

  it('keeps a remembered local failure and revokes old retry permission while globally disabled', async () => {
    const scene = buildMagePlayerSceneBlob()
    const key = remember(scene, 910)
    sceneRecovery.block(key, 'runtime')
    sceneRecovery.retry(key)
    permission(910, globalDisabled)
    render(<MagePlayer sceneBlob={scene} sceneKey={910}/>)
    expect(screen.getByText('Scene playback is temporarily disabled.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry scene' })).not.toBeInTheDocument()
    permission(910, allowed)
    expect(screen.getByRole('button', { name: 'Retry scene' })).toBeInTheDocument()
    expect(sceneRecovery.getBlock(key)?.reason).toBe('runtime')
    expect(createMagePlayer).not.toHaveBeenCalled()
  })

  it('preserves a local stop independently from a server disable and re-enable', async () => {
    const scene = buildMagePlayerSceneBlob()
    const key = remember(scene, 911)
    sceneRecovery.block(key, 'stopped')
    permission(911, allowed)
    render(<MagePlayer sceneBlob={scene} sceneKey={911}/>)
    expect(screen.getByRole('button', { name: 'Resume scene' })).toBeInTheDocument()
    permission(911, disabled)
    expect(screen.queryByRole('button', { name: 'Resume scene' })).not.toBeInTheDocument()
    permission(911, allowed)
    expect(screen.getByRole('button', { name: 'Resume scene' })).toBeInTheDocument()
    expect(createMagePlayer).not.toHaveBeenCalled()
  })

  it('retains an interrupted failure when a paused retry crosses server disablement', async () => {
    const scene = buildMagePlayerSceneBlob()
    const key = remember(scene, 913)
    sceneRecovery.block(key, 'interrupted')
    permission(913, allowed)
    let lease: ReturnType<typeof sceneRecovery.begin> = null
    const controller = buildMagePlayerController({
      loadSceneBlob: vi.fn(() => {
        lease = sceneRecovery.begin(key)
        if (!lease) throw new Error('Scene retry is still blocked')
      }),
      dispose: vi.fn(() => lease?.dispose()),
    })
    vi.mocked(createMagePlayer).mockResolvedValueOnce(controller)
    render(<MagePlayer sceneBlob={scene} sceneKey={913}/>)
    fireEvent.click(screen.getByRole('button', { name: 'Retry scene' }))
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Playback options' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))
    expect(controller.dispose).toHaveBeenCalledOnce()
    expect(screen.getByRole('checkbox', { name: 'Pause all scenes' })).toBeChecked()

    permission(913, disabled)
    expect(screen.getByText('This scene is temporarily unavailable.')).toBeInTheDocument()
    permission(913, allowed)
    expect(screen.getByRole('checkbox', { name: 'Pause all scenes' })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))

    expect(screen.getByRole('button', { name: 'Retry scene' })).toBeInTheDocument()
    expect(sceneRecovery.getBlock(key)?.reason).toBe('interrupted')
    expect(createMagePlayer).toHaveBeenCalledOnce()
  })
})

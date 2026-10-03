import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer } from './MagePlayer'
import { createMagePlayer, type MagePlayerController } from './infrastructure/engineAdapter'
import { sceneRecovery, sceneRecoveryKey } from './recovery/sceneRecovery'
import { buildMagePlayerController, buildMagePlayerSceneBlob, buildMagePlayerTrack } from './test-fixtures'

type Target = number | 'custom'
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
    expect(view.container.querySelector('canvas')).toBeNull()
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
    permission(903, disabled)
    const view = render(<MagePlayer sceneBlob={null} sceneKey={903} onAvailabilityRestored={onAvailabilityRestored} />)
    expect(onAvailabilityRestored).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument()
    permission(903, allowed)
    await waitFor(() => expect(onAvailabilityRestored).toHaveBeenCalledOnce())
    expect(screen.getByText('Loading this scene…')).toBeInTheDocument()
    expect(createMagePlayer).not.toHaveBeenCalled()

    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValueOnce(controller)
    const restored = buildMagePlayerSceneBlob({ visualizer: { shader: 'repaired' } })
    view.rerender(<MagePlayer sceneBlob={restored} sceneKey={903} onAvailabilityRestored={onAvailabilityRestored} />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledWith(restored, { sceneKey: 903 }))
    expect(onAvailabilityRestored).toHaveBeenCalledOnce()
  })

  it('catches a source refresh rejection and offers a deliberate retry without rendering defaults', async () => {
    const onAvailabilityRestored = vi.fn().mockRejectedValueOnce(new Error('Source download failed')).mockResolvedValueOnce(undefined)
    permission(904, allowed)
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
    permission(905, allowed)
    const view = render(<MagePlayer sceneBlob={null} sceneKey={905} onAvailabilityRestored={oldRestore} />)
    await waitFor(() => expect(oldRestore).toHaveBeenCalledOnce())
    const nextRestore = vi.fn(async () => undefined)
    permission(906, allowed)
    view.rerender(<MagePlayer sceneBlob={null} sceneKey={906} onAvailabilityRestored={nextRestore} />)
    await waitFor(() => expect(nextRestore).toHaveBeenCalledOnce())
    await act(async () => oldSource.reject(new Error('Stale source failure')))
    expect(screen.getByText('Loading this scene…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument()
    expect(createMagePlayer).not.toHaveBeenCalled()
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
    await waitFor(() => expect(restored.loadAudio).toHaveBeenCalledWith({ sourceLabel: track.name, sourcePath: track.sourcePath }))
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

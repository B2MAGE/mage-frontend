import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer } from './MagePlayer'
import { createMagePlayer } from './infrastructure/engineAdapter'
import { sceneRecovery, sceneRecoveryKey } from './recovery/sceneRecovery'
import { buildMagePlayerController, buildMagePlayerSceneBlob, buildMagePlayerTrack } from './test-fixtures'

vi.mock('./infrastructure/engineAdapter', () => ({ createMagePlayer: vi.fn() }))

const keys = new Set<string>()
function identity(scene: unknown, id?: number) {
  const key = sceneRecoveryKey(scene, id)!
  keys.add(key)
  return key
}

function controllerWithLease(key: string) {
  let lease: ReturnType<typeof sceneRecovery.begin> = null
  return buildMagePlayerController({
    loadSceneBlob: vi.fn(() => {
      lease = sceneRecovery.begin(key)
      if (!lease) throw new Error('Scene is still blocked')
    }),
    dispose: vi.fn(() => lease?.dispose()),
  })
}

describe('MagePlayer recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createMagePlayer).mockReset()
    sceneRecovery.setSafeMode(false)
    for (const key of keys) sceneRecovery.clear(key)
  })
  afterEach(() => {
    act(() => {
      sceneRecovery.setSafeMode(false)
      for (const key of keys) sceneRecovery.clear(key)
    })
  })

  it('keeps compiler-rejected scenes static and actionable across mounts without automatic retries', () => {
    const scene = buildMagePlayerSceneBlob()
    const key = identity(scene, 831)
    sceneRecovery.block(key, 'compile')
    const first = render(<MagePlayer sceneBlob={scene} sceneKey={831} posterUrl="/scene-poster.png" />)
    expect(screen.getByText(/simplify the shader code or choose a template/i)).toHaveTextContent("It won't restart automatically.")
    expect(first.container.querySelector('img')).toHaveAttribute('src', '/scene-poster.png')
    expect(first.container.querySelector('iframe,canvas')).toBeNull()
    expect(createMagePlayer).not.toHaveBeenCalled()
    first.unmount()
    const second = render(<MagePlayer sceneBlob={{ ...scene }} sceneKey={831} />)
    expect(screen.getByRole('button', { name: 'Retry scene' })).toBeEnabled()
    expect(sceneRecovery.getBlock(key)?.reason).toBe('compile')
    expect(second.container.querySelector('iframe,canvas')).toBeNull()
    expect(createMagePlayer).not.toHaveBeenCalled()
  })

  it('keeps a remembered failure static across a new player mount until deliberate retry', async () => {
    const scene = buildMagePlayerSceneBlob()
    const key = identity(scene, 801)
    sceneRecovery.block(key, 'runtime')
    const first = render(<MagePlayer sceneBlob={scene} sceneKey={801} posterUrl="/scene-poster.png" />)
    expect(screen.getByText('Playback paused')).toBeInTheDocument()
    expect(first.container.querySelector('img')).toHaveAttribute('src', '/scene-poster.png')
    expect(createMagePlayer).not.toHaveBeenCalled()
    first.unmount()

    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    render(<MagePlayer sceneBlob={{ ...scene }} sceneKey={801} />)
    expect(createMagePlayer).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry scene' }))
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledWith(scene, { sceneKey: 801 }))
    expect(sceneRecovery.getBlock(key)).toBeNull()
  })

  it('disposes a stopped renderer and keeps playlist data for a deliberate resume', async () => {
    const scene = buildMagePlayerSceneBlob()
    identity(scene, 802)
    const first = buildMagePlayerController()
    const resumed = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValueOnce(first).mockResolvedValueOnce(resumed)
    render(<MagePlayer sceneBlob={scene} sceneKey={802} playlistTracks={[buildMagePlayerTrack()]} selectedTrackId="track-1" />)
    await waitFor(() => expect(first.loadSceneBlob).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Playback options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop this scene' }))
    expect(screen.getByText('Playback paused')).toBeInTheDocument()
    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Add audio tracks' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Resume scene' }))
    await waitFor(() => expect(resumed.loadSceneBlob).toHaveBeenCalledWith(scene, { sceneKey: 802 }))
    await waitFor(() => expect(resumed.loadAudio).toHaveBeenCalledWith({ sourceLabel: 'track-one.mp3', sourcePath: 'blob:track-one' }))
  })

  it.each([
    { name: 'custom', initial: buildMagePlayerSceneBlob(), edits: [
      buildMagePlayerSceneBlob({ intent: { fov: 90 } }),
      buildMagePlayerSceneBlob({ intent: { fov: 105 }, fx: { bloom: { enabled: true, strength: 0.4 } } }),
    ] },
    { name: 'template', initial: { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }, edits: [
      { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1, settings: { camera: { fov: 90 } } },
      { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1,
        settings: { camera: { fov: 105 }, bloom: { enabled: true, strength: 0.4 } } },
    ] },
  ])('keeps a stopped $name scene static through live edits and loads only the latest draft on Resume', async ({ initial, edits }) => {
    const originalKey = identity(initial, 839)
    for (const edit of edits) identity(edit, 839)
    const first = buildMagePlayerController({ updateSceneSettings: vi.fn() })
    const resumed = buildMagePlayerController({ updateSceneSettings: vi.fn() })
    const tracks = [buildMagePlayerTrack()]
    vi.mocked(createMagePlayer).mockResolvedValueOnce(first).mockResolvedValueOnce(resumed)
    const view = render(<MagePlayer sceneBlob={initial} sceneKey={839} playlistTracks={tracks} selectedTrackId="track-1" />)
    await waitFor(() => expect(first.loadAudio).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Playback options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop this scene' }))
    expect(first.dispose).toHaveBeenCalledOnce()
    for (const scene of edits) {
      view.rerender(<MagePlayer sceneBlob={scene} sceneKey={839} playlistTracks={tracks} selectedTrackId="track-1" />)
      expect(screen.getByRole('button', { name: 'Resume scene' })).toBeEnabled()
      expect(screen.getByText('Playback paused')).toBeInTheDocument()
      expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument()
    }
    await act(async () => { await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve())) })
    expect(createMagePlayer).toHaveBeenCalledOnce()
    expect(first.loadSceneBlob).toHaveBeenCalledOnce()
    expect(first.updateSceneSettings).not.toHaveBeenCalled()
    expect(resumed.loadSceneBlob).not.toHaveBeenCalled()
    expect(sceneRecovery.getBlock(originalKey)?.reason).toBe('stopped')
    expect(view.container.querySelector('.mage-player__render-host')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Resume scene' }))

    await waitFor(() => expect(resumed.loadSceneBlob).toHaveBeenCalledExactlyOnceWith(edits.at(-1), { sceneKey: 839 }))
    await waitFor(() => expect(resumed.loadAudio).toHaveBeenCalledExactlyOnceWith({ sourceLabel: 'track-one.mp3', sourcePath: 'blob:track-one' }))
    expect(createMagePlayer).toHaveBeenCalledTimes(2)
    expect(resumed.updateSceneSettings).not.toHaveBeenCalled()
    expect(sceneRecovery.getBlock(originalKey)).toBeNull()
    expect(screen.queryByText('Playback paused')).not.toBeInTheDocument()
  })

  it('retains a failure after stopping its retry and editing live settings until another explicit Retry', async () => {
    const initial = buildMagePlayerSceneBlob()
    const originalKey = identity(initial, 840)
    const revised = buildMagePlayerSceneBlob({ intent: { fov: 100 }, fx: { passes: { rgbShift: true } } })
    identity(revised, 840)
    sceneRecovery.block(originalKey, 'runtime')
    const first = controllerWithLease(originalKey)
    first.updateSceneSettings = vi.fn()
    const retried = buildMagePlayerController({ updateSceneSettings: vi.fn() })
    vi.mocked(createMagePlayer).mockResolvedValueOnce(first).mockResolvedValueOnce(retried)
    const view = render(<MagePlayer sceneBlob={initial} sceneKey={840} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry scene' }))
    await waitFor(() => expect(first.loadSceneBlob).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Playback options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop this scene' }))
    expect(first.dispose).toHaveBeenCalledOnce()
    expect(sceneRecovery.getBlock(originalKey)?.reason).toBe('runtime')

    view.rerender(<MagePlayer sceneBlob={revised} sceneKey={840} />)

    expect(screen.getByRole('button', { name: 'Retry scene' })).toBeEnabled()
    await act(async () => { await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve())) })
    expect(createMagePlayer).toHaveBeenCalledOnce()
    expect(first.updateSceneSettings).not.toHaveBeenCalled()
    expect(retried.loadSceneBlob).not.toHaveBeenCalled()
    expect(sceneRecovery.getBlock(originalKey)?.reason).toBe('runtime')
    fireEvent.click(screen.getByRole('button', { name: 'Retry scene' }))
    await waitFor(() => expect(retried.loadSceneBlob).toHaveBeenCalledExactlyOnceWith(revised, { sceneKey: 840 }))
    expect(createMagePlayer).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Playback paused')).not.toBeInTheDocument()
  })

  it('retains an explicit stop across an invalid draft until the repaired live settings are deliberately resumed', async () => {
    const initial = buildMagePlayerSceneBlob()
    const originalKey = identity(initial, 841)
    const invalid = buildMagePlayerSceneBlob({ intent: { fov: 400 } })
    const repaired = buildMagePlayerSceneBlob({ intent: { fov: 100 }, fx: { bloom: { enabled: true, strength: 0.4 } } })
    identity(repaired, 841)
    const first = buildMagePlayerController({ updateSceneSettings: vi.fn() })
    const resumed = buildMagePlayerController({ updateSceneSettings: vi.fn() })
    vi.mocked(createMagePlayer).mockResolvedValueOnce(first).mockResolvedValueOnce(resumed)
    const view = render(<MagePlayer sceneBlob={initial} sceneKey={841} />)
    await waitFor(() => expect(first.loadSceneBlob).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Playback options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop this scene' }))
    expect(first.dispose).toHaveBeenCalledOnce()

    view.rerender(<MagePlayer sceneBlob={invalid} sceneKey={841} />)

    expect(screen.getByRole('alert')).toHaveTextContent('This scene needs changes.')
    expect(createMagePlayer).toHaveBeenCalledOnce()
    expect(sceneRecovery.getBlock(originalKey)?.reason).toBe('stopped')
    view.rerender(<MagePlayer sceneBlob={repaired} sceneKey={841} />)
    expect(screen.getByRole('button', { name: 'Resume scene' })).toBeEnabled()
    await act(async () => { await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve())) })
    expect(createMagePlayer).toHaveBeenCalledOnce()
    expect(first.updateSceneSettings).not.toHaveBeenCalled()
    expect(resumed.loadSceneBlob).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Resume scene' }))

    await waitFor(() => expect(resumed.loadSceneBlob).toHaveBeenCalledExactlyOnceWith(repaired, { sceneKey: 841 }))
    expect(createMagePlayer).toHaveBeenCalledTimes(2)
    expect(sceneRecovery.getBlock(originalKey)).toBeNull()
    expect(screen.queryByText('Playback paused')).not.toBeInTheDocument()
  })

  it('stops all mounted players in safe mode and retains individual blocks when leaving it', async () => {
    const scene = buildMagePlayerSceneBlob()
    const key = identity(scene, 803)
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    render(<MagePlayer sceneBlob={scene} sceneKey={803} />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Playback options' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))
    expect(screen.getByText('Playback paused')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Pause all scenes' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Resume scene' })).toBeDisabled()
    expect(controller.dispose).toHaveBeenCalledTimes(1)
    act(() => sceneRecovery.block(key, 'context-lost'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))
    expect(screen.getByRole('button', { name: 'Retry scene' })).toBeInTheDocument()
    expect(createMagePlayer).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, 'stopped', 'runtime'] as const)('resumes an already playing scene after global pause, including a previous %s record', async (previous) => {
    const scene = buildMagePlayerSceneBlob()
    const key = identity(scene, 807)
    if (previous) sceneRecovery.block(key, previous)
    const first = controllerWithLease(key)
    const resumed = controllerWithLease(key)
    vi.mocked(createMagePlayer).mockResolvedValueOnce(first).mockResolvedValueOnce(resumed)
    render(<MagePlayer sceneBlob={scene} sceneKey={807} />)
    if (previous) fireEvent.click(screen.getByRole('button', { name: previous === 'stopped' ? 'Resume scene' : 'Retry scene' }))
    await waitFor(() => expect(first.loadSceneBlob).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Playback options' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))
    expect(first.dispose).toHaveBeenCalledOnce()
    expect(screen.getByRole('checkbox', { name: 'Pause all scenes' })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))
    await waitFor(() => expect(resumed.loadSceneBlob).toHaveBeenCalled())
    expect(screen.queryByText('Playback paused')).not.toBeInTheDocument()
    expect(sceneRecovery.getBlock(key)).toBeNull()
  })

  it('ends the paused retry continuation when leaving a failed scene', async () => {
    const scene = buildMagePlayerSceneBlob()
    const key = identity(scene, 808)
    sceneRecovery.block(key, 'runtime')
    const first = controllerWithLease(key)
    vi.mocked(createMagePlayer).mockResolvedValue(first)
    const view = render(<MagePlayer sceneBlob={scene} sceneKey={808} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry scene' }))
    await waitFor(() => expect(first.loadSceneBlob).toHaveBeenCalled())
    act(() => sceneRecovery.setSafeMode(true))
    expect(first.dispose).toHaveBeenCalledOnce()
    view.unmount()
    act(() => sceneRecovery.setSafeMode(false))
    render(<MagePlayer sceneBlob={scene} sceneKey={808} />)
    expect(screen.getByRole('button', { name: 'Retry scene' })).toBeInTheDocument()
    expect(createMagePlayer).toHaveBeenCalledOnce()
  })

  it.each(['pause-all', 'cached-return', 'retry'] as const)('retains a manual pause when %s replaces the renderer', async transition => {
    const scene = buildMagePlayerSceneBlob()
    const key = identity(scene, 832)
    const first = controllerWithLease(key)
    const restored = controllerWithLease(key)
    vi.mocked(createMagePlayer).mockResolvedValueOnce(first).mockResolvedValueOnce(restored)
    render(<MagePlayer sceneBlob={scene} sceneKey={832} playlistTracks={[buildMagePlayerTrack()]} selectedTrackId="track-1" />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause scene and audio playback' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Pause scene and audio playback' }))
    expect(first.setPlaybackState).toHaveBeenLastCalledWith('paused')
    if (transition === 'pause-all') {
      fireEvent.click(screen.getByRole('button', { name: 'Playback options' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))
    } else if (transition === 'cached-return') {
      act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    } else {
      act(() => sceneRecovery.block(key, 'context-lost'))
      fireEvent.click(screen.getByRole('button', { name: 'Retry scene' }))
    }
    await waitFor(() => expect(restored.loadAudio).toHaveBeenCalledOnce())
    expect(first.dispose).toHaveBeenCalledOnce()
    expect(restored.setPlaybackState).toHaveBeenCalledWith('paused')
    expect(restored.setPlaybackState).not.toHaveBeenCalledWith('playing')
    expect(screen.getByRole('button', { name: 'Play scene and audio playback' })).toBeEnabled()
  })

  it('does not resume if a newer failure arrives while an accepted retry is globally paused', async () => {
    const scene = buildMagePlayerSceneBlob()
    const key = identity(scene, 809)
    sceneRecovery.block(key, 'runtime')
    const first = controllerWithLease(key)
    vi.mocked(createMagePlayer).mockResolvedValue(first)
    render(<MagePlayer sceneBlob={scene} sceneKey={809} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry scene' }))
    await waitFor(() => expect(first.loadSceneBlob).toHaveBeenCalled())
    act(() => sceneRecovery.setSafeMode(true))
    act(() => sceneRecovery.block(key, 'context-lost'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))
    expect(screen.getByRole('button', { name: 'Retry scene' })).toBeInTheDocument()
    expect(createMagePlayer).toHaveBeenCalledOnce()
  })

  it('keeps a manually resumed scene playable after navigating away and reopening it', async () => {
    const scene = buildMagePlayerSceneBlob()
    const key = identity(scene, 810)
    const first = controllerWithLease(key)
    const resumed = controllerWithLease(key)
    const revisited = controllerWithLease(key)
    vi.mocked(createMagePlayer)
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(resumed)
      .mockResolvedValueOnce(revisited)
    const view = render(<MagePlayer sceneBlob={scene} sceneKey={810} />)
    await waitFor(() => expect(first.loadSceneBlob).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Playback options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop this scene' }))
    expect(first.dispose).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Resume scene' }))
    await waitFor(() => expect(resumed.loadSceneBlob).toHaveBeenCalled())
    expect(sceneRecovery.getAutomaticBlock(key)).toBeNull()
    view.unmount()
    expect(resumed.dispose).toHaveBeenCalledOnce()

    render(<MagePlayer sceneBlob={{ ...scene }} sceneKey={810} />)
    await waitFor(() => expect(revisited.loadSceneBlob).toHaveBeenCalledWith(scene, { sceneKey: 810 }))
    expect(screen.queryByText('Playback paused')).not.toBeInTheDocument()
  })

  it('recreates the renderer on a cached browser return without losing the playlist', async () => {
    const scene = buildMagePlayerSceneBlob()
    identity(scene, 811)
    const first = buildMagePlayerController()
    const restored = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValueOnce(first).mockResolvedValueOnce(restored)
    render(<MagePlayer sceneBlob={scene} sceneKey={811} playlistTracks={[buildMagePlayerTrack()]} selectedTrackId="track-1" />)
    await waitFor(() => expect(first.loadAudio).toHaveBeenCalled())
    act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false })))
    expect(createMagePlayer).toHaveBeenCalledOnce()

    act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    await waitFor(() => expect(restored.loadSceneBlob).toHaveBeenCalledWith(scene, { sceneKey: 811 }))
    await waitFor(() => expect(restored.loadAudio).toHaveBeenCalledWith({ sourceLabel: 'track-one.mp3', sourcePath: 'blob:track-one' }))
    expect(first.dispose).toHaveBeenCalledOnce()
    expect(screen.queryByText('Playback paused')).not.toBeInTheDocument()
  })

  it('retires an old interruption after an explicit retry ends cleanly', async () => {
    const scene = buildMagePlayerSceneBlob()
    const key = identity(scene, 812)
    sceneRecovery.block(key, 'interrupted')
    const retried = controllerWithLease(key)
    const revisited = controllerWithLease(key)
    vi.mocked(createMagePlayer).mockResolvedValueOnce(retried).mockResolvedValueOnce(revisited)
    const view = render(<MagePlayer sceneBlob={scene} sceneKey={812} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry scene' }))
    await waitFor(() => expect(retried.loadSceneBlob).toHaveBeenCalled())
    expect(sceneRecovery.getAutomaticBlock(key)?.reason).toBe('interrupted')
    view.unmount()
    expect(retried.dispose).toHaveBeenCalledOnce()

    render(<MagePlayer sceneBlob={scene} sceneKey={812} />)
    await waitFor(() => expect(revisited.loadSceneBlob).toHaveBeenCalled())
    expect(screen.queryByText('Playback paused')).not.toBeInTheDocument()
    expect(sceneRecovery.getAutomaticBlock(key)).toBeNull()
  })

  it('allows a revised scene without clearing the failed version or repeating its load', async () => {
    const original = buildMagePlayerSceneBlob({ visualizer: { shader: 'sphere(1)' } })
    const revised = buildMagePlayerSceneBlob({ visualizer: { shader: 'sphere(.5)' } })
    const originalKey = identity(original, 804)
    identity(revised, 804)
    sceneRecovery.block(originalKey, 'load')
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const { rerender } = render(<MagePlayer sceneBlob={original} sceneKey={804} />)
    expect(createMagePlayer).not.toHaveBeenCalled()
    rerender(<MagePlayer sceneBlob={revised} sceneKey={804} />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalledWith(revised, { sceneKey: 804 }))
    rerender(<MagePlayer sceneBlob={original} sceneKey={804} />)
    expect(screen.getByRole('button', { name: 'Retry scene' })).toBeInTheDocument()
    expect(controller.dispose).toHaveBeenCalledTimes(1)
    expect(sceneRecovery.getBlock(originalKey)?.reason).toBe('load')
  })

  it('distinguishes interrupted playback from a confirmed scene failure', () => {
    const scene = buildMagePlayerSceneBlob()
    const key = identity(scene, 805)
    sceneRecovery.block(key, 'interrupted')
    render(<MagePlayer sceneBlob={scene} sceneKey={805} />)
    expect(screen.getByText(/previous playback may have been interrupted/)).toBeInTheDocument()
    expect(createMagePlayer).not.toHaveBeenCalled()
  })

  it('keeps recovery controls usable when disposing a broken renderer throws', async () => {
    const scene = buildMagePlayerSceneBlob()
    identity(scene, 806)
    const controller = buildMagePlayerController({ dispose: vi.fn(() => { throw new Error('Lost graphics context') }) })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    render(<MagePlayer sceneBlob={scene} sceneKey={806} />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Playback options' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop this scene' }))
    expect(screen.getByRole('button', { name: 'Resume scene' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))
    expect(screen.getByText('Playback paused')).toBeInTheDocument()
  })
})

// This suite tests existing playback behavior with server permission already granted.
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})

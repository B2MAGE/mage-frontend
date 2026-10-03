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

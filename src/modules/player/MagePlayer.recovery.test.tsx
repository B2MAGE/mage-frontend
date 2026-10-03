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

describe('MagePlayer recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(screen.getByText('This scene could not keep rendering.')).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: 'Stop rendering' }))
    expect(screen.getByText('Rendering stopped.')).toBeInTheDocument()
    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Add audio tracks' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Resume rendering' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Safe mode' }))
    expect(screen.getByText('Safe mode is on.')).toBeInTheDocument()
    expect(controller.dispose).toHaveBeenCalledTimes(1)
    act(() => sceneRecovery.block(key, 'context-lost'))
    fireEvent.click(screen.getByRole('button', { name: 'Leave safe mode' }))
    expect(screen.getByRole('button', { name: 'Retry scene' })).toBeInTheDocument()
    expect(createMagePlayer).toHaveBeenCalledTimes(1)
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
    expect(screen.getByText('Playback may have been interrupted.')).toBeInTheDocument()
    expect(createMagePlayer).not.toHaveBeenCalled()
  })

  it('keeps recovery controls usable when disposing a broken renderer throws', async () => {
    const scene = buildMagePlayerSceneBlob()
    identity(scene, 806)
    const controller = buildMagePlayerController({ dispose: vi.fn(() => { throw new Error('Lost graphics context') }) })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    render(<MagePlayer sceneBlob={scene} sceneKey={806} />)
    await waitFor(() => expect(controller.loadSceneBlob).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Stop rendering' }))
    expect(screen.getByRole('button', { name: 'Resume rendering' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Browse in safe mode' }))
    expect(screen.getByText('Safe mode is on.')).toBeInTheDocument()
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer } from './MagePlayer'
import { createMagePlayer } from './infrastructure/engineAdapter'
import { buildMagePlayerController, buildMagePlayerSceneBlob } from './test-fixtures'

vi.mock('./infrastructure/engineAdapter', () => ({ createMagePlayer: vi.fn() }))

describe('MagePlayer simulated beat preview', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('leaves ordinary players unchanged when no preview option is provided', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    render(<MagePlayer sceneBlob={buildMagePlayerSceneBlob()} />)

    await screen.findByRole('button', { name: 'Pause scene and audio playback' })
    expect(controller.setSyntheticPreview).not.toHaveBeenCalled()
  })

  it('updates tempo and toggles the beat without recreating the engine or reloading the scene', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const scene = buildMagePlayerSceneBlob()
    const { rerender } = render(<MagePlayer sceneBlob={scene} simulatedBeat={{ enabled: true, bpm: 120 }} />)

    await waitFor(() => expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(true, 24, 1))
    rerender(<MagePlayer sceneBlob={scene} simulatedBeat={{ enabled: true, bpm: 90 }} />)
    expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(true, 24, 0.75)

    rerender(<MagePlayer sceneBlob={scene} simulatedBeat={{ enabled: false, bpm: 90 }} />)
    expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(false, 24, 0.75)
    rerender(<MagePlayer sceneBlob={scene} simulatedBeat={{ enabled: true, bpm: 90 }} />)
    expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(true, 24, 0.75)
    expect(createMagePlayer).toHaveBeenCalledTimes(1)
    expect(controller.loadSceneBlob).toHaveBeenCalledTimes(1)
    expect(controller.dispose).not.toHaveBeenCalled()
  })

  it('honors both initial pause and playback controls without changing the requested beat preference', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    render(<MagePlayer initialPlayback="paused" sceneBlob={buildMagePlayerSceneBlob()} simulatedBeat={{ enabled: true, bpm: 100 }} />)

    await waitFor(() => expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(false, 24, 100 / 120))
    fireEvent.click(screen.getByRole('button', { name: 'Play scene and audio playback' }))
    expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(true, 24, 100 / 120)
    fireEvent.click(screen.getByRole('button', { name: 'Pause scene and audio playback' }))
    expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(false, 24, 100 / 120)
  })

  it('reapplies the beat after scene edits without serializing preview settings into the scene', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const firstScene = buildMagePlayerSceneBlob()
    const secondScene = buildMagePlayerSceneBlob({ visualizer: { skyboxPreset: 2 } })
    const originalSecondScene = structuredClone(secondScene)
    const { rerender } = render(<MagePlayer sceneBlob={firstScene} simulatedBeat={{ enabled: true, bpm: 150 }} />)
    await waitFor(() => expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(true, 24, 1.25))
    vi.mocked(controller.setSyntheticPreview).mockClear()

    rerender(<MagePlayer sceneBlob={secondScene} simulatedBeat={{ enabled: true, bpm: 150 }} />)
    await waitFor(() => expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(true, 24, 1.25))
    expect(controller.loadSceneBlob).toHaveBeenLastCalledWith(secondScene)
    expect(secondScene).toEqual(originalSecondScene)
    expect(secondScene).not.toHaveProperty('simulatedBeat')
    expect(createMagePlayer).toHaveBeenCalledTimes(1)
  })

  it('disables an earlier simulated beat when the option is removed', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const scene = buildMagePlayerSceneBlob()
    const { rerender } = render(<MagePlayer sceneBlob={scene} simulatedBeat={{ enabled: true, bpm: 120 }} />)
    await waitFor(() => expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(true, 24, 1))

    rerender(<MagePlayer sceneBlob={scene} />)
    expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(false, 24, 1)
  })

  it.each([[20, 0.5], [240, 1.5], [Number.NaN, 1], [Number.POSITIVE_INFINITY, 1]])(
    'bounds invalid or out-of-range tempo %s to a safe tempo scale of %s',
    async (bpm, scale) => {
      const controller = buildMagePlayerController()
      vi.mocked(createMagePlayer).mockResolvedValue(controller)
      render(<MagePlayer sceneBlob={buildMagePlayerSceneBlob()} simulatedBeat={{ enabled: true, bpm }} />)
      await waitFor(() => expect(controller.setSyntheticPreview).toHaveBeenLastCalledWith(true, 24, scale))
    },
  )
})

// This suite tests existing playback behavior with server permission already granted.
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})

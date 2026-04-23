import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer } from './MagePlayer'
import { createMagePlayer } from './infrastructure/engineAdapter'
import {
  buildMagePlayerController,
  buildMagePlayerSceneBlob,
} from './test-fixtures'

vi.mock('./infrastructure/engineAdapter', () => ({
  createMagePlayer: vi.fn(),
}))

describe('MagePlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads a scene blob and disposes the engine on unmount', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const sceneBlob = buildMagePlayerSceneBlob()
    const { unmount } = render(<MagePlayer sceneBlob={sceneBlob} />)

    expect(screen.getByText('Loading scene preview.')).toBeInTheDocument()

    await waitFor(() => {
      expect(createMagePlayer).toHaveBeenCalledTimes(1)
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(sceneBlob)
      expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    })

    expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pause scene and audio playback/i })).toHaveAccessibleName(
      'Pause scene and audio playback',
    )
    expect(screen.getByRole('button', { name: /add audio tracks/i })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /shuffle playback/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /repeat playback/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reset scene and audio playback/i })).not.toBeInTheDocument()
    expect(screen.getByText('Track 0/0: No track selected')).toBeInTheDocument()

    unmount()

    expect(controller.dispose).toHaveBeenCalledTimes(1)
  })

  it('reuses the same engine instance when the scene blob changes', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const firstSceneBlob = buildMagePlayerSceneBlob()
    const secondSceneBlob = buildMagePlayerSceneBlob({
      visualizer: {
        skyboxPreset: 2,
      },
    })

    const { rerender } = render(<MagePlayer sceneBlob={firstSceneBlob} />)

    await waitFor(() => {
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(firstSceneBlob)
    })

    const initialCreateCount = vi.mocked(createMagePlayer).mock.calls.length

    rerender(<MagePlayer sceneBlob={secondSceneBlob} />)

    await waitFor(() => {
      expect(vi.mocked(createMagePlayer).mock.calls.length).toBe(initialCreateCount)
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(secondSceneBlob)
      expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    })
  })

  it('shows a recoverable error state when the scene is invalid', async () => {
    const controller = buildMagePlayerController({
      loadSceneBlob: vi.fn((sceneBlob: unknown) => {
        if (typeof sceneBlob === 'object' && sceneBlob !== null && 'invalid' in sceneBlob) {
          throw new Error('Scene data is missing required MAGE fields.')
        }
      }),
    })

    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const { rerender } = render(
      <MagePlayer
        sceneBlob={{
          invalid: true,
        }}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Scene data is missing required MAGE fields.',
    )
    expect(controller.dispose).not.toHaveBeenCalled()

    const validSceneBlob = buildMagePlayerSceneBlob()

    rerender(<MagePlayer sceneBlob={validSceneBlob} />)

    await waitFor(() => {
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(validSceneBlob)
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('supports a paused initial playback state and toggles playback from the shared control bar', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const sceneBlob = buildMagePlayerSceneBlob()

    render(<MagePlayer initialPlayback="paused" sceneBlob={sceneBlob} />)

    expect(screen.queryByRole('button', { name: /scene playback/i })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(sceneBlob)
      expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    })

    const playbackButton = screen.getByRole('button', { name: /play scene and audio playback/i })
    expect(playbackButton).toHaveAttribute('aria-pressed', 'false')
    expect(playbackButton).toHaveAccessibleName('Play scene and audio playback')

    fireEvent.click(playbackButton)

    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    expect(playbackButton).toHaveAttribute('aria-pressed', 'true')
    expect(playbackButton).toHaveAccessibleName('Pause scene and audio playback')
    await waitFor(() => {
      expect(playbackButton).not.toHaveFocus()
    })
  })

  it('suppresses playback controls while the player is empty', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    render(<MagePlayer sceneBlob={null} />)

    expect(await screen.findByText('No scene selected.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /scene playback/i })).not.toBeInTheDocument()
  })
})

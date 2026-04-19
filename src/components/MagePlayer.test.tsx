import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer } from './MagePlayer'
import {
  createMagePlayer,
  type MagePlayerController,
  type MagePlayerPlaybackState,
} from '../lib/magePlayerAdapter'

vi.mock('../lib/magePlayerAdapter', () => ({
  createMagePlayer: vi.fn(),
}))

function createController(overrides: Partial<MagePlayerController> = {}): MagePlayerController {
  let playbackState: MagePlayerPlaybackState = 'playing'

  return {
    dispose: vi.fn(),
    getPlaybackState: vi.fn(() => playbackState),
    loadSceneBlob: vi.fn(),
    setPlaybackState: vi.fn((nextPlaybackState: MagePlayerPlaybackState) => {
      playbackState = nextPlaybackState
      return playbackState
    }),
    ...overrides,
  }
}

describe('MagePlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads a scene blob and disposes the engine on unmount', async () => {
    const controller = createController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const sceneBlob = {
      visualizer: {
        skyboxPreset: 6,
      },
    }

    const { unmount } = render(<MagePlayer sceneBlob={sceneBlob} />)

    expect(screen.getByText('Loading scene preview.')).toBeInTheDocument()

    await waitFor(() => {
      expect(createMagePlayer).toHaveBeenCalledTimes(1)
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(sceneBlob)
      expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    })

    expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pause scene playback/i })).toHaveAccessibleName(
      'Pause scene playback',
    )

    unmount()

    expect(controller.dispose).toHaveBeenCalledTimes(1)
  })

  it('reuses the same engine instance when the scene blob changes', async () => {
    const controller = createController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const firstSceneBlob = {
      visualizer: {
        skyboxPreset: 6,
      },
    }
    const secondSceneBlob = {
      visualizer: {
        skyboxPreset: 2,
      },
    }

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
    const controller = createController({
      loadSceneBlob: vi.fn((sceneBlob: unknown) => {
        if (
          typeof sceneBlob === 'object' &&
          sceneBlob !== null &&
          'invalid' in sceneBlob
        ) {
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

    const validSceneBlob = {
      visualizer: {
        skyboxPreset: 6,
      },
    }

    rerender(<MagePlayer sceneBlob={validSceneBlob} />)

    await waitFor(() => {
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(validSceneBlob)
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('supports a paused initial playback state and toggles playback from the shared control bar', async () => {
    const controller = createController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const user = userEvent.setup()
    const sceneBlob = {
      visualizer: {
        skyboxPreset: 6,
      },
    }

    render(<MagePlayer initialPlayback="paused" sceneBlob={sceneBlob} />)

    expect(screen.queryByRole('button', { name: /scene playback/i })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(sceneBlob)
      expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    })

    const playbackButton = screen.getByRole('button', { name: /play scene playback/i })
    expect(playbackButton).toHaveAttribute('aria-pressed', 'false')
    expect(playbackButton).toHaveAccessibleName('Play scene playback')

    await user.click(playbackButton)

    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    expect(playbackButton).toHaveAttribute('aria-pressed', 'true')
    expect(playbackButton).toHaveAccessibleName('Pause scene playback')
    await waitFor(() => {
      expect(playbackButton).not.toHaveFocus()
    })
  })

  it('suppresses playback controls while the player is empty', async () => {
    const controller = createController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    render(<MagePlayer sceneBlob={null} />)

    expect(await screen.findByText('No scene selected.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /scene playback/i })).not.toBeInTheDocument()
  })
})

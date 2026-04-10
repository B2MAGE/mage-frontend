import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MagePlayer } from './MagePlayer'
import { createMagePlayer, type MagePlayerController } from '../lib/magePlayerAdapter'

vi.mock('../lib/magePlayerAdapter', () => ({
  createMagePlayer: vi.fn(),
}))

function createController(overrides: Partial<MagePlayerController> = {}): MagePlayerController {
  return {
    dispose: vi.fn(),
    loadSceneBlob: vi.fn(),
    ...overrides,
  }
}

describe('MagePlayer', () => {
  it('loads a preset scene blob and disposes the engine on unmount', async () => {
    const controller = createController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const sceneBlob = {
      visualizer: {
        skyboxPreset: 6,
      },
    }

    const { unmount } = render(<MagePlayer sceneBlob={sceneBlob} />)

    expect(screen.getByText('Loading preset preview.')).toBeInTheDocument()

    await waitFor(() => {
      expect(createMagePlayer).toHaveBeenCalledTimes(1)
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(sceneBlob)
    })

    expect(screen.queryByText('Loading preset preview.')).not.toBeInTheDocument()

    unmount()

    expect(controller.dispose).toHaveBeenCalledTimes(1)
  })

  it('reuses the same engine instance when the preset scene blob changes', async () => {
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
    })
  })

  it('shows a recoverable error state when the preset is invalid', async () => {
    const controller = createController({
      loadSceneBlob: vi.fn((sceneBlob: unknown) => {
        if (
          typeof sceneBlob === 'object' &&
          sceneBlob !== null &&
          'invalid' in sceneBlob
        ) {
          throw new Error('Preset scene data is missing required MAGE fields.')
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
      'Preset scene data is missing required MAGE fields.',
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
})

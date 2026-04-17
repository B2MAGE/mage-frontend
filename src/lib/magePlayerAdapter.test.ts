import { beforeEach, describe, expect, it, vi } from 'vitest'

const engineMocks = vi.hoisted(() => ({
  dispose: vi.fn(),
  getEngineTime: vi.fn(),
  initMAGE: vi.fn(),
  loadPreset: vi.fn(),
  setEngineTime: vi.fn(),
  start: vi.fn(),
}))

vi.mock('@mage/engine', () => ({
  initMAGE: engineMocks.initMAGE,
}))

describe('createMagePlayer', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    engineMocks.initMAGE.mockReturnValue({
      dispose: engineMocks.dispose,
      getEngineTime: engineMocks.getEngineTime,
      loadPreset: engineMocks.loadPreset,
      setEngineTime: engineMocks.setEngineTime,
      start: engineMocks.start,
    })
    engineMocks.getEngineTime.mockReturnValue(0)
    engineMocks.loadPreset.mockReturnValue({ visualizer: { shader: 'test' } })
  })

  it('primes engine time and restarts after loading a scene blob', async () => {
    const { createMagePlayer } = await import('./magePlayerAdapter')
    const canvas = document.createElement('canvas')
    const sceneBlob = {
      visualizer: {
        shader: 'test',
      },
    }

    const player = await createMagePlayer(canvas)

    expect(engineMocks.start).toHaveBeenCalledTimes(1)

    player.loadSceneBlob(sceneBlob)

    expect(engineMocks.loadPreset).toHaveBeenCalledWith(sceneBlob)
    expect(engineMocks.setEngineTime).toHaveBeenCalledWith(1 / 60)
    expect(engineMocks.start).toHaveBeenCalledTimes(2)
  })

  it('does not reset engine time when it is already past zero', async () => {
    const { createMagePlayer } = await import('./magePlayerAdapter')
    const canvas = document.createElement('canvas')
    const sceneBlob = {
      visualizer: {
        shader: 'test',
      },
    }

    engineMocks.getEngineTime.mockReturnValue(0.5)

    const player = await createMagePlayer(canvas)

    player.loadSceneBlob(sceneBlob)

    expect(engineMocks.setEngineTime).not.toHaveBeenCalled()
    expect(engineMocks.start).toHaveBeenCalledTimes(2)
  })
})

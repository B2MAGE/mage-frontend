import { beforeEach, describe, expect, it, vi } from 'vitest'

const engineMocks = vi.hoisted(() => ({
  dispose: vi.fn(),
  getEngineTime: vi.fn(),
  initMAGE: vi.fn(),
  loadPreset: vi.fn(),
  pause: vi.fn(),
  play: vi.fn(),
  setEngineTime: vi.fn(),
  start: vi.fn(),
}))

vi.mock('@notrac/mage', () => ({
  initMAGE: engineMocks.initMAGE,
}))

describe('createMagePlayer', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    document.body.innerHTML = ''

    engineMocks.initMAGE.mockReturnValue({
      dispose: engineMocks.dispose,
      getEngineTime: engineMocks.getEngineTime,
      loadPreset: engineMocks.loadPreset,
      pause: engineMocks.pause,
      play: engineMocks.play,
      setEngineTime: engineMocks.setEngineTime,
      start: engineMocks.start,
    })
    engineMocks.getEngineTime.mockReturnValue(0)
    engineMocks.loadPreset.mockReturnValue({ visualizer: { shader: 'test' } })
  })

  it('primes engine time and resumes playback after loading a scene blob', async () => {
    const { createMagePlayer } = await import('./magePlayerAdapter')
    const canvas = document.createElement('canvas')
    const sceneBlob = {
      visualizer: {
        shader: 'test',
      },
    }

    const player = await createMagePlayer(canvas)

    expect(engineMocks.initMAGE).toHaveBeenCalledWith({
      autoStart: false,
      canvas,
      log: false,
      withControls: {
        active: false,
        integrated: false,
      },
    })
    expect(engineMocks.start).toHaveBeenCalledTimes(1)

    player.loadSceneBlob(sceneBlob)

    expect(engineMocks.loadPreset).toHaveBeenCalledWith(sceneBlob)
    expect(engineMocks.setEngineTime).toHaveBeenCalledWith(1 / 60)
    expect(engineMocks.start).toHaveBeenCalledTimes(1)
    expect(engineMocks.play).toHaveBeenCalledTimes(1)
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
    expect(engineMocks.start).toHaveBeenCalledTimes(1)
    expect(engineMocks.play).toHaveBeenCalledTimes(1)
  })

  it('tracks playback state before the first scene load without touching the engine', async () => {
    const { createMagePlayer } = await import('./magePlayerAdapter')
    const canvas = document.createElement('canvas')

    const player = await createMagePlayer(canvas)

    expect(player.getPlaybackState()).toBe('playing')

    player.setPlaybackState('paused')

    expect(player.getPlaybackState()).toBe('paused')
    player.setPlaybackState('playing')

    expect(player.getPlaybackState()).toBe('playing')
    expect(engineMocks.pause).not.toHaveBeenCalled()
    expect(engineMocks.play).not.toHaveBeenCalled()
  })

  it('exposes playback state controls for the shared player UI after a scene is loaded', async () => {
    const { createMagePlayer } = await import('./magePlayerAdapter')
    const canvas = document.createElement('canvas')
    const sceneBlob = {
      visualizer: {
        shader: 'test',
      },
    }

    const player = await createMagePlayer(canvas)

    player.loadSceneBlob(sceneBlob)

    engineMocks.pause.mockClear()
    engineMocks.play.mockClear()

    player.setPlaybackState('paused')

    expect(player.getPlaybackState()).toBe('paused')
    expect(engineMocks.pause).toHaveBeenCalledTimes(1)

    player.setPlaybackState('playing')

    expect(player.getPlaybackState()).toBe('playing')
    expect(engineMocks.play).toHaveBeenCalledTimes(1)
  })

  it('keeps a paused scene paused when a new scene blob loads', async () => {
    const { createMagePlayer } = await import('./magePlayerAdapter')
    const canvas = document.createElement('canvas')
    const sceneBlob = {
      visualizer: {
        shader: 'test',
      },
    }

    const player = await createMagePlayer(canvas)

    engineMocks.start.mockClear()
    engineMocks.pause.mockClear()
    engineMocks.play.mockClear()

    player.setPlaybackState('paused')
    player.loadSceneBlob(sceneBlob)

    expect(engineMocks.start).not.toHaveBeenCalled()
    expect(engineMocks.pause).toHaveBeenCalledTimes(1)
    expect(engineMocks.play).not.toHaveBeenCalled()
  })

  it('surfaces the underlying engine error text when scene loading throws', async () => {
    const { createMagePlayer } = await import('./magePlayerAdapter')
    const canvas = document.createElement('canvas')
    const sceneBlob = {
      visualizer: {
        shader: 'test',
      },
    }

    engineMocks.loadPreset.mockImplementation(() => {
      throw new ReferenceError('setStepSize is not defined')
    })

    const player = await createMagePlayer(canvas)

    expect(() => player.loadSceneBlob(sceneBlob)).toThrowError(
      'Scene data could not be rendered by the MAGE engine. ReferenceError: setStepSize is not defined',
    )
  })

  it('disables native engine controls so only shared playback chrome is shown', async () => {
    const { createMagePlayer } = await import('./magePlayerAdapter')
    const canvas = document.createElement('canvas')

    const player = await createMagePlayer(canvas)

    expect(engineMocks.initMAGE).toHaveBeenLastCalledWith({
      autoStart: false,
      canvas,
      log: false,
      withControls: {
        active: false,
        integrated: false,
      },
    })

    player.dispose()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const engineMocks = vi.hoisted(() => ({
  dispose: vi.fn(),
  getAudioDuration: vi.fn(),
  getAudioTime: vi.fn(),
  getAudioVolume: vi.fn(),
  getEngineTime: vi.fn(),
  initMAGE: vi.fn(),
  isAudioLoaded: vi.fn(),
  loadAudio: vi.fn(),
  loadPreset: vi.fn(),
  pause: vi.fn(),
  play: vi.fn(),
  seek: vi.fn(),
  setAudioVolume: vi.fn(),
  setEngineTime: vi.fn(),
  start: vi.fn(),
  unloadAudio: vi.fn(),
}))

vi.mock('@notrac/mage', () => ({
  initMAGE: engineMocks.initMAGE,
}))

describe('createMagePlayer', () => {
  beforeEach(() => {
    let audioLoaded = false
    let audioVolume = 1
    let engineTime = 0

    vi.resetModules()
    vi.clearAllMocks()
    document.body.innerHTML = ''

    engineMocks.initMAGE.mockReturnValue({
      dispose: engineMocks.dispose,
      getAudioDuration: engineMocks.getAudioDuration,
      getAudioTime: engineMocks.getAudioTime,
      getAudioVolume: engineMocks.getAudioVolume,
      getEngineTime: engineMocks.getEngineTime,
      isAudioLoaded: engineMocks.isAudioLoaded,
      loadAudio: engineMocks.loadAudio,
      loadPreset: engineMocks.loadPreset,
      pause: engineMocks.pause,
      play: engineMocks.play,
      seek: engineMocks.seek,
      setAudioVolume: engineMocks.setAudioVolume,
      setEngineTime: engineMocks.setEngineTime,
      start: engineMocks.start,
      unloadAudio: engineMocks.unloadAudio,
    })
    engineMocks.getAudioDuration.mockReturnValue(0)
    engineMocks.getAudioTime.mockReturnValue(0)
    engineMocks.getAudioVolume.mockImplementation(() => audioVolume)
    engineMocks.getEngineTime.mockImplementation(() => engineTime)
    engineMocks.isAudioLoaded.mockImplementation(() => audioLoaded)
    engineMocks.loadAudio.mockImplementation(() => {
      audioLoaded = true
    })
    engineMocks.loadPreset.mockReturnValue({ visualizer: { shader: 'test' } })
    engineMocks.unloadAudio.mockImplementation(() => {
      audioLoaded = false
    })
    engineMocks.setAudioVolume.mockImplementation((volume: number) => {
      audioVolume = volume
      return audioVolume
    })
    engineMocks.setEngineTime.mockImplementation((time: number) => {
      engineTime = time
      return true
    })
  })

  it('primes engine time and resumes playback after loading a scene blob', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
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
    const { createMagePlayer } = await import('./engineAdapter')
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
    expect(engineMocks.loadPreset).toHaveBeenCalledWith(sceneBlob)
  })

  it('tracks playback state before the first scene load without touching the engine', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
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
    const { createMagePlayer } = await import('./engineAdapter')
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
    engineMocks.start.mockClear()

    player.setPlaybackState('paused')

    expect(player.getPlaybackState()).toBe('paused')
    expect(engineMocks.pause).toHaveBeenCalledTimes(1)

    player.setPlaybackState('playing')

    expect(player.getPlaybackState()).toBe('playing')
    expect(engineMocks.start).toHaveBeenCalledTimes(1)
    expect(engineMocks.play).not.toHaveBeenCalled()
    expect(engineMocks.loadPreset).toHaveBeenCalledTimes(1)
  })

  it('keeps a paused scene paused when a new scene blob loads', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
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
    expect(engineMocks.loadPreset).toHaveBeenCalledWith(sceneBlob)
  })

  it('surfaces the underlying engine error text when scene loading throws', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
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

  it('loads configured audio and syncs it to the current scene time', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const canvas = document.createElement('canvas')
    const sceneBlob = {
      audioPath: '/audio/crimson-reactor.mp3',
      visualizer: {
        shader: 'test',
      },
    }

    const player = await createMagePlayer(canvas)

    player.loadSceneBlob(sceneBlob)
    engineMocks.play.mockClear()
    engineMocks.seek.mockClear()
    engineMocks.getEngineTime.mockReturnValue(2.5)

    await expect(player.loadAudio()).resolves.toMatchObject({
      hasSource: true,
      isLoaded: true,
      sourcePath: '/audio/crimson-reactor.mp3',
    })

    expect(engineMocks.loadAudio).toHaveBeenCalledWith('/audio/crimson-reactor.mp3')
    expect(engineMocks.seek).toHaveBeenCalledWith(2.5)
    expect(engineMocks.setAudioVolume).toHaveBeenCalledWith(1)
    expect(engineMocks.play).toHaveBeenCalledTimes(1)
    const audioState = player.getAudioState()

    expect(audioState.hasSource).toBe(true)
    expect(audioState.isLoaded).toBe(true)
    expect(audioState.sourcePath).toBe('/audio/crimson-reactor.mp3')
    expect(audioState.volume).toBe(1)
    expect(audioState.currentTime).toBeGreaterThanOrEqual(2.5)
  })

  it('allows audio loading from a local device when the frontend passes a source path directly', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const canvas = document.createElement('canvas')
    const sceneBlob = {
      visualizer: {
        shader: 'test',
      },
    }

    const player = await createMagePlayer(canvas)

    player.loadSceneBlob(sceneBlob)
    engineMocks.play.mockClear()
    engineMocks.seek.mockClear()

    await expect(
      player.loadAudio({
        sourceLabel: 'device-track.mp3',
        sourcePath: 'blob:device-track',
      }),
    ).resolves.toMatchObject({
      hasSource: true,
      isLoaded: true,
      sourcePath: 'device-track.mp3',
    })

    expect(engineMocks.loadAudio).toHaveBeenCalledWith('blob:device-track')
    expect(engineMocks.setAudioVolume).toHaveBeenCalledWith(1)
    expect(engineMocks.play).toHaveBeenCalledTimes(1)
    const audioState = player.getAudioState()

    expect(audioState.hasSource).toBe(true)
    expect(audioState.isLoaded).toBe(true)
    expect(audioState.sourcePath).toBe('device-track.mp3')
    expect(audioState.volume).toBe(1)
    expect(audioState.currentTime).toBeGreaterThanOrEqual(0)
  })

  it('detaches cleared audio so resuming playback does not replay a removed track', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const canvas = document.createElement('canvas')
    const sceneBlob = {
      visualizer: {
        shader: 'test',
      },
    }

    const player = await createMagePlayer(canvas)

    player.loadSceneBlob(sceneBlob)
    await player.loadAudio({
      sourceLabel: 'device-track.mp3',
      sourcePath: 'blob:device-track',
    })

    engineMocks.play.mockClear()
    engineMocks.start.mockClear()
    engineMocks.unloadAudio.mockClear()

    expect(player.clearAudio()).toMatchObject({
      currentTime: 0,
      duration: 0,
      hasSource: false,
      isLoaded: false,
      sourcePath: null,
    })

    expect(engineMocks.unloadAudio).toHaveBeenCalledTimes(1)

    player.setPlaybackState('playing')

    expect(engineMocks.start).toHaveBeenCalledTimes(1)
    expect(engineMocks.play).not.toHaveBeenCalled()
    expect(player.getAudioState()).toMatchObject({
      currentTime: 0,
      duration: 0,
      hasSource: false,
      isLoaded: false,
      sourcePath: null,
    })
  })

  it('seeks loaded audio and syncs engine time for the shared scrubber', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const canvas = document.createElement('canvas')
    const sceneBlob = {
      audioPath: '/audio/crimson-reactor.mp3',
      visualizer: {
        shader: 'test',
      },
    }

    engineMocks.getAudioDuration.mockReturnValue(185)
    engineMocks.getAudioTime.mockReturnValue(42)

    const player = await createMagePlayer(canvas)

    player.loadSceneBlob(sceneBlob)
    await player.loadAudio()

    const audioState = player.seekAudio(42)

    expect(audioState.duration).toBe(185)
    expect(audioState.currentTime).toBeGreaterThanOrEqual(42)
    expect(audioState.currentTime).toBeLessThan(43)
    expect(engineMocks.seek).toHaveBeenLastCalledWith(42)
  })

  it('updates audio volume through the shared player bridge', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const canvas = document.createElement('canvas')

    const player = await createMagePlayer(canvas)

    expect(player.setAudioVolume(0.4)).toMatchObject({
      volume: 0.4,
    })
    expect(engineMocks.setAudioVolume).toHaveBeenLastCalledWith(0.4)
  })

  it('resets scene and audio playback back to the beginning', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const canvas = document.createElement('canvas')
    const sceneBlob = {
      audioPath: '/audio/crimson-reactor.mp3',
      intent: {
        time_multiplier: 1.5,
      },
      visualizer: {
        shader: 'test',
      },
    }

    const player = await createMagePlayer(canvas)

    player.loadSceneBlob(sceneBlob)
    await player.loadAudio()

    engineMocks.loadPreset.mockClear()
    engineMocks.pause.mockClear()
    engineMocks.seek.mockClear()

    expect(player.resetPlayback()).toBe('paused')
    expect(player.getPlaybackState()).toBe('paused')
    expect(engineMocks.loadPreset).toHaveBeenCalledWith(sceneBlob)
    expect(engineMocks.seek).toHaveBeenCalledWith(0)
    expect(engineMocks.start).toHaveBeenCalledTimes(2)
    expect(engineMocks.pause).toHaveBeenCalledTimes(1)
  })

  it('disables native engine controls so only shared playback chrome is shown', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
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

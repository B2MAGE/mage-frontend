import { beforeEach, describe, expect, it, vi } from 'vitest'

const engineMocks = vi.hoisted(() => ({
  captureThumbnail: vi.fn(),
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
      captureThumbnail: engineMocks.captureThumbnail,
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
        active: true,
        integrated: false,
      },
    })
    expect(engineMocks.start).toHaveBeenCalledTimes(1)

    player.loadSceneBlob(sceneBlob)

    expect(engineMocks.loadPreset).toHaveBeenCalledWith(sceneBlob)
    expect(engineMocks.setEngineTime).toHaveBeenCalledWith(1 / 60)
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
    expect(engineMocks.play).toHaveBeenCalledTimes(1)
  })

  it('exposes playback state controls for the shared player UI', async () => {
    const { createMagePlayer } = await import('./magePlayerAdapter')
    const canvas = document.createElement('canvas')

    const player = await createMagePlayer(canvas)

    expect(player.getPlaybackState()).toBe('playing')

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

    engineMocks.pause.mockClear()
    engineMocks.play.mockClear()

    player.setPlaybackState('paused')
    player.loadSceneBlob(sceneBlob)

    expect(engineMocks.pause).toHaveBeenCalledTimes(2)
    expect(engineMocks.play).not.toHaveBeenCalled()
  })

  it('suppresses the package control chrome when engine controls are enabled', async () => {
    const { createMagePlayer } = await import('./magePlayerAdapter')
    const host = document.createElement('div')
    const canvas = document.createElement('canvas')
    host.appendChild(canvas)
    document.body.appendChild(host)

    document.body.insertAdjacentHTML(
      'beforeend',
      `
        <div class="mage-embedded-presets"></div>
        <div><img alt="controls" /></div>
      `,
    )

    let engineInstance: Record<string, unknown> | null = null

    engineMocks.initMAGE.mockImplementation(() => {
      engineInstance = {
        captureThumbnail: engineMocks.captureThumbnail,
        dispose: engineMocks.dispose,
        getEngineTime: engineMocks.getEngineTime,
        loadPreset: engineMocks.loadPreset,
        pause: engineMocks.pause,
        play: engineMocks.play,
        setEngineTime: engineMocks.setEngineTime,
        start: engineMocks.start,
      }

      return engineInstance
    })

    const player = await createMagePlayer(canvas)

    expect(engineInstance?.captureThumbnail).toBeUndefined()
    expect(document.querySelector('.mage-embedded-presets')).toHaveAttribute(
      'data-mage-player-ui-suppressed',
      'true',
    )
    expect(document.querySelector('img[alt="controls"]')?.parentElement).toHaveAttribute(
      'data-mage-player-ui-suppressed',
      'true',
    )

    const latePaneHost = document.createElement('div')
    latePaneHost.className = 'mage-pane-host'
    document.body.appendChild(latePaneHost)

    await Promise.resolve()

    expect(latePaneHost).toHaveAttribute('data-mage-player-ui-suppressed', 'true')

    player.dispose()
  })
})

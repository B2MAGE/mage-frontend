import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listSceneTemplates, getTemplateDefinition } from '../templates/templateRegistry'

const engineMocks = vi.hoisted(() => ({
  dispose: vi.fn(),
  getAudioDuration: vi.fn(),
  getAudioTime: vi.fn(),
  getAudioVolume: vi.fn(),
  getEngineTime: vi.fn(),
  getEngineFields: vi.fn(),
  setInputState: vi.fn(),
  initMAGE: vi.fn(),
  isAudioLoaded: vi.fn(),
  loadAudio: vi.fn(),
  loadPreset: vi.fn(),
  pause: vi.fn(),
  play: vi.fn(),
  seek: vi.fn(),
  setAudioVolume: vi.fn(),
  setAudioResponseMode: vi.fn(),
  setAudioResponseConfig: vi.fn(),
  getAudioResponseCapabilities: vi.fn(),
  getAudioResponseDiagnostics: vi.fn(),
  getAudioResponseEvents: vi.fn(),
  setEngineTime: vi.fn(),
  setSyntheticPreview: vi.fn(),
  start: vi.fn(),
  unloadAudio: vi.fn(),
}))

const recoveryMocks = vi.hoisted(() => ({
  begin: vi.fn(),
  key: vi.fn(),
  dispose: vi.fn(),
  fail: vi.fn(),
  getBlock: vi.fn(),
  getAutomaticBlock: vi.fn(),
  isSafeMode: vi.fn(),
  block: vi.fn(),
}))

vi.mock('../recovery/sceneRecovery', () => ({
  sceneRecoveryKey: recoveryMocks.key,
  sceneRecovery: { begin: recoveryMocks.begin, getBlock: recoveryMocks.getBlock, getAutomaticBlock: recoveryMocks.getAutomaticBlock, isSafeMode: recoveryMocks.isSafeMode, block: recoveryMocks.block },
}))

vi.mock('@notrac/mage', () => ({
  initMAGE: engineMocks.initMAGE,
}))

describe('createMagePlayer', () => {
  beforeEach(() => {
    let audioLoaded = false
    let audioVolume = 1
    let engineTime = 0

    // Close any player left by the preceding test, as a normal document
    // navigation would, before resetting shared engine/recovery spies.
    window.dispatchEvent(new PageTransitionEvent('pagehide'))
    window.dispatchEvent(new PageTransitionEvent('pageshow'))
    vi.resetModules()
    vi.clearAllMocks()
    recoveryMocks.begin.mockImplementation(() => ({ dispose: recoveryMocks.dispose, fail: recoveryMocks.fail }))
    recoveryMocks.key.mockReturnValue('scene-content-key')
    recoveryMocks.getBlock.mockReturnValue(null)
    recoveryMocks.getAutomaticBlock.mockReturnValue(null)
    recoveryMocks.isSafeMode.mockReturnValue(false)
    document.body.innerHTML = ''

    engineMocks.initMAGE.mockReturnValue({
      getEngineFields: engineMocks.getEngineFields,
      setInputState: engineMocks.setInputState,
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
      setAudioResponseMode: engineMocks.setAudioResponseMode,
      setAudioResponseConfig: engineMocks.setAudioResponseConfig,
      getAudioResponseCapabilities: engineMocks.getAudioResponseCapabilities,
      getAudioResponseDiagnostics: engineMocks.getAudioResponseDiagnostics,
      getAudioResponseEvents: engineMocks.getAudioResponseEvents,
      setEngineTime: engineMocks.setEngineTime,
      setSyntheticPreview: engineMocks.setSyntheticPreview,
      start: engineMocks.start,
      unloadAudio: engineMocks.unloadAudio,
    })
    engineMocks.getAudioDuration.mockReturnValue(0)
    engineMocks.getEngineFields.mockReturnValue({
      controlSettings: { active: false, integrated: false },
      controls: {
        enabled: false, disconnect: vi.fn(), enableRotate: false, enableZoom: true, enablePan: true,
        mouseButtons: { LEFT: 0, MIDDLE: 1, RIGHT: 2 }, touches: { ONE: 0, TWO: 2 }, cursorStyle: 'auto',
        target: { x: 0, y: 0, z: 0 }, minDistance: 0, maxDistance: Infinity, zoomSpeed: 1,
      },
      camera: { near: 0.1, position: { distanceTo: vi.fn(() => 10) } },
      state: { currMouse: { set: vi.fn() } },
      visualizer: { render_tooltips: true, mesh: null, getActiveShader: () => null },
    })
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

  it('resets audio response for every scene load instead of leaking an opt-in to legacy scenes', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))

    player.loadSceneBlob({ visualizer: { shader: 'test' }, audioResponse: 'transient-v1' })
    player.loadSceneBlob({ visualizer: { shader: 'test' } })
    player.loadSceneBlob({ visualizer: { shader: 'test' }, audioResponse: 'legacy' })
    player.loadSceneBlob({ visualizer: { shader: 'test' }, audioResponse: 'unsupported-version' })

    expect(engineMocks.setAudioResponseMode.mock.calls).toEqual([
      ['transient-v1'], ['legacy'], ['legacy'], ['legacy'],
    ])
    expect(engineMocks.setAudioResponseMode.mock.invocationCallOrder[0])
      .toBeGreaterThan(engineMocks.loadPreset.mock.invocationCallOrder[0])
  })

  it('writes an active marker before scene compilation and clears it only after disposal', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    const scene = { visualizer: { shader: 'test' } }
    player.loadSceneBlob(scene, { sceneKey: 42 })
    expect(recoveryMocks.key).toHaveBeenCalledWith(scene, 42)
    expect(recoveryMocks.begin.mock.invocationCallOrder[0]).toBeLessThan(engineMocks.loadPreset.mock.invocationCallOrder[0])
    expect(recoveryMocks.dispose).not.toHaveBeenCalled()
    player.dispose()
    player.dispose()
    expect(engineMocks.dispose).toHaveBeenCalledTimes(1)
    expect(recoveryMocks.dispose).toHaveBeenCalledTimes(1)
    expect(recoveryMocks.dispose.mock.invocationCallOrder[0]).toBeGreaterThan(engineMocks.dispose.mock.invocationCallOrder[0])
  })

  it('blocks quarantined/safe-mode attempts before compilation, even through direct adapter calls', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    recoveryMocks.begin.mockReturnValue(null)
    expect(() => player.loadSceneBlob({ visualizer: { shader: 'test' } })).toThrow(/Automatic rendering is paused/)
    expect(engineMocks.loadPreset).not.toHaveBeenCalled()
    expect(engineMocks.unloadAudio).not.toHaveBeenCalled()
    player.dispose()
  })

  it('never obtains a retry lease for a document that fails ordinary validation', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    expect(() => player.loadSceneBlob({ schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1, visualizer: { shader: 'bad override' } })).toThrow()
    expect(recoveryMocks.begin).not.toHaveBeenCalled()
    expect(recoveryMocks.block).toHaveBeenCalledExactlyOnceWith('scene-content-key', 'load')
    expect(engineMocks.loadPreset).not.toHaveBeenCalled()
    player.dispose()
  })

  it('quarantines compile failures and keeps failed controllers from loading again', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    engineMocks.loadPreset.mockImplementationOnce(() => { throw new Error('compile failed') })
    expect(() => player.loadSceneBlob({ visualizer: { shader: 'bad' } })).toThrow(/compile failed/)
    expect(recoveryMocks.fail).toHaveBeenCalledExactlyOnceWith('load')
    expect(engineMocks.dispose).toHaveBeenCalledTimes(1)
    expect(() => player.loadSceneBlob({ visualizer: { shader: 'test' } })).toThrow(/stopped/)
    expect(engineMocks.loadPreset).toHaveBeenCalledTimes(1)
    player.dispose()
  })

  it('stops and remembers WebGL context loss, but ignores context loss during clean disposal', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const canvas = document.createElement('canvas')
    const player = await createMagePlayer(canvas)
    player.loadSceneBlob({ visualizer: { shader: 'test' } })
    canvas.dispatchEvent(new Event('webglcontextlost'))
    expect(recoveryMocks.fail).toHaveBeenCalledExactlyOnceWith('context-lost')
    player.dispose()
    recoveryMocks.fail.mockClear()
    const other = await createMagePlayer(canvas)
    other.loadSceneBlob({ visualizer: { shader: 'test' } })
    engineMocks.dispose.mockImplementationOnce(() => canvas.dispatchEvent(new Event('webglcontextlost')))
    other.dispose()
    expect(recoveryMocks.fail).not.toHaveBeenCalled()
  })

  it('records deliberate Stop while ordinary pause preserves a resumable active session', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    player.loadSceneBlob({ visualizer: { shader: 'test' } })
    player.setPlaybackState('paused')
    expect(recoveryMocks.fail).not.toHaveBeenCalled()
    expect(recoveryMocks.dispose).not.toHaveBeenCalled()
    player.stopRendering?.()
    expect(recoveryMocks.fail).toHaveBeenCalledExactlyOnceWith('stopped')
    expect(engineMocks.dispose).toHaveBeenCalledTimes(1)
  })

  it('leaves the unfinished marker if engine disposal throws', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    player.loadSceneBlob({ visualizer: { shader: 'test' } })
    engineMocks.dispose.mockImplementationOnce(() => { throw new Error('cleanup failed') })
    expect(() => player.dispose()).toThrow('cleanup failed')
    player.dispose()
    expect(recoveryMocks.dispose).not.toHaveBeenCalled()
  })

  it('cannot recompile through Reset after another surface blocks the scene or enables safe mode', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    player.loadSceneBlob({ visualizer: { shader: 'test' } })
    engineMocks.loadPreset.mockClear()
    recoveryMocks.getBlock.mockReturnValue({ reason: 'runtime', at: Date.now() })
    expect(() => player.resetPlayback()).toThrow(/paused for this scene/)
    recoveryMocks.getBlock.mockReturnValue(null)
    recoveryMocks.isSafeMode.mockReturnValue(true)
    expect(() => player.resetPlayback()).toThrow(/paused for this scene/)
    expect(engineMocks.loadPreset).not.toHaveBeenCalled()
    player.dispose()
  })

  it('cannot resume a direct controller after quarantine or safe mode, while still allowing pause', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    player.loadSceneBlob({ visualizer: { shader: 'test' } })
    player.setPlaybackState('paused')
    engineMocks.start.mockClear()
    engineMocks.play.mockClear()
    recoveryMocks.getBlock.mockReturnValue({ reason: 'runtime', at: Date.now() })
    expect(() => player.setPlaybackState('playing')).toThrow(/paused for this scene/)
    expect(player.getPlaybackState()).toBe('paused')
    expect(player.setPlaybackState('paused')).toBe('paused')
    recoveryMocks.getBlock.mockReturnValue(null)
    recoveryMocks.isSafeMode.mockReturnValue(true)
    expect(() => player.setPlaybackState('playing')).toThrow(/paused for this scene/)
    expect(player.setPlaybackState('paused')).toBe('paused')
    expect(engineMocks.start).not.toHaveBeenCalled()
    expect(engineMocks.play).not.toHaveBeenCalled()
    player.dispose()
  })

  it('does not capture a new rendered frame while the scene is blocked', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    const capture = vi.fn(async () => 'data:image/png;base64,test')
    engineMocks.initMAGE.mock.results[0].value.captureFramePreview = capture
    player.loadSceneBlob({ visualizer: { shader: 'test' } })
    recoveryMocks.getBlock.mockReturnValue({ reason: 'runtime', at: Date.now() })
    await expect(player.captureFramePreview?.()).rejects.toThrow(/paused for this scene/)
    expect(capture).not.toHaveBeenCalled()
    player.dispose()
  })

  it('does not resume rendering when safe mode is enabled during an asynchronous audio load', async () => {
    vi.useFakeTimers()
    try {
      const { createMagePlayer } = await import('./engineAdapter')
      const player = await createMagePlayer(document.createElement('canvas'))
      player.loadSceneBlob({ visualizer: { shader: 'test' } })
      let loaded = false
      engineMocks.isAudioLoaded.mockImplementation(() => loaded)
      engineMocks.loadAudio.mockImplementationOnce(() => {})
      const pending = player.loadAudio({ sourcePath: 'slow.mp3' })
      const rejected = expect(pending).rejects.toThrow(/paused for this scene/)
      recoveryMocks.isSafeMode.mockReturnValue(true)
      engineMocks.play.mockClear()
      engineMocks.seek.mockClear()
      loaded = true
      await vi.advanceTimersByTimeAsync(50)
      await rejected
      expect(engineMocks.play).not.toHaveBeenCalled()
      expect(engineMocks.seek).not.toHaveBeenCalled()
      expect(recoveryMocks.fail).not.toHaveBeenCalled()
      player.dispose()
    } finally { vi.useRealTimers() }
  })

  it('clears active markers after successful disposal on ordinary page navigation', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    player.loadSceneBlob({ visualizer: { shader: 'test' } })
    window.dispatchEvent(new PageTransitionEvent('pagehide'))
    expect(engineMocks.dispose).toHaveBeenCalledTimes(1)
    expect(recoveryMocks.dispose).toHaveBeenCalledTimes(1)
    expect(engineMocks.dispose.mock.invocationCallOrder[0]).toBeLessThan(recoveryMocks.dispose.mock.invocationCallOrder[0])
    expect(recoveryMocks.fail).not.toHaveBeenCalled()
    expect(() => player.setPlaybackState('playing')).toThrow(/stopped/)
    player.dispose()
    expect(recoveryMocks.dispose).toHaveBeenCalledTimes(1)
  })

  it('keeps disposed BFCache controllers dead while allowing a fresh renderer after restoration', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const old = await createMagePlayer(document.createElement('canvas'))
    old.loadSceneBlob({ visualizer: { shader: 'test' } })
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    await expect(createMagePlayer(document.createElement('canvas'))).rejects.toThrow(/page navigation/)
    expect(engineMocks.initMAGE).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(() => old.setPlaybackState('playing')).toThrow(/stopped/)
    const fresh = await createMagePlayer(document.createElement('canvas'))
    fresh.loadSceneBlob({ visualizer: { shader: 'test' } })
    expect(engineMocks.initMAGE).toHaveBeenCalledTimes(2)
    expect(recoveryMocks.block).not.toHaveBeenCalled()
    fresh.dispose()
    old.dispose()
  })

  it('retains unfinished markers on navigation cleanup failure and blocks BFCache auto-restart', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    player.loadSceneBlob({ visualizer: { shader: 'test' } })
    engineMocks.dispose.mockImplementationOnce(() => { throw new Error('GPU cleanup failed') })
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    expect(recoveryMocks.dispose).not.toHaveBeenCalled()
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(recoveryMocks.block).toHaveBeenCalledExactlyOnceWith('scene-content-key', 'interrupted')
    expect(() => player.setPlaybackState('playing')).toThrow(/stopped/)
    player.dispose()
    expect(recoveryMocks.dispose).not.toHaveBeenCalled()
  })

  it('preserves a retry\'s original failure on cleanup failure before host BFCache restoration handlers run', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const hostRestore = vi.fn()
    window.addEventListener('pageshow', hostRestore)
    try {
      const player = await createMagePlayer(document.createElement('canvas'))
      player.loadSceneBlob({ visualizer: { shader: 'test' } })
      recoveryMocks.getAutomaticBlock.mockReturnValue({ reason: 'runtime', at: Date.now() })
      engineMocks.dispose.mockImplementationOnce(() => { throw new Error('cleanup failed during retry') })
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
      expect(recoveryMocks.block).toHaveBeenCalledExactlyOnceWith('scene-content-key', 'runtime')
      expect(recoveryMocks.block.mock.invocationCallOrder[0]).toBeLessThan(hostRestore.mock.invocationCallOrder[0])
      expect(recoveryMocks.dispose).not.toHaveBeenCalled()
      player.dispose()
    } finally { window.removeEventListener('pageshow', hostRestore) }
  })

  it.each(['public-first', 'pagehide-first'] as const)('records unfinished cleanup before detaching restoration guards (%s)', async (order) => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    player.loadSceneBlob({ visualizer: { shader: 'test' } })
    engineMocks.dispose.mockImplementationOnce(() => { throw new Error('dispose failed') })
    if (order === 'public-first') expect(() => player.dispose()).toThrow('dispose failed')
    else {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
      player.dispose()
    }
    expect(recoveryMocks.block).toHaveBeenCalledExactlyOnceWith('scene-content-key', 'interrupted')
    expect(recoveryMocks.dispose).not.toHaveBeenCalled()
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    player.dispose()
    expect(recoveryMocks.block).toHaveBeenCalledTimes(1)
    expect(recoveryMocks.dispose).not.toHaveBeenCalled()
  })

  it('retains a known shader failure when public cleanup fails during a retry', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    player.loadSceneBlob({ visualizer: { shader: 'test' } })
    recoveryMocks.getAutomaticBlock.mockReturnValue({ reason: 'load', at: Date.now() })
    engineMocks.dispose.mockImplementationOnce(() => { throw new Error('dispose failed') })
    expect(() => player.dispose()).toThrow('dispose failed')
    expect(recoveryMocks.block).toHaveBeenCalledExactlyOnceWith('scene-content-key', 'load')
    expect(recoveryMocks.dispose).not.toHaveBeenCalled()
  })

  it('rejects an in-flight creation even if the page is restored before its module load finishes', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const pending = createMagePlayer(document.createElement('canvas'))
    const rejected = expect(pending).rejects.toThrow(/page navigation/)
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    await rejected
    expect(engineMocks.initMAGE).not.toHaveBeenCalled()
    expect(engineMocks.start).not.toHaveBeenCalled()
  })

  it('unregisters navigation listeners on ordinary controller disposal', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    player.loadSceneBlob({ visualizer: { shader: 'test' } })
    player.dispose()
    engineMocks.dispose.mockClear()
    recoveryMocks.dispose.mockClear()
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(engineMocks.dispose).not.toHaveBeenCalled()
    expect(recoveryMocks.dispose).not.toHaveBeenCalled()
    expect(recoveryMocks.block).not.toHaveBeenCalled()
  })

  it('transfers recovery identity after live response edits without restarting or recompiling', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    recoveryMocks.key.mockImplementation((scene: unknown, id?: string | number) => JSON.stringify([scene, id]))
    const player = await createMagePlayer(document.createElement('canvas'))
    const scene = { visualizer: { shader: 'test' }, audioResponse: 'legacy' }
    const updated = { ...scene, audioResponse: 'transient-v1' }
    player.loadSceneBlob(scene, { sceneKey: 12 })
    player.setAudioResponseSettings('transient-v1')
    for (const method of [engineMocks.loadPreset, engineMocks.pause, engineMocks.play, engineMocks.unloadAudio, engineMocks.loadAudio]) method.mockClear()
    player.updateRecoveryIdentity?.(updated, { sceneKey: 12 })
    expect(recoveryMocks.begin).toHaveBeenLastCalledWith(JSON.stringify([updated, 12]))
    expect(recoveryMocks.dispose).toHaveBeenCalledTimes(1)
    for (const method of [engineMocks.loadPreset, engineMocks.pause, engineMocks.play, engineMocks.unloadAudio, engineMocks.loadAudio]) expect(method).not.toHaveBeenCalled()
    expect(() => player.updateRecoveryIdentity?.({ ...updated, visualizer: { shader: 'changed' } }, { sceneKey: 12 })).toThrow(/complete scene load/)
    player.dispose()
  })

  it('tracks the original editor document while validating and rendering only the actual preview payload', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    recoveryMocks.key.mockImplementation((scene: unknown, id?: string | number) => JSON.stringify([scene, id]))
    const player = await createMagePlayer(document.createElement('canvas'))
    const original = { visualizer: { shader: 'original source never rendered' } }
    const preview = { visualizer: { shader: 'test', scale: 10 }, audioResponse: 'legacy' }
    player.loadSceneBlob(preview, { sceneKey: 12, recoverySceneBlob: original })
    expect(recoveryMocks.key).toHaveBeenCalledWith(original, 12)
    expect(recoveryMocks.begin).toHaveBeenCalledExactlyOnceWith(JSON.stringify([original, 12]))
    expect(engineMocks.loadPreset).toHaveBeenCalledExactlyOnceWith(preview)
    const edited = { ...original, audioResponse: 'transient-v1' }
    player.setAudioResponseSettings('transient-v1')
    player.updateRecoveryIdentity?.({ ...preview, audioResponse: 'transient-v1' }, { sceneKey: 12, recoverySceneBlob: edited })
    expect(recoveryMocks.begin).toHaveBeenLastCalledWith(JSON.stringify([edited, 12]))
    expect(engineMocks.loadPreset).toHaveBeenCalledTimes(1)
    expect(() => player.loadSceneBlob({ schemaVersion: 1, kind: 'template', templateId: 'unknown', templateVersion: 1 }, { recoverySceneBlob: original })).toThrow()
    expect(engineMocks.loadPreset).toHaveBeenCalledTimes(1)
    player.dispose()
  })

  it('stops a live response update if its new revision was already blocked', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    recoveryMocks.key.mockImplementation((scene: unknown, id?: string | number) => JSON.stringify([scene, id]))
    const player = await createMagePlayer(document.createElement('canvas'))
    const scene = { visualizer: { shader: 'test' } }
    player.loadSceneBlob(scene)
    player.setAudioResponseSettings('transient-v1')
    recoveryMocks.begin.mockReturnValueOnce(null)
    expect(() => player.updateRecoveryIdentity?.({ ...scene, audioResponse: 'transient-v1' })).toThrow(/paused for this scene/)
    expect(engineMocks.dispose).toHaveBeenCalledTimes(1)
    expect(() => player.setPlaybackState('playing')).toThrow(/stopped/)
    player.dispose()
  })

  it('records runtime failure only from the active renderer lifecycle, not audio loading errors', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    const bridge = engineMocks.initMAGE.mock.results[0].value
    let notify: ((event: { type: 'frame' | 'error' }) => void) | null = null
    const unsubscribe = vi.fn()
    bridge.subscribeRenderLifecycle = (listener: typeof notify) => { notify = listener; return unsubscribe }
    player.loadSceneBlob({ visualizer: { shader: 'test' } })
    engineMocks.loadAudio.mockImplementationOnce(() => { throw new Error('network unavailable') })
    await expect(player.loadAudio({ sourcePath: 'track.mp3' })).rejects.toThrow(/Audio could not be loaded/)
    expect(recoveryMocks.fail).not.toHaveBeenCalled()
    expect(notify).not.toBeNull()
    ;(notify as unknown as (event: { type: 'error' }) => void)({ type: 'error' })
    expect(recoveryMocks.fail).toHaveBeenCalledExactlyOnceWith('runtime')
    expect(engineMocks.dispose).toHaveBeenCalledTimes(1)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    player.dispose()
  })

  it('loads every registered template through the owned-source resolver', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    for (const template of listSceneTemplates()) {
      player.loadSceneBlob({ schemaVersion: 1, kind: 'template', templateId: template.templateId, templateVersion: template.templateVersion })
      expect(engineMocks.loadPreset).toHaveBeenLastCalledWith(expect.objectContaining({
        visualizer: { shader: getTemplateDefinition(template.templateId, 1)?.shader, scale: 10, skyboxPreset: 6 },
      }))
    }
    expect(engineMocks.loadPreset).toHaveBeenCalledTimes(16)
    player.resetPlayback()
    expect(engineMocks.loadPreset).toHaveBeenCalledTimes(17)
    expect(engineMocks.loadPreset.mock.lastCall?.[0]).not.toHaveProperty('templateId')
  })

  it('rejects mixed template/source before compilation or disturbing a loaded scene', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    const valid = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
    player.loadSceneBlob(valid)
    engineMocks.loadPreset.mockClear()
    engineMocks.unloadAudio.mockClear()
    for (const invalid of [
      { ...valid, visualizer: { shader: 'globalThis.injected = true' } },
      { ...valid, source: 'globalThis.injected = true' },
      { ...valid, parameters: { scale: 'fetch("https://example.com")' } },
      { ...valid, settings: { tint: { color: 'red; injected()' } } },
      { ...valid, audioResponseConfig: { source: 'injected' } },
      { ...valid, templateVersion: 999 },
      JSON.parse('{"schemaVersion":1,"kind":"template","templateId":"embedded-scene-0","templateVersion":1,"settings":{"__proto__":{"source":"injected"}}}'),
    ]) {
      expect(() => player.loadSceneBlob(invalid)).toThrow()
    }
    expect(engineMocks.loadPreset).not.toHaveBeenCalled()
    expect(engineMocks.unloadAudio).not.toHaveBeenCalled()
    player.resetPlayback()
    expect(engineMocks.loadPreset).toHaveBeenCalledTimes(1)
    expect(engineMocks.loadPreset.mock.lastCall?.[0]).toHaveProperty('visualizer.shader', getTemplateDefinition('embedded-scene-0', 1)?.shader)
  })

  it('copies finite live measurements without exposing or changing engine state', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    expect(player.getEngineDiagnostics?.()).toBeNull()
    expect(engineMocks.getEngineFields).not.toHaveBeenCalled()
    player.loadSceneBlob({ visualizer: { shader: 'test' } })
    const fields = engineMocks.getEngineFields()
    Object.assign(fields.state, { size: 1.5, pointerDown: 0.4, currPointerDown: 1, currAudio: 0.6 })
    const readings = player.getEngineDiagnostics?.()
    expect(readings).toEqual({ size: 1.5, pointerDown: 0.4, currPointerDown: 1, currAudio: 0.6 })
    Object.assign(fields.state, { size: 2, pointerDown: NaN, currPointerDown: '1', currAudio: Infinity })
    expect(readings?.size).toBe(1.5)
    expect(player.getEngineDiagnostics?.()).toEqual({ size: 2, pointerDown: null, currPointerDown: null, currAudio: null })
    expect(fields.state.currPointerDown).toBe('1')
    player.dispose()
    expect(player.getEngineDiagnostics?.()).toBeNull()
  })

  it('reports diagnostics unavailable when the runtime boundary cannot be read', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    player.loadSceneBlob({ visualizer: { shader: 'test' } })
    engineMocks.getEngineFields.mockReturnValueOnce(undefined)
    expect(player.getEngineDiagnostics?.()).toBeNull()
    engineMocks.getEngineFields.mockImplementationOnce(() => { throw new Error('Unavailable') })
    expect(player.getEngineDiagnostics?.()).toBeNull()
    expect(player.getPlaybackState()).toBe('playing')
  })

  it('restores the authored audio response when playback is reset', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    player.loadSceneBlob({ visualizer: { shader: 'test' }, audioResponse: 'transient-v1' })
    engineMocks.setAudioResponseMode.mockClear()

    player.resetPlayback()

    expect(engineMocks.setAudioResponseMode).toHaveBeenCalledExactlyOnceWith('transient-v1')
  })

  it('supports older engine bridges that do not expose audio response selection', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const engine = engineMocks.initMAGE.getMockImplementation()?.()
    engineMocks.initMAGE.mockReturnValue({ ...engine, setAudioResponseMode: undefined })
    const player = await createMagePlayer(document.createElement('canvas'))

    expect(() => player.loadSceneBlob({
      visualizer: { shader: 'test' }, audioResponse: 'transient-v1',
    })).not.toThrow()
    expect(engineMocks.setAudioResponseMode).not.toHaveBeenCalled()
  })

  it('does not apply audio response metadata after a failed scene load', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))
    engineMocks.loadPreset.mockReturnValue(null)

    expect(() => player.loadSceneBlob({
      visualizer: { shader: 'test' }, audioResponse: 'transient-v1',
    })).toThrow()
    expect(engineMocks.setAudioResponseMode).not.toHaveBeenCalled()
  })

  it('forwards an opt-in render pixel ratio without changing the control configuration', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const canvas = document.createElement('canvas')

    const player = await createMagePlayer(canvas, { pixelRatio: 2 })

    expect(engineMocks.initMAGE).toHaveBeenCalledWith({
      autoStart: false,
      canvas,
      log: false,
      pixelRatio: 2,
      withControls: {
        active: false,
        integrated: false,
      },
    })
    expect(engineMocks.start).toHaveBeenCalledTimes(1)
    player.dispose()
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

  it('forwards silent synthetic preview state without loading or playing audio', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const canvas = document.createElement('canvas')
    const player = await createMagePlayer(canvas)

    player.setSyntheticPreview(true, 731)

    expect(engineMocks.setSyntheticPreview).toHaveBeenLastCalledWith(true, 731)
    expect(engineMocks.loadAudio).not.toHaveBeenCalled()
    expect(engineMocks.play).not.toHaveBeenCalled()

    player.setSyntheticPreview(false)

    expect(engineMocks.setSyntheticPreview).toHaveBeenLastCalledWith(false, undefined)
    expect(engineMocks.setSyntheticPreview).toHaveBeenCalledTimes(2)
  })

  it('forwards an optional slower tempo without changing the default preview rhythm', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const player = await createMagePlayer(document.createElement('canvas'))

    player.setSyntheticPreview(true, 73, 0.5)
    expect(engineMocks.setSyntheticPreview).toHaveBeenLastCalledWith(true, 73, 0.5)
    player.setSyntheticPreview(true, 73)
    expect(engineMocks.setSyntheticPreview).toHaveBeenLastCalledWith(true, 73)
    expect(engineMocks.loadAudio).not.toHaveBeenCalled()
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

  it('opts full players into native drag rotation and mouse reactions without bootstrapping engine UI', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const canvas = document.createElement('canvas')
    const fields = engineMocks.getEngineFields()
    const player = await createMagePlayer(canvas, { mouseInteractions: true })

    expect(engineMocks.initMAGE).toHaveBeenCalledWith(expect.objectContaining({
      withControls: { active: false, integrated: false },
    }))
    expect(fields.controls.disconnect).not.toHaveBeenCalled()
    expect(fields.controlSettings).toEqual({ active: true, integrated: false })
    expect(fields.controls).toMatchObject({
      enabled: true, enableRotate: true, enableZoom: false, enablePan: false,
      mouseButtons: { LEFT: 0, MIDDLE: null, RIGHT: null }, touches: { ONE: null, TWO: null }, cursorStyle: 'grab',
    })
    expect(canvas.style.touchAction).toBe('auto')
    expect(fields.visualizer.render_tooltips).toBe(false)
    engineMocks.setInputState.mockClear()
    player.loadSceneBlob({ visualizer: { shader: 'sphere(1);' } })
    expect(engineMocks.setInputState).toHaveBeenCalledWith(expect.objectContaining({ pointerOverUi: true, currPointerDown: 0 }))
    player.dispose()
    expect(fields.controlSettings.active).toBe(false)
    expect(fields.controls.enabled).toBe(false)
    expect(engineMocks.dispose).toHaveBeenCalledOnce()
  })

  it('opts into bounded wheel zoom and recalibrates after each authored preset load, not against stale limits', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const canvas = document.createElement('canvas')
    const fields = engineMocks.getEngineFields()
    const player = await createMagePlayer(canvas, { mouseInteractions: true, mouseWheelZoom: true })
    expect(fields.controls).toMatchObject({ enableZoom: true, minDistance: 4, maxDistance: 25, zoomSpeed: 0.65 })
    let authoredDistance = 60
    engineMocks.loadPreset.mockImplementation(() => {
      // The real engine resets OrbitControls while loading: old zoom limits
      // would otherwise clamp a new scene's authored camera before rebasing.
      const loadedDistance = Math.min(fields.controls.maxDistance, Math.max(fields.controls.minDistance, authoredDistance))
      fields.camera.position.distanceTo.mockReturnValue(loadedDistance)
      return { visualizer: { shader: 'sphere(1);' } }
    })

    player.loadSceneBlob({ visualizer: { shader: 'sphere(1);' } })
    expect(fields.controls).toMatchObject({ minDistance: 24, maxDistance: 150 })
    authoredDistance = 1
    player.loadSceneBlob({ visualizer: { shader: 'sphere(0.5);' } })
    expect(fields.controls).toMatchObject({ minDistance: 0.4, maxDistance: 2.5 })
    authoredDistance = 10
    player.resetPlayback()
    expect(fields.controls).toMatchObject({ minDistance: 4, maxDistance: 25 })
    player.dispose()
  })

  it('keeps callers such as thumbnail hover previews noninteractive unless they opt in', async () => {
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
    expect(engineMocks.getEngineFields).not.toHaveBeenCalled()
    expect(engineMocks.setInputState).not.toHaveBeenCalled()

    player.dispose()
  })
  it.each(['playing', 'paused'] as const)('updates mapped settings live while %s without reloading or selecting the mode again', async (playback) => {
    const { createMagePlayer } = await import('./engineAdapter')
    const { normalizeAudioResponseConfig } = await import('@shared/lib')
    const config = normalizeAudioResponseConfig({ sensitivity: 1.4 }).config
    const player = await createMagePlayer(document.createElement('canvas'))
    player.loadSceneBlob({ visualizer: { shader: 'test' }, audioResponse: 'mapped-v1', audioResponseConfig: config })
    engineMocks.getAudioDuration.mockReturnValue(180)
    await player.loadAudio({ sourcePath: 'song.mp3' })
    player.seekAudio(37)
    player.setAudioVolume(0.4)
    player.setPlaybackState(playback)
    for (const method of [engineMocks.setAudioResponseMode, engineMocks.setAudioResponseConfig, engineMocks.loadAudio,
      engineMocks.loadPreset, engineMocks.unloadAudio, engineMocks.seek, engineMocks.play, engineMocks.pause]) method.mockClear()

    const updated = { ...config, sensitivity: 2 }
    expect(player.setAudioResponseSettings('mapped-v1', updated)).toMatchObject({
      savedMode: 'mapped-v1', savedConfig: updated, override: null, effectiveConfig: updated,
    })
    player.setAudioResponseSettings('mapped-v1', { ...updated })
    expect(engineMocks.setAudioResponseConfig).toHaveBeenCalledExactlyOnceWith(updated)
    for (const method of [engineMocks.setAudioResponseMode, engineMocks.loadAudio, engineMocks.loadPreset,
      engineMocks.unloadAudio, engineMocks.seek, engineMocks.play, engineMocks.pause]) expect(method).not.toHaveBeenCalled()
    expect(engineMocks.initMAGE).toHaveBeenCalledTimes(1)
    expect(player.getPlaybackState()).toBe(playback)
    expect(player.getAudioState()).toMatchObject({ isLoaded: true, sourcePath: 'song.mp3', volume: 0.4 })
    expect(player.getAudioState().currentTime).toBeGreaterThanOrEqual(37)
  })

  it('keeps viewer overrides separate from authored defaults and restores them on reset or a new scene', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const { normalizeAudioResponseConfig } = await import('@shared/lib')
    const saved = normalizeAudioResponseConfig({ sensitivity: 1.2 }).config
    const override = normalizeAudioResponseConfig({ sensitivity: 2.2 }).config
    const updated = normalizeAudioResponseConfig({ sensitivity: 0.6 }).config
    const scene = { visualizer: { shader: 'test' }, audioResponse: 'legacy', audioResponseConfig: saved }
    const original = structuredClone(scene)
    const player = await createMagePlayer(document.createElement('canvas'))
    player.loadSceneBlob(scene)
    expect(player.setAudioResponseOverride(override)).toMatchObject({
      savedMode: 'legacy', savedConfig: saved, override, effectiveMode: 'mapped-v1', effectiveConfig: override,
    })
    engineMocks.setAudioResponseConfig.mockClear()
    engineMocks.setAudioResponseMode.mockClear()
    player.setAudioResponseSettings('transient-v1', updated)
    expect(engineMocks.setAudioResponseMode).not.toHaveBeenCalled()
    expect(engineMocks.setAudioResponseConfig).not.toHaveBeenCalled()
    const snapshot = player.getAudioResponseState()
    snapshot.savedConfig!.sensitivity = 99
    snapshot.override!.mappings.length = 0
    expect(player.getAudioResponseState()).toMatchObject({ savedConfig: updated, override })
    player.resetPlayback()
    expect(engineMocks.loadPreset).toHaveBeenLastCalledWith({ ...scene, audioResponse: 'transient-v1', audioResponseConfig: updated })
    expect(engineMocks.setAudioResponseConfig).toHaveBeenLastCalledWith(override)
    expect(player.setAudioResponseOverride(null)).toMatchObject({
      savedMode: 'transient-v1', savedConfig: updated, override: null, effectiveMode: 'transient-v1', effectiveConfig: null,
    })
    player.setAudioResponseOverride(override)
    player.loadSceneBlob(scene)
    expect(player.getAudioResponseState()).toMatchObject({ savedMode: 'legacy', savedConfig: saved, override: null, effectiveMode: 'legacy' })
    expect(scene).toEqual(original)
  })

  it('does not inject response metadata into older scenes and honors JSON deletion on live updates', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const scene = { visualizer: { shader: 'test' } }
    const player = await createMagePlayer(document.createElement('canvas'))
    player.loadSceneBlob(scene)
    player.setAudioResponseSettings('mapped-v1', { sensitivity: 2 })
    player.setAudioResponseSettings(undefined)
    expect(player.getAudioResponseState()).toMatchObject({ savedMode: 'legacy', savedConfig: null, effectiveConfig: null })
    player.resetPlayback()
    expect(engineMocks.loadPreset).toHaveBeenLastCalledWith(scene)
  })

  it('exposes defensive capability, diagnostic, and cursor-based event snapshots through the adapter', async () => {
    const { createMagePlayer } = await import('./engineAdapter')
    const capabilities = { mode: 'mapped-v1', signals: ['bass-level'], targets: ['size', 'bass'], supportedTargets: ['size'], unsupportedTargets: ['bass'], warnings: ['bass is not declared'] }
    const events = [{ id: 8, time: 1.2, band: 'bass', strength: 0.8 }]
    const diagnostics = { mode: 'mapped-v1', config: null, analysis: {}, outputs: { size: 0.5 }, events, source: 'audio' }
    engineMocks.getAudioResponseCapabilities.mockReturnValue(capabilities)
    engineMocks.getAudioResponseDiagnostics.mockReturnValue(diagnostics)
    engineMocks.getAudioResponseEvents.mockReturnValue(events)
    const player = await createMagePlayer(document.createElement('canvas'))
    player.getAudioResponseCapabilities()!.warnings.length = 0
    player.getAudioResponseDiagnostics()!.outputs.size = 10
    player.getAudioResponseEvents(7)[0].strength = 0
    expect(capabilities.warnings).toHaveLength(1)
    expect(diagnostics.outputs.size).toBe(0.5)
    expect(events[0].strength).toBe(0.8)
    expect(engineMocks.getAudioResponseEvents).toHaveBeenLastCalledWith(7)
  })

  it('rejects a superseded audio load before the newer track can trigger stale seek or playback writes', async () => {
    vi.useFakeTimers()
    try {
      const { createMagePlayer } = await import('./engineAdapter')
      let loaded = false
      engineMocks.isAudioLoaded.mockImplementation(() => loaded)
      engineMocks.loadAudio.mockImplementation(() => {})
      const player = await createMagePlayer(document.createElement('canvas'))
      player.loadSceneBlob({ visualizer: { shader: 'test' } })
      const first = player.loadAudio({ sourcePath: 'first.mp3' })
      const rejected = expect(first).rejects.toThrow(/superseded/)
      const second = player.loadAudio({ sourcePath: 'second.mp3' })
      engineMocks.seek.mockClear()
      engineMocks.play.mockClear()
      loaded = true
      await vi.advanceTimersByTimeAsync(50)
      await rejected
      expect(await second).toMatchObject({ sourcePath: 'second.mp3', isLoaded: true })
      expect(engineMocks.seek).toHaveBeenCalledTimes(1)
      expect(engineMocks.play).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })

  it.each(['clear', 'scene', 'dispose', 'pagehide'] as const)('invalidates pending audio completion after %s', async (action) => {
    vi.useFakeTimers()
    try {
      const { createMagePlayer } = await import('./engineAdapter')
      let loaded = false
      engineMocks.isAudioLoaded.mockImplementation(() => loaded)
      engineMocks.loadAudio.mockImplementation(() => {})
      const player = await createMagePlayer(document.createElement('canvas'))
      player.loadSceneBlob({ visualizer: { shader: 'test' } })
      const pending = player.loadAudio({ sourcePath: 'old.mp3' })
      const rejected = expect(pending).rejects.toThrow(/superseded/)
      if (action === 'clear') player.clearAudio()
      else if (action === 'scene') player.loadSceneBlob({ visualizer: { shader: 'next' } })
      else if (action === 'pagehide') window.dispatchEvent(new PageTransitionEvent('pagehide'))
      else player.dispose()
      engineMocks.seek.mockClear()
      engineMocks.play.mockClear()
      loaded = true
      await vi.advanceTimersByTimeAsync(50)
      await rejected
      expect(engineMocks.seek).not.toHaveBeenCalled()
      expect(engineMocks.play).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })

})

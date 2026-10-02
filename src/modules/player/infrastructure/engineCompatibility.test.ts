import engineSource from '@notrac/mage?raw'
import type { MAGEConfig, MAGEEngineAPI } from '@notrac/mage'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'

type EngineHarness = Record<string, unknown>
type EngineMethod = (this: EngineHarness, ...args: unknown[]) => unknown

const engineStart = engineSource.indexOf('var MAGEEngine = class MAGEEngine {')
if (engineStart < 0) throw new Error('Could not locate the installed MAGE engine for compatibility tests.')
const engineClassSource = engineSource.slice(engineStart)

// Use the installed implementation, not an imitation of it. Only private-field
// syntax is changed so these small methods can run with resources that do not
// require WebGL or real audio devices. Missing methods fail the harness loudly.
function classMethod(source: string, name: string, dependencies: Record<string, unknown> = {}): EngineMethod {
  const publicStart = source.indexOf(`\n\t${name}(`)
  const privateStart = source.indexOf(`\n\t#${name}(`)
  const start = publicStart >= 0 ? publicStart : privateStart
  const end = source.indexOf('\n\t}', start)
  if (start < 0 || end <= start) throw new Error(`Missing installed MAGE method: ${name}`)
  const method = source.slice(start + 2, end + 3)
    .replace(/^#/, '')
    .replaceAll('this.#', 'this.')
  return new Function(...Object.keys(dependencies), `return function ${method}`)(...Object.values(dependencies)) as EngineMethod
}

function engineMethod(name: string, dependencies: Record<string, unknown> = {}): EngineMethod {
  return classMethod(engineClassSource, name, dependencies)
}

function audioFrame() {
  const renderStart = engineClassSource.indexOf('#_render = () => {')
  const start = engineClassSource.indexOf('let bass_input = 0;', renderStart)
  const end = engineClassSource.indexOf('this.#controls.update();', start)
  if (renderStart < 0 || start < renderStart || end <= start) throw new Error('The MAGE audio-frame harness needs updating.')
  return new Function('delta', engineClassSource.slice(start, end).replaceAll('this.#', 'this.')) as EngineMethod
}

function previewFixture(): EngineHarness {
  return {
    state: { time: 1, size: 0, currAudio: 0, minimizing_factor: 0.8, power_factor: 2, base_speed: 0.12, easing_speed: 0.55, volume_multiplier: 0 },
    audio: null,
    reversedAudio: null,
    audioAnalyser: null,
    previewMode: false,
    syntheticPreviewEnabled: false,
    syntheticPreviewSeed: 0,
    syntheticPreviewTempoScale: 1,
    syntheticPreviewTime: 0,
  }
}

function audioSourceFixture(isPlaying: boolean) {
  const audio = {
    buffer: { duration: 10 },
    context: { currentTime: 12 },
    offset: 1,
    _progress: 3,
    _startedAt: 10,
    playbackRate: 1,
    isPlaying,
    startedOffsets: [] as number[],
    stop: vi.fn(() => { audio.isPlaying = false; audio._progress = 0 }),
    play: vi.fn(() => {
      audio.startedOffsets.push(audio.offset + audio._progress)
      audio._startedAt = audio.context.currentTime
      audio.isPlaying = true
    }),
  }
  return audio
}

describe('installed MAGE engine compatibility', () => {
  it('allows custom shaders to omit unused callback inputs while updating declared uniforms', () => {
    const marker = 'mesh.onBeforeRender = function('
    const start = engineSource.indexOf(marker)
    const end = engineSource.indexOf('\n\t\t\t};', start)
    if (start < 0 || end < start) throw new Error('Missing ShaderPark uniform callback.')
    const callbackSource = engineSource.slice(start + 'mesh.onBeforeRender = '.length, end + '\n\t\t\t}'.length)
    const callback = new Function('uniformCallback', '_typeof', '_slicedToArray', `return ${callbackSource}`)(
      () => ({ time: 4, size: .5, pointerDown: .2, mouse: 'pointer', _scale: 10 }),
      (value: unknown) => typeof value,
      (value: unknown) => value,
    ) as (...args: unknown[]) => void
    const uniforms = { time: { value: 0 }, mouse: { value: 'initial' }, _scale: { value: 1 } }
    expect(() => callback(null, null, null, null, { uniforms }, null)).not.toThrow()
    expect(uniforms).toEqual({ time: { value: 4 }, mouse: { value: 'pointer' }, _scale: { value: 10 } })
    expect(uniforms).not.toHaveProperty('size')
    expect(uniforms).not.toHaveProperty('pointerDown')
  })

  it('exposes the patched APIs in the dependency’s own TypeScript declarations', () => {
    expectTypeOf<MAGEEngineAPI['unloadAudio']>().toEqualTypeOf<() => void>()
    expectTypeOf<MAGEEngineAPI['getAudioVolume']>().toEqualTypeOf<() => number>()
    expectTypeOf<MAGEEngineAPI['setAudioVolume']>().toEqualTypeOf<(volume: number) => number>()
    expectTypeOf<MAGEEngineAPI['setAudioResponseMode']>().toEqualTypeOf<(mode?: 'legacy' | 'transient-v1' | 'mapped-v1') => void>()
    expectTypeOf<MAGEEngineAPI['setSyntheticPreview']>().toEqualTypeOf<(enabled: boolean, seed?: number, tempoScale?: number) => void>()
    expectTypeOf<MAGEConfig['pixelRatio']>().toEqualTypeOf<number | undefined>()
  })

  it('cancels animation while paused and restarts only one loop without requiring audio', () => {
    const cancelled = vi.fn()
    const resetClock = vi.fn()
    const render = vi.fn()
    const engine: EngineHarness = {
      isDisposed: false,
      isRunning: true,
      animationFrameId: 37,
      scene: {},
      clock: { reset: resetClock },
      visualizer: { mesh: {} },
      currentPreset: {},
      audio: null,
      reversedAudio: null,
      _render: render,
      isAudioLoaded: engineMethod('isAudioLoaded'),
      start: engineMethod('start'),
    }
    const pause = engineMethod('pause', { cancelAnimationFrame: cancelled })
    const play = engineMethod('play')

    pause.call(engine)
    pause.call(engine)
    expect(cancelled).toHaveBeenCalledExactlyOnceWith(37)
    expect(engine).toMatchObject({ isRunning: false, animationFrameId: null })
    expect(render).not.toHaveBeenCalled()

    play.call(engine)
    play.call(engine)
    expect(engine.isRunning).toBe(true)
    expect(render).toHaveBeenCalledTimes(1)
    expect(resetClock).toHaveBeenCalledTimes(1)
    expect(engine.audio).toBeNull()
  })

  it('pauses both active audio directions along with the render loop', () => {
    const forwardPause = vi.fn()
    const reversePause = vi.fn()
    const engine = {
      audio: { isPlaying: true, pause: forwardPause },
      reversedAudio: { isPlaying: true, pause: reversePause },
      isRunning: true,
      animationFrameId: null,
    }
    engineMethod('pause').call(engine)
    expect(forwardPause).toHaveBeenCalledOnce()
    expect(reversePause).toHaveBeenCalledOnce()
    expect(engine.isRunning).toBe(false)
  })

  it('releases renderer, geometry, audio, and input resources even when already paused, only once', () => {
    const renderer = { dispose: vi.fn(), forceContextLoss: vi.fn(), context: {}, domElement: {} }
    const geometry = { dispose: vi.fn() }
    const material = { dispose: vi.fn() }
    const controls = { dispose: vi.fn() }
    const renderTarget = { dispose: vi.fn() }
    const audio = { stop: vi.fn(), disconnect: vi.fn() }
    const reversedAudio = { stop: vi.fn(), disconnect: vi.fn() }
    const unsubscribe = vi.fn()
    const inputBridge = { detach: vi.fn() }
    const engine: EngineHarness = {
      isDisposed: false,
      isRunning: false,
      animationFrameId: null,
      renderer,
      scene: { traverse: (visit: (object: unknown) => void) => visit({ geometry, material: [material] }) },
      controls,
      renderTarget,
      audio,
      reversedAudio,
      externalInputUnsubscribe: unsubscribe,
      viewportInputBridge: inputBridge,
      windowInputBridge: inputBridge,
      visualizer: { mesh: {}, shader: {}, shaders: ['shader'] },
      state: {},
      inputs: {},
    }
    const dispose = engineMethod('dispose')
    dispose.call(engine)
    dispose.call(engine)

    for (const release of [renderer.dispose, renderer.forceContextLoss, geometry.dispose, material.dispose, controls.dispose, renderTarget.dispose, audio.stop, audio.disconnect, reversedAudio.stop, reversedAudio.disconnect, unsubscribe, inputBridge.detach]) {
      expect(release).toHaveBeenCalledOnce()
    }
    expect(engine).toMatchObject({ isDisposed: true, renderer: null, scene: null, controls: null, audio: null, reversedAudio: null, state: null, inputs: null })
  })

  it('attaches each loaded preset’s new visualizer mesh to the actual rendered scene', () => {
    class SceneFixture {
      children: unknown[] = []
      add(mesh: unknown) { this.children.push(mesh) }
      remove(mesh: unknown) { this.children = this.children.filter(child => child !== mesh) }
      traverse(visit: (object: unknown) => void) { this.children.forEach(visit) }
    }
    class RenderTargetFixture { dispose = vi.fn() }
    const scene = new SceneFixture()
    const previousTarget = new RenderTargetFixture()
    const firstMesh = { label: 'first', clone: () => ({ label: 'first-clone' }) }
    const nextMesh = {
      label: 'rings',
      clone: () => ({ label: 'rings-clone' }),
      traverse(visit: (object: unknown) => void) { visit(this) },
    }
    scene.add(firstMesh)
    const visualizer = {
      mesh: firstMesh,
      scale: 1,
      load: vi.fn(() => { visualizer.mesh = nextMesh }),
    }
    const engine: EngineHarness = {
      visualizer,
      scene,
      renderer: {},
      camera: {},
      renderTarget: previousTarget,
      viewportWidth: 640,
      viewportHeight: 360,
      controls: { enabled: false },
      controlSettings: { active: false },
      setAudioResponseMode: vi.fn(),
      fx: { bleachBypassShader: { enabled: false }, toonShader: { enabled: false } },
      _clearScene: engineMethod('_clearScene'),
      _updateVisualizer: engineMethod('_updateVisualizer', {
        Scene: SceneFixture, WebGLRenderTarget: RenderTargetFixture, RGBAFormat: 1, UnsignedByteType: 1,
      }),
      _syncPostProcessingFromState: vi.fn(),
      _syncSobelResolution: vi.fn(),
    }
    const preset = { visualizer: { shader: 'torus(1, 0.03);', scale: 1.25 } }
    const load = engineMethod('loadPreset', { MAGEPreset: { from: (value: unknown) => value } })

    expect(load.call(engine, preset)).toBe(preset)
    expect(visualizer.load).toHaveBeenCalledWith({ shader: preset.visualizer.shader, addToHistory: true, clearHistory: true })
    expect(visualizer.scale).toBe(1.25)
    expect(scene.children).toEqual([nextMesh])
    expect((engine.rtScene as SceneFixture).children).toEqual([{ label: 'rings-clone' }])
    expect(previousTarget.dispose).toHaveBeenCalledOnce()
  })

  it('exports the active shader from the visualizer’s supported accessor, not a removed field', () => {
    const shader = 'torus(1, 0.03);'
    const pass = {
      enabled: false,
      color: '#ffffff',
      shader: { uniforms: { amount: { value: 0 }, angle: { value: 0 }, damp: { value: 0 }, sides: { value: 6 } } },
    }
    const fx = {
      ...Object.fromEntries(['RGBShift', 'dotShader', 'technicolorShader', 'luminosityShader', 'afterImagePass', 'sobelShader', 'glitchPass', 'colorifyShader', 'halftonePass', 'gammaCorrectionShader', 'kaleidoShader', 'outputPass'].map(name => [name, pass])),
      bleachBypassShader: { enabled: true },
      toonShader: { enabled: true },
      getPassOrder: () => ['outputPass'],
      bloom: { enabled: false, settings: { strength: 0, radius: 0, threshold: 0 } },
      toneMapping: { method: 4 },
    }
    const getActiveShader = vi.fn(() => shader)
    const engine = {
      visualizer: { getActiveShader, skyboxPreset: 6, scale: 1.25 },
      audioResponseMode: 'transient-v1',
      state: { time: 3, size: 0.2 },
      controls: null,
      camera: { fov: 50 },
      renderer: { toneMappingExposure: 0.55 },
      fx,
    }

    expect(engineMethod('toPreset', { MAGE_VERSION: 'test' }).call(engine)).toMatchObject({
      audioResponse: 'transient-v1',
      visualizer: { shader, skyboxPreset: 6, scale: 1.25 },
      state: { time: 3, size: 0.2 },
      fx: { passes: { bleachBypass: true, toon: true } },
    })
    expect(getActiveShader).toHaveBeenCalledOnce()
    engine.audioResponseMode = 'legacy'
    expect(engineMethod('toPreset', { MAGE_VERSION: 'test' }).call(engine)).not.toHaveProperty('audioResponse')
  })

  it('loads, disables, and resets the new effects when an older scene omits their flags', () => {
    const fx = { bleachBypassShader: { enabled: false }, toonShader: { enabled: false } }
    const engine: EngineHarness = {
      fx, controls: { enabled: false }, controlSettings: { active: false },
      setAudioResponseMode: vi.fn(),
      _applyCompactFx: engineMethod('_applyCompactFx'),
      _syncPostProcessingFromState: vi.fn(), _syncSobelResolution: vi.fn(),
    }
    const load = engineMethod('loadPreset', { MAGEPreset: { from: (value: unknown) => value } })
    load.call(engine, { fx: { passes: { bleachBypass: true, toon: true } } })
    expect(fx).toEqual({ bleachBypassShader: { enabled: true }, toonShader: { enabled: true } })
    load.call(engine, { fx: { passes: { bleachBypass: false, toon: false } } })
    expect(fx).toEqual({ bleachBypassShader: { enabled: false }, toonShader: { enabled: false } })
    load.call(engine, { fx: { passes: { bleachBypass: true, toon: true } } })
    load.call(engine, {})
    expect(fx).toEqual({ bleachBypassShader: { enabled: false }, toonShader: { enabled: false } })
    load.call(engine, { fx: { passes: { bleachBypass: true, toon: true } } })
    load.call(engine, { fx: { passes: {} } })
    expect(fx).toEqual({ bleachBypassShader: { enabled: false }, toonShader: { enabled: false } })
  })

  it('uses a scene-texture Toon shader and reuses its pass when effects refresh', () => {
    const start = engineSource.indexOf('var MageToonPostShader = {')
    const end = engineSource.indexOf('\n};', start)
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    class Vector2Fixture {
      x = 1
      y = 1
    }
    const shader = new Function('Vector2', `${engineSource.slice(start, end + 3)}; return MageToonPostShader;`)(Vector2Fixture)
    expect(shader.uniforms).toMatchObject({ tDiffuse: { value: null }, resolution: { value: { x: 1, y: 1 } } })
    expect(shader.vertexShader).toContain('vUv = uv')
    expect(shader.fragmentShader).toContain('texture2D(tDiffuse, vUv)')
    expect(shader.fragmentShader).toContain('base.a')
    expect(shader.fragmentShader).not.toContain('vNormal')
    expect(shader.fragmentShader).not.toContain('colorspace_fragment')

    const toonStart = engineSource.indexOf('\n\t\tthis.toonShader = {', engineSource.indexOf('var MAGEEffects = class'))
    const toonEnd = engineSource.indexOf('\n\t\t};', toonStart)
    expect(toonStart).toBeGreaterThan(0)
    expect(toonEnd).toBeGreaterThan(toonStart)
    const constructPass = vi.fn()
    class ShaderPassFixture {
      uniforms = shader.uniforms
      constructor(definition: unknown) { constructPass(definition) }
    }
    const createToon = new Function('ShaderPass', 'MageToonPostShader', `return function() { ${engineSource.slice(toonStart, toonEnd + 5)} }`)(ShaderPassFixture, shader)
    const fx = {} as { toonShader: { shader: ShaderPassFixture; enabled: boolean; update: (renderer: unknown) => void } }
    createToon.call(fx)
    const initialPass = fx.toonShader.shader
    const renderer = { getDrawingBufferSize: (value: Vector2Fixture) => { value.x = 1280; value.y = 720 } }
    fx.toonShader.update(renderer)
    fx.toonShader.update(renderer)
    expect(fx.toonShader.enabled).toBe(false)
    expect(constructPass).toHaveBeenCalledExactlyOnceWith(shader)
    expect(fx.toonShader.shader).toBe(initialPass)
    expect(initialPass.uniforms.resolution.value).toMatchObject({ x: 1280, y: 720 })
  })

  it('keeps Toon outline pixels sized correctly after a canvas resize', () => {
    const sobel = { x: 1, y: 1 }
    const toon = { x: 1, y: 1 }
    const engine = {
      renderer: { domElement: { width: 1600, height: 900 } },
      fx: {
        sobelShader: { shader: { uniforms: { resolution: { value: sobel } } } },
        toonShader: { shader: { uniforms: { resolution: { value: toon } } } },
      },
    }
    engineMethod('_syncSobelResolution').call(engine)
    expect(sobel).toEqual({ x: 1600, y: 900 })
    expect(toon).toEqual(sobel)
    engine.renderer.domElement = { width: 640, height: 480 }
    engineMethod('_syncSobelResolution').call(engine)
    expect(toon).toEqual({ x: 640, y: 480 })
  })

  it('disposes a replaced visualizer mesh without disposing its replacement', () => {
    class SceneFixture {
      children: unknown[] = []
      add(mesh: unknown) { this.children.push(mesh) }
      remove(mesh: unknown) { this.children = this.children.filter(child => child !== mesh) }
      traverse(visit: (object: unknown) => void) { this.children.forEach(visit) }
    }
    class RenderTargetFixture { dispose = vi.fn() }
    const oldGeometry = { dispose: vi.fn() }
    const oldMaterial = { dispose: vi.fn() }
    const sharedMaterial = { dispose: vi.fn() }
    const nextGeometry = { dispose: vi.fn() }
    const nextMaterial = { dispose: vi.fn() }
    const oldMesh = { geometry: oldGeometry, material: [oldMaterial, sharedMaterial] }
    const nextMesh = {
      geometry: nextGeometry,
      material: [sharedMaterial, nextMaterial],
      clone: () => ({ geometry: nextGeometry, material: [sharedMaterial, nextMaterial] }),
      traverse(visit: (object: unknown) => void) { visit(this) },
    }
    const scene = new SceneFixture()
    const pickingScene = new SceneFixture()
    scene.add(oldMesh)
    pickingScene.add({ ...oldMesh })
    const oldTarget = new RenderTargetFixture()
    const engine: EngineHarness = {
      visualizer: { mesh: nextMesh }, scene, rtScene: pickingScene, renderTarget: oldTarget,
      camera: {}, viewportWidth: 640, viewportHeight: 360, _clearScene: engineMethod('_clearScene'),
    }
    const update = engineMethod('_updateVisualizer', {
      Scene: SceneFixture, WebGLRenderTarget: RenderTargetFixture, RGBAFormat: 1, UnsignedByteType: 1,
    })

    update.call(engine)
    expect(scene.children).toEqual([nextMesh])
    expect(oldGeometry.dispose).toHaveBeenCalledOnce()
    expect(oldMaterial.dispose).toHaveBeenCalledOnce()
    expect(oldTarget.dispose).toHaveBeenCalledOnce()
    expect(sharedMaterial.dispose).not.toHaveBeenCalled()
    expect(nextGeometry.dispose).not.toHaveBeenCalled()
    expect(nextMaterial.dispose).not.toHaveBeenCalled()
    // Updating the picking target again must not release still-active resources.
    update.call(engine)
    expect(nextGeometry.dispose).not.toHaveBeenCalled()
    expect(nextMaterial.dispose).not.toHaveBeenCalled()
    expect(sharedMaterial.dispose).not.toHaveBeenCalled()
  })

  it('unloads playing and paused audio sources and clears all stale audio state without pausing visuals', () => {
    const audio = { isPlaying: true, stop: vi.fn(), pause: vi.fn(), setBuffer: vi.fn() }
    const reversedAudio = { isPlaying: false, stop: vi.fn(), pause: vi.fn(), setBuffer: vi.fn() }
    const engine: EngineHarness = {
      audio, reversedAudio, audioAnalyser: {}, audioBuffer: {}, audioFile: {}, playbackTime: 22, isRunning: true,
    }
    const unload = engineMethod('unloadAudio')
    unload.call(engine)
    unload.call(engine)

    expect(audio.stop).toHaveBeenCalledOnce()
    expect(audio.pause).not.toHaveBeenCalled()
    expect(reversedAudio.pause).toHaveBeenCalledOnce()
    expect(reversedAudio.stop).not.toHaveBeenCalled()
    expect(audio.setBuffer).toHaveBeenCalledExactlyOnceWith(null)
    expect(reversedAudio.setBuffer).toHaveBeenCalledExactlyOnceWith(null)
    expect(engine).toMatchObject({ audio: null, reversedAudio: null, audioAnalyser: null, audioBuffer: null, audioFile: null, playbackTime: 0, isRunning: true })
    expect(engineMethod('isAudioLoaded').call(engine)).toBe(false)
  })

  it.each([false, true])('seeks paused audio without retaining accumulated progress (reversed=%s)', isReversed => {
    const audio = audioSourceFixture(false)
    const reversedAudio = audioSourceFixture(false)
    const engine = { audio, reversedAudio, isReversed, playbackTime: 4, getAudioDuration: engineMethod('getAudioDuration') }
    const seek = engineMethod('seek')
    const currentTime = engineMethod('getAudioTime')

    expect(seek.call(engine, 2)).toBe(true)
    expect(audio).toMatchObject({ offset: 2, _progress: 0, isPlaying: false })
    expect(reversedAudio).toMatchObject({ offset: 8, _progress: 0, isPlaying: false })
    expect(currentTime.call(engine)).toBe(2)
    expect(audio.play).not.toHaveBeenCalled()
    expect(reversedAudio.play).not.toHaveBeenCalled()
    expect(audio.stop).not.toHaveBeenCalled()
    expect(reversedAudio.stop).not.toHaveBeenCalled()

    expect(seek.call(engine, -5)).toBe(true)
    expect(currentTime.call(engine)).toBe(0)
    expect(seek.call(engine, 15)).toBe(true)
    expect(currentTime.call(engine)).toBe(10)
  })

  it.each([false, true])('resumes only the playing direction at the requested seek offset (reversed=%s)', isReversed => {
    const audio = audioSourceFixture(!isReversed)
    const reversedAudio = audioSourceFixture(isReversed)
    const engine = { audio, reversedAudio, isReversed, playbackTime: 4, getAudioDuration: engineMethod('getAudioDuration') }
    const active = isReversed ? reversedAudio : audio
    const inactive = isReversed ? audio : reversedAudio

    expect(engineMethod('seek').call(engine, 2)).toBe(true)
    expect(active.stop).toHaveBeenCalledOnce()
    expect(active.play).toHaveBeenCalledOnce()
    expect(active.startedOffsets).toEqual([isReversed ? 8 : 2])
    expect(inactive.stop).not.toHaveBeenCalled()
    expect(inactive.play).not.toHaveBeenCalled()
    expect(audio._progress).toBe(0)
    expect(reversedAudio._progress).toBe(0)
    expect(engineMethod('getAudioTime').call(engine)).toBe(2)

    active.context.currentTime += 0.5
    expect(engineMethod('getAudioTime').call(engine)).toBe(isReversed ? 1.5 : 2.5)
  })

  it('rejects non-finite seek positions without changing current playback', () => {
    const audio = audioSourceFixture(true)
    const reversedAudio = audioSourceFixture(false)
    const engine = { audio, reversedAudio, playbackTime: 4, getAudioDuration: engineMethod('getAudioDuration') }
    const seek = engineMethod('seek')

    for (const time of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(seek.call(engine, time)).toBe(false)
      expect(engine.playbackTime).toBe(4)
      expect(audio).toMatchObject({ offset: 1, _progress: 3, isPlaying: true })
      expect(reversedAudio).toMatchObject({ offset: 1, _progress: 3, isPlaying: false })
    }
    expect(audio.stop).not.toHaveBeenCalled()
    expect(audio.play).not.toHaveBeenCalled()
    expect(reversedAudio.stop).not.toHaveBeenCalled()
    expect(reversedAudio.play).not.toHaveBeenCalled()
  })

  it('clamps volume consistently for forward/reverse playback and invalid inputs', () => {
    const forwardVolume = vi.fn()
    const reverseVolume = vi.fn()
    const engine = { audio: { setVolume: forwardVolume }, reversedAudio: { setVolume: reverseVolume } }
    const setVolume = engineMethod('setAudioVolume')
    for (const [input, expected] of [[-2, 0], [0, 0], [0.42, 0.42], [8, 1], [Number.NaN, 1], [Number.POSITIVE_INFINITY, 1]]) {
      expect(setVolume.call(engine, input)).toBe(expected)
      expect(forwardVolume).toHaveBeenLastCalledWith(expected)
      expect(reverseVolume).toHaveBeenLastCalledWith(expected)
    }
    const getVolume = engineMethod('getAudioVolume')
    expect(getVolume.call({ audio: { getVolume: () => 0 } })).toBe(0)
    expect(getVolume.call({ reversedAudio: { getVolume: () => 0.42 } })).toBe(0.42)
    expect(getVolume.call({ audio: { getVolume: () => 8 } })).toBe(1)
    expect(getVolume.call({ audio: { getVolume: () => Number.NaN } })).toBe(1)
    expect(getVolume.call({})).toBe(1)
  })

  it('normalizes preview seeds and tempos and restarts the rhythm only when its configuration changes', () => {
    const engine = previewFixture()
    const configure = engineMethod('setSyntheticPreview')
    configure.call(engine, true)
    expect(engine).toMatchObject({ syntheticPreviewEnabled: true, syntheticPreviewSeed: 0, syntheticPreviewTempoScale: 1, syntheticPreviewTime: 0 })
    configure.call(engine, true, 73.9, 0.5)
    engine.syntheticPreviewTime = 3
    configure.call(engine, true, 73.1, 0.5)
    expect(engine.syntheticPreviewTime).toBe(3)
    configure.call(engine, true, 74, 0.5)
    expect(engine.syntheticPreviewTime).toBe(0)
    engine.syntheticPreviewTime = 3
    configure.call(engine, true, 74, 1)
    expect(engine.syntheticPreviewTime).toBe(0)
    configure.call(engine, true, -1)
    expect(engine.syntheticPreviewSeed).toBe(4_294_967_295)
    for (const [input, expected] of [[0.01, 0.25], [20, 2], [0, 1], [-1, 1], [Number.NaN, 1], [Number.POSITIVE_INFINITY, 1]]) {
      configure.call(engine, true, Number.NaN, input)
      expect(engine.syntheticPreviewSeed).toBe(0)
      expect(engine.syntheticPreviewTempoScale).toBe(expected)
    }
    engine.syntheticPreviewTime = 3
    configure.call(engine, false)
    expect(engine).toMatchObject({ syntheticPreviewEnabled: false, syntheticPreviewTime: 0 })
  })

  it('produces deterministic silent-preview motion, honors tempo, and gives real audio priority', () => {
    const advance = audioFrame()
    const configure = engineMethod('setSyntheticPreview')
    const sample = (seed: number) => {
      const engine = previewFixture()
      configure.call(engine, true, seed, 0.5)
      const sizes: number[] = []
      for (let frame = 0; frame < 30; frame++) {
        advance.call(engine, 1 / 30)
        sizes.push((engine.state as { size: number }).size)
      }
      expect(engine.syntheticPreviewTime).toBeCloseTo(0.5)
      expect(sizes.every(Number.isFinite)).toBe(true)
      expect(new Set(sizes).size).toBeGreaterThan(1)
      return sizes
    }
    expect(sample(73)).toEqual(sample(73))
    expect(sample(73)).not.toEqual(sample(74))

    const playing = previewFixture()
    const noPreview = previewFixture()
    configure.call(playing, true, 73)
    const getFrequencyData = vi.fn(() => new Uint8Array([0, 0, 220, 0, 100]))
    for (const engine of [playing, noPreview]) {
      engine.audio = { isPlaying: true }
      engine.audioAnalyser = { getFrequencyData }
      advance.call(engine, 1 / 60)
    }
    expect(getFrequencyData).toHaveBeenCalledTimes(2)
    expect(playing.state).toEqual(noPreview.state)
    expect(playing.syntheticPreviewTime).toBe(0)
  })

  it('passes explicit density through initialization and bounds it without changing the default device density', () => {
    const constructorStart = engineClassSource.indexOf('\n\tconstructor(')
    const densityAssignment = engineClassSource.slice(constructorStart).match(/this\.#pixelRatio\s*=\s*[^;]+;/)?.[0]
    if (!densityAssignment) throw new Error('The MAGE pixel-density constructor contract is missing.')
    const normalize = new Function('pixelRatio', `${densityAssignment.replaceAll('this.#', 'this.')}; return this.pixelRatio;`) as EngineMethod
    for (const [input, expected] of [[undefined, null], [0, null], [-1, null], [Number.NaN, null], [Number.POSITIVE_INFINITY, null], [0.5, 1], [2, 2], [5, 3]]) {
      expect(normalize.call({}, input)).toBe(expected)
    }

    const initStart = engineSource.indexOf('function initMAGE(')
    const initEnd = engineSource.indexOf('\nfunction previewMAGE(', initStart)
    if (initStart < 0 || initEnd <= initStart) throw new Error('Could not locate the real initMAGE implementation.')
    class ConfigReceiver {
      readonly config: MAGEConfig
      constructor(config: MAGEConfig) { this.config = config }
    }
    const init = new Function('MAGEEngine', `${engineSource.slice(initStart, initEnd)}; return initMAGE;`)(ConfigReceiver) as (config: Partial<MAGEConfig>) => ConfigReceiver
    expect(init({ pixelRatio: 2 }).config.pixelRatio).toBe(2)

    const renderer = { setSize: vi.fn(), setPixelRatio: vi.fn(), setClearColor: vi.fn() }
    class Renderer { constructor() { return renderer } }
    const createRenderer = engineMethod('_createRenderer', { WebGLRenderer: Renderer, Color: class {}, SRGBColorSpace: 'srgb', window: { devicePixelRatio: 1.5 } })
    for (const [pixelRatio, lowQuality, expected] of [[2, false, 2], [null, false, 1.5], [null, true, 0.1], [2, true, 2]]) {
      createRenderer.call({ pixelRatio, isLowQualityMode: lowQuality, _getViewportSize: () => ({ width: 640, height: 360 }), fx: { toneMapping: { exposure: 1 } } })
      expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(expected)
    }
  })

  it('compiles saved-scene ShaderPark helpers through the real embedded compiler', () => {
    const start = engineSource.indexOf('var require_shader_park_core_umd =')
    const end = engineSource.indexOf('\n//#endregion', start)
    if (start < 0 || end <= start) throw new Error('Could not locate MAGE’s embedded ShaderPark compiler.')
    type CommonModule = { exports: Record<string, unknown> }
    const commonJS = (factory: (exports: CommonModule['exports'], module: CommonModule) => void) => () => {
      const module: CommonModule = { exports: {} }
      factory(module.exports, module)
      return module.exports
    }
    const compiler = new Function('__commonJSMin', 'console', `${engineSource.slice(start, end)}; return require_shader_park_core_umd();`)(commonJS, { log: vi.fn(), warn: vi.fn(), error: vi.fn() }) as {
      sculptToGLSL: (source: string) => { error?: unknown; stepSizeConstant: number; geoGLSL: string; colorGLSL: string }
    }
    const previousTorus = Reflect.get(globalThis, 'torus')
    const result = compiler.sculptToGLSL('setStepSize(0.58); torus(0.7, 0.04); reset(); cylinder(0.1, 0.6);')
    expect(result.error).toBeUndefined()
    expect(result.stepSizeConstant).toBe(0.58)
    expect(result.geoGLSL).toContain('surfaceDistance')
    expect(result.geoGLSL).toContain('= torus(')
    expect(result.geoGLSL).toContain('= cylinder(')
    expect(result.colorGLSL.length).toBeGreaterThan(0)
    expect(Reflect.get(globalThis, 'torus')).toBe(previousTorus)
  })
})

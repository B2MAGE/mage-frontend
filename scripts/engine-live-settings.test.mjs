import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LIVE_EFFECT_PASSES, normalizeLiveSettings, validateLiveEffectBudget } from '../node_modules/@notrac/mage/dist/live-settings.js'

const source = readFileSync(new URL('../node_modules/@notrac/mage/dist/mage-engine.js', import.meta.url), 'utf8')
function method(name, region = 'var MAGEEngine =') {
  const start = source.indexOf(`\n\t${name}(`, source.indexOf(region))
  const end = source.indexOf('\n\t}', start)
  assert(start >= 0 && end > start, `Installed engine must contain ${name}`)
  return new Function('normalizeLiveSettings', 'validateLiveEffectBudget', 'DEFAULT_PASS_ORDER', 'Vector3',
    `return function ${source.slice(start + 2, end + 3).replace(/^#/, '').replaceAll('this.#', 'this.')}`,
  )(normalizeLiveSettings, validateLiveEffectBudget, [...Object.values(LIVE_EFFECT_PASSES), 'bloom', 'copyShader'], class Vector3 {})
}
const update = method('updateSettings')
const vector = (x, y, z) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c } })
function fixture(running = true) {
  const calls = { frames: [], renders: 0, resets: 0, sizes: 0, projection: 0, lookAt: 0, graphRebuilds: 0 }
  const names = [...Object.values(LIVE_EFFECT_PASSES), 'bloom', 'copyShader']
  const effects = Object.fromEntries(names.map(name => [name, {
    enabled: name === 'outputPass', shader: {
      setSize(width, height) { assert.equal(width, 640); assert.equal(height, 360); calls.sizes++ },
      uniforms: Object.fromEntries(['amount', 'angle', 'damp', 'sides', 'color'].map(key => [key, { value: 0 }])),
    },
  }]))
  effects.bloom.settings = { strength: 1, radius: .2, threshold: .1 }
  effects.colorifyShader.color = { value: '#ffffff', set(value) { this.value = value } }
  effects.colorifyShader.update = function() { this.shader.uniforms.color.value = this.color }
  effects.toneMapping = { method: 0, exposure: 1.5 }
  effects.passOrder = names
  effects.getPassOrder = function() { return [...this.passOrder] }
  effects.setPassOrder = method('setPassOrder', 'var MAGEEffects =')
  effects.applyPostProcessing = () => { calls.graphRebuilds++; throw new Error('Must not rebuild effects') }
  const renderPass = { scene: 'unchanged' }
  const engine = {
    isDisposed: false, isRunning: running, fx: effects,
    state: { time: 42, time_multiplier: 1, camTilt: 0, easing_speed: .6,
      volume_multiplier: .2, size: .7, pointerDown: .3, currAudio: .8, camOrientationMode: 0 },
    controls: { position0: vector(0, 0, 5.5), target0: vector(0, 0, 0), target: vector(1, 2, 3),
      zoom0: 1, autoRotate: true, autoRotateSpeed: .2, reset() { calls.resets++ } },
    camera: { position: vector(10, 20, 30), up: vector(0, 1, 0), zoom: 2, fov: 75,
      updateProjectionMatrix() { calls.projection++ }, lookAt() { calls.lookAt++ }, updateMatrixWorld() {} },
    visualizer: { scale: 10, mesh: {}, compiledArtifact: {} },
    renderer: { toneMapping: 0, toneMappingExposure: 1.5, domElement: { width: 640, height: 360 }, render() { calls.renders++ } },
    scene: {}, composer: { passes: [renderPass, effects.outputPass.shader], _width: 640, _height: 360, _pixelRatio: 1,
      render(delta) { assert.equal(delta, 0); calls.renders++ } },
    externalClock: { time: 42, rate: 1, playing: running }, externalAudio: { audioTime: 27 },
    syntheticPreviewTime: 17, audio: { isPlaying: running }, animationFrameId: running ? 25 : null,
    renderLifecycleListeners: new Set([event => calls.frames.push(event.type)]),
    _notifyRenderLifecycle: method('#_notifyRenderLifecycle'),
  }
  for (const name of ['#_applyCompactIntent', '#_applyCompactFx', '#_applyStatePatch', '#_setCameraUpFromTilt', '#_syncSobelResolution']) {
    engine[name.slice(1)] = method(name)
  }
  return { engine, calls, effects, renderPass }
}

test('live settings strictly clone finite allowed data without evaluating accessors', () => {
  const patch = { controls: { position0: { x: 4 } }, fx: { passOrder: ['bloom', 'outputPass'] } }
  const copy = normalizeLiveSettings(patch)
  assert.deepEqual(copy, patch)
  assert.notEqual(copy.controls.position0, patch.controls.position0)
  let getters = 0
  const accessor = { get scale() { getters++; return 10 } }
  const invalid = [null, [], { shader: 'sphere(1)' }, { visualizer: { shader: 'sphere(1)' } },
    { visualizer: { skyboxPreset: 1 } }, { state: { time: 2 } }, { audioResponse: 'legacy' },
    { intent: { time_multiplier: Infinity } }, { intent: { camOrientationMode: 1.5 } },
    { intent: { fov: 180 } }, { controls: { target0: { x: -1001 } } },
    { fx: { toneMapping: { method: 5 } } }, { fx: { params: { colorify: { color: 'red' } } } },
    { fx: { passOrder: ['bloom', 'bloom'] } }, { fx: { passOrder: Array(17).fill('bloom') } },
    { fx: { passOrder: [, 'bloom'] } }, { visualizer: accessor }, Object.create({ intent: {} }),
    JSON.parse('{"intent":{"__proto__":{}}}'), { [Symbol('hidden')]: 1 },
  ]
  for (const value of invalid) assert.throws(() => normalizeLiveSettings(value), TypeError)
  assert.equal(getters, 0)
  assert.deepEqual(normalizeLiveSettings({ intent: {}, fx: { params: {} } }), {})
})

test('merged optional-effect budget rejects the entire update before any state changes', () => {
  const { engine, effects } = fixture()
  for (const flag of ['rgbShift', 'dot', 'technicolor', 'luminosity']) effects[LIVE_EFFECT_PASSES[flag]].enabled = true
  assert.throws(() => update.call(engine, { intent: { time_multiplier: 3 }, fx: { bloom: { enabled: true } } }), /effect limit/)
  assert.equal(engine.state.time_multiplier, 1)
  assert.equal(effects.bloom.enabled, false)
  assert.throws(() => update.call(engine, { visualizer: { scale: 20 }, fx: { params: { rgbShift: { amount: .2 } } } }), TypeError)
  assert.equal(engine.visualizer.scale, 10)
  assert.equal(update.call(engine, { fx: { bloom: { enabled: true }, passes: { dot: false } } }), true)
  assert.equal(effects.bloom.enabled, true)
  assert.equal(effects.dotShader.enabled, false)
})

test('appearance, motion and effects changes preserve playback, orbit, mesh and resources', () => {
  const { engine, calls, effects } = fixture()
  const retained = { mesh: engine.visualizer.mesh, artifact: engine.visualizer.compiledArtifact, composer: engine.composer,
    audio: engine.audio, clock: engine.externalClock, externalAudio: engine.externalAudio }
  assert.equal(update.call(engine, { visualizer: { scale: 20 }, intent: { time_multiplier: .5, easing_speed: .8 },
    state: { volume_multiplier: .6 }, fx: { bloom: { strength: 2, radius: .5, threshold: .7 },
      toneMapping: { method: 4, exposure: .9 }, params: { rgbShift: { amount: .02 }, afterImage: { damp: .7 },
        colorify: { color: '#12ab34' }, kaleid: { sides: 12, angle: 1 } } } }), true)
  assert.equal(engine.visualizer.scale, 20)
  assert.equal(engine.state.time_multiplier, .5)
  assert.equal(engine.state.time, 42)
  assert.equal(engine.state.size, .7)
  assert.equal(engine.state.pointerDown, .3)
  assert.equal(engine.state.currAudio, .8)
  assert.equal(engine.syntheticPreviewTime, 17)
  assert.equal(engine.animationFrameId, 25)
  assert.equal(engine.camera.position.x, 10)
  assert.equal(engine.camera.zoom, 2)
  assert.equal(engine.controls.target.x, 1)
  assert.equal(effects.bloom.shader.strength, 2)
  assert.equal(effects.bloom.shader.radius, .5)
  assert.equal(effects.bloom.shader.threshold, .7)
  assert.equal(effects.colorifyShader.shader.uniforms.color.value.value, '#12ab34')
  assert.equal(engine.renderer.toneMappingExposure, .9)
  assert.equal(effects.toneMapping.exposure, .9)
  assert.equal(engine.visualizer.mesh, retained.mesh)
  assert.equal(engine.visualizer.compiledArtifact, retained.artifact)
  assert.equal(engine.composer, retained.composer)
  assert.equal(engine.audio, retained.audio)
  assert.equal(engine.externalClock, retained.clock)
  assert.equal(engine.externalAudio, retained.externalAudio)
  assert.deepEqual(calls, { frames: [], renders: 0, resets: 0, sizes: 0, projection: 0, lookAt: 0, graphRebuilds: 0 })
})

test('camera updates change only the requested components without resetting orbit', () => {
  const { engine, calls } = fixture()
  update.call(engine, { controls: { position0: { y: 7 } }, intent: { fov: 60 } })
  assert.deepEqual([engine.camera.position.x, engine.camera.position.y, engine.camera.position.z], [10, 7, 30])
  assert.deepEqual([engine.controls.position0.x, engine.controls.position0.y, engine.controls.position0.z], [0, 7, 5.5])
  assert.equal(engine.controls.target.x, 1)
  assert.equal(engine.camera.zoom, 2)
  assert.equal(engine.camera.fov, 60)
  assert.equal(calls.resets, 0)
  update.call(engine, { controls: { target0: { z: 8 }, zoom0: 3 }, intent: { autoRotate: false, autoRotateSpeed: -.3, camTilt: .5 } })
  assert.equal(engine.controls.target.x, 1)
  assert.equal(engine.controls.target.z, 8)
  assert.equal(engine.camera.zoom, 3)
  assert.equal(engine.controls.autoRotate, false)
  assert.equal(engine.controls.autoRotateSpeed, -.3)
  assert.equal(engine.camera.up.x, Math.sin(.5))
  assert.equal(engine.state.time, 42)
})

test('many effect edits reuse the composer, render pass and effect instances', () => {
  const { engine, calls, effects, renderPass } = fixture()
  const composer = engine.composer
  const bloom = effects.bloom.shader
  const afterImage = effects.afterImagePass.shader
  update.call(engine, { fx: { bloom: { enabled: true }, passes: { afterImage: true } } })
  const sizes = calls.sizes
  for (let index = 0; index < 500; index++) {
    update.call(engine, { fx: { bloom: { strength: index / 100 }, params: { afterImage: { damp: index / 500 } } } })
  }
  assert.equal(calls.sizes, sizes)
  update.call(engine, { fx: { passOrder: ['afterImagePass', 'bloom', 'outputPass'] } })
  assert.deepEqual(engine.composer.passes, [renderPass, afterImage, bloom, effects.outputPass.shader])
  update.call(engine, { fx: { passes: { afterImage: false } } })
  assert(!engine.composer.passes.includes(afterImage))
  update.call(engine, { fx: { passes: { afterImage: true } } })
  assert(engine.composer.passes.includes(afterImage))
  assert.equal(engine.composer, composer)
  assert.equal(effects.bloom.shader, bloom)
  assert.equal(effects.afterImagePass.shader, afterImage)
  assert.equal(calls.graphRebuilds, 0)
})

test('paused changes draw once without advancing any playback state or resuming', () => {
  const { engine, calls } = fixture(false)
  update.call(engine, { intent: { fov: 50 } })
  assert.equal(calls.renders, 1)
  assert.deepEqual(calls.frames, ['frame'])
  assert.equal(engine.state.time, 42)
  assert.equal(engine.syntheticPreviewTime, 17)
  assert.equal(engine.isRunning, false)
  assert.equal(engine.audio.isPlaying, false)
  assert.equal(engine.animationFrameId, null)
  update.call(engine, {})
  assert.equal(calls.renders, 1)
  engine.isDisposed = true
  assert.equal(update.call(engine, { visualizer: { scale: 20 } }), false)
  assert.equal(engine.visualizer.scale, 10)
  assert.equal(calls.renders, 1)
})

test('paused redraw failures report the render lifecycle and propagate for recovery', () => {
  const { engine, calls } = fixture(false)
  engine.composer.render = () => { throw new Error('GPU failure') }
  assert.throws(() => update.call(engine, { visualizer: { scale: 20 } }), /GPU failure/)
  assert.deepEqual(calls.frames, ['error'])
  assert.equal(engine.isRunning, false)
})

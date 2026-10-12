import { describe, expect, it } from 'vitest'
import { createBuilderBindingController } from '../../isolated-renderer/builderBindings'
import type { PlaybackPayloads } from '../player/isolation/playbackProtocol'
import { compileBuilderPreviewDocument } from '../player/templates/builderCompiler'
import { builderUniformValues } from '../player/templates/builderUniformValues'
import { createBuilderScene } from './builderEditor'
import { createDriverPresetExpression, defaultDriverPreset, type DriverPreset, type DriverPresetValues } from './builderDrivers'

type Pointer = PlaybackPayloads['input']['pointer']
const center: Pointer = { x: 0, y: 0, down: false, inside: true }

/** Send real renderer pointer snapshots through smoothing and the compiled preset. */
function pointerDriver(preset: DriverPreset, changes: Partial<DriverPresetValues>) {
  const scene = createBuilderScene()
  const { driver, values } = defaultDriverPreset(scene.objects[0], preset)
  scene.objects[0].drivers = [{ ...driver, expression: createDriverPresetExpression({ ...values, ...changes }) }]
  const compiled = compileBuilderPreviewDocument(scene)
  const declarations = compiled.shader.match(/\blet builder_(?:driver|value)_o0_0_\d+=[^;]*;/g)
  expect(declarations).toHaveLength(2)
  // Evaluate only validated scalar declarations emitted by our trusted compiler.
  const evaluate = new Function('time', 'min', 'max', 'sin', 'cos', 'floor', ...compiled.uniforms.map(uniform => uniform.name),
    `${declarations!.join('')}return { influence: builder_driver_o0_0_0, property: builder_value_o0_0_0 };`,
  ) as (...args: unknown[]) => { influence: number; property: number }
  let now = 1, uniformValues: readonly number[] = []
  const controller = createBuilderBindingController(compiled.uniforms, compiled.bindings,
    builderUniformValues(compiled.uniforms), next => { uniformValues = next }, () => now)
  const read = () => evaluate(now, Math.min, Math.max, Math.sin, Math.cos, Math.floor, ...uniformValues)
  return {
    controller,
    read,
    hold(pointer: Partial<Pointer>, frames = 120) {
      for (let index = 0; index < frames; index++) {
        now += 1 / 60
        controller.input({ time: now, pointer: { ...center, ...pointer }, audio: {
          audioTime: 0, loaded: false, playing: false, legacyAmplitude: 0, frame: null,
        } })
      }
      return read()
    },
  }
}

function sample(preset: DriverPreset, changes: Partial<DriverPresetValues>, pointer: Partial<Pointer>) {
  const fixture = pointerDriver(preset, changes)
  try { return fixture.hold(pointer) } finally { fixture.controller.dispose() }
}

describe('Builder pointer animation inputs', () => {
  it.each(['x', 'y'] as const)('keeps the default Pulse centered and symmetric on pointer %s', axis => {
    const changes = { source: `pointer-${axis}`, amount: 0.5 }
    const rest = sample('pulse', changes, {})
    const negative = sample('pulse', changes, { [axis]: -1 })
    const positive = sample('pulse', changes, { [axis]: 1 })
    expect(rest).toEqual({ influence: 0.5, property: 1.5 })
    expect(positive.influence).toBeCloseTo(0.3850755765)
    expect(negative).toEqual(positive)
    expect(positive.property).toBeLessThan(rest.property)
    // Amount scales the whole wave, including its maximum at the center.
    expect(sample('pulse', { ...changes, amount: 1 }, {}).property).toBe(2)
  })

  it.each(['x', 'y'] as const)('keeps Follow input directional across pointer %s without changing its center baseline', axis => {
    const changes = { source: `pointer-${axis}`, amount: 0.5, offset: 0.2 }
    expect(sample('follow', changes, { [axis]: -1 }).property).toBeCloseTo(0.7)
    expect(sample('follow', changes, {}).property).toBeCloseTo(1.2)
    expect(sample('follow', changes, { [axis]: 1 }).property).toBeCloseTo(1.7)
    expect(sample('follow', { ...changes, amount: 3 }, {}).property).toBeCloseTo(1.2)
    expect(sample('follow', { ...changes, amount: -0.5 }, { [axis]: 1 }).property).toBeCloseTo(0.7)
  })

  it('follows pointer press directly and keeps Pulse press as a wave sample', () => {
    const changes = { source: 'pointer-down', amount: 0.6, offset: 0.1 }
    expect(sample('follow', changes, { down: false }).property).toBeCloseTo(1.1)
    expect(sample('follow', changes, { down: true }).property).toBeCloseTo(1.7)
    const rest = sample('pulse', changes, { down: false })
    const pressed = sample('pulse', changes, { down: true })
    expect(rest.property).toBeCloseTo(1.7)
    expect(pressed.property).toBeCloseTo(1.5620906918)
  })

  it('makes Wobble directional around the center and changes its spatial frequency independently of time', () => {
    const changes = { source: 'pointer-y', amount: 0.5 }
    expect(sample('wobble', changes, {}).influence).toBe(0)
    expect(sample('wobble', changes, { y: 1 }).influence).toBeCloseTo(0.4207354924)
    expect(sample('wobble', changes, { y: -1 }).influence).toBeCloseTo(-0.4207354924)
    expect(sample('wobble', { ...changes, speed: Math.PI / 2 }, { y: 1 }).influence).toBeCloseTo(0.5)
    expect(sample('wobble', { ...changes, speed: Math.PI }, { y: 1 }).influence).toBeCloseTo(0)
  })

  it('returns the signed pointer signal to neutral on leaving and clears it on pause', () => {
    const fixture = pointerDriver('follow', { source: 'pointer-y', amount: 0.5 })
    try {
      expect(fixture.hold({ y: 1 }).property).toBeCloseTo(1.5)
      expect(fixture.hold({ y: 1, inside: false }).property).toBeCloseTo(1, 3)
      expect(fixture.hold({ y: -1 }).property).toBeCloseTo(0.5, 3)
      fixture.controller.playback(false)
      expect(fixture.read().property).toBe(1)
      fixture.controller.playback(true)
      expect(fixture.read().property).toBe(1)
    } finally { fixture.controller.dispose() }
  })
})

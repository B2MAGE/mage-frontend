import { describe, expect, it } from 'vitest'
import { parseSceneDocument, resolveSceneForPlayback, scenePlaybackIdentity, type BuilderDriver, type BuilderDriverSource } from '@modules/player'
import { createBuilderScene } from './builderEditor'
import { createDriverPresetExpression, defaultDriverPreset, DRIVER_INFLUENCE_RANGE, readDriverPreset,
  type DriverPreset, type DriverPresetValues } from './builderDrivers'

function presetDriver(preset: DriverPreset, changes: Partial<DriverPresetValues> = {}): BuilderDriver {
  const { driver, values } = defaultDriverPreset(createBuilderScene().objects[0], preset)
  return { ...driver, expression: createDriverPresetExpression({ ...values, ...changes }) }
}

/** Sample the real compiler's scalar declarations, rather than reimplementing preset math. */
function sampler(driver: BuilderDriver) {
  const scene = createBuilderScene()
  scene.objects[0].drivers = [driver]
  const compiled = resolveSceneForPlayback(scene).builderCompilation!
  const declarations = compiled.shader.match(/\blet builder_(?:driver|value)_o0_0_\d+=[^;]*;/g)
  expect(declarations).toHaveLength(2)
  // The source is generated solely from a validated Builder document and trusted compiler.
  const run = new Function('time', 'min', 'max', 'sin', 'cos', 'floor', ...compiled.uniforms.map(uniform => uniform.name),
    `${declarations!.join('')}return { influence: builder_driver_o0_0_0, property: builder_value_o0_0_0 };`,
  ) as (...values: unknown[]) => { influence: number; property: number }
  return (time: number, signals: Partial<Record<BuilderDriverSource, number>> = {}) => run(
    time, Math.min, Math.max, Math.sin, Math.cos, Math.floor,
    ...compiled.uniforms.map(uniform => uniform.target === 'driver-signal' ? signals[uniform.source] ?? 0 : uniform.initialValue),
  )
}

describe('Builder animation influence range', () => {
  it('keeps a large time-driven Pulse moving throughout its full authored range', () => {
    const driver = presetDriver('pulse', { amount: 5.55 })
    expect(readDriverPreset(driver.expression)).toMatchObject(DRIVER_INFLUENCE_RANGE)
    const sample = sampler(driver)
    for (const [time, influence] of [[0, 5.55], [Math.PI / 2, 2.775], [Math.PI, 0]]) {
      expect(sample(time).influence).toBeCloseTo(influence)
      expect(sample(time).property).toBeCloseTo(1 + influence)
    }
  })

  it('lets Bass hits vary a large Pulse instead of flattening every input to one', () => {
    const sample = sampler(presetDriver('pulse', { source: 'bass-hit', amount: 5.55 }))
    const quiet = sample(0, { 'bass-hit': 0 }).influence
    const partial = sample(0, { 'bass-hit': .5 }).influence
    const peak = sample(0, { 'bass-hit': 1 }).influence
    expect(quiet).toBeCloseTo(5.55)
    expect(partial).toBeCloseTo(2.775 * (1 + Math.cos(.5)))
    expect(peak).toBeCloseTo(2.775 * (1 + Math.cos(1)))
    expect(quiet).toBeGreaterThan(partial)
    expect(partial).toBeGreaterThan(peak)
  })

  it('retains the full Wobble amplitude beyond the previous full-turn influence cap', () => {
    const sample = sampler(presetDriver('wobble', { amount: 8 }))
    expect(sample(0).influence).toBeCloseTo(0)
    expect(sample(Math.PI / 2).influence).toBeCloseTo(8)
    expect(sample(3 * Math.PI / 2).influence).toBeCloseTo(-8)
    expect(sample(Math.PI / 2).property).toBeCloseTo(8 - Math.PI * 2)
    expect(sample(3 * Math.PI / 2).property).toBeCloseTo(-8 + Math.PI * 2)
  })

  it('preserves negative Pulse amounts and offsets while keeping final scale positive', () => {
    const reversed = sampler(presetDriver('pulse', { amount: -8, offset: 2 }))
    expect(reversed(0)).toEqual({ influence: -6, property: .01 })
    expect(reversed(Math.PI).influence).toBeCloseTo(2)
    expect(reversed(Math.PI).property).toBeCloseTo(3)

    const shifted = sampler(presetDriver('pulse', { amount: 8.3, offset: -2.15 }))
    expect(shifted(0).influence).toBeCloseTo(6.15)
    expect(shifted(0).property).toBeCloseTo(7.15)
    expect(shifted(Math.PI).influence).toBeCloseTo(-2.15)
    expect(shifted(Math.PI).property).toBe(.01)
    expect(shifted(2 * Math.PI).property).toBeCloseTo(7.15)
  })

  it('preserves signed Wobble amount and an offset without flattening either extreme', () => {
    const sample = sampler(presetDriver('wobble', { amount: -8, offset: -2.15 }))
    expect(sample(Math.PI / 2).influence).toBeCloseTo(-10.15)
    expect(sample(3 * Math.PI / 2).influence).toBeCloseTo(5.85)
  })

  it('keeps Follow input proportional across music levels and both pointer directions', () => {
    const music = sampler(presetDriver('follow', { source: 'mid-level', amount: 5.65 }))
    for (const input of [0, .1, .5, 1]) {
      expect(music(0, { 'mid-level': input }).influence).toBeCloseTo(input * 5.65)
    }
    const pointer = sampler(presetDriver('follow', { source: 'pointer-x', amount: -6, offset: .1 }))
    expect(pointer(0, { 'pointer-x': -1 }).influence).toBeCloseTo(6.1)
    expect(pointer(0, { 'pointer-x': 0 }).influence).toBeCloseTo(.1)
    expect(pointer(0, { 'pointer-x': 1 }).influence).toBeCloseTo(-5.9)
  })

  it('continues honoring an explicitly authored clamp after amplitude and offset changes', () => {
    const driver = presetDriver('pulse', { amount: 8, offset: -2, minimum: .2, maximum: .5 })
    expect(readDriverPreset(driver.expression)).toMatchObject({ amount: 8, offset: -2, minimum: .2, maximum: .5 })
    const sample = sampler(driver)
    expect(sample(0).influence).toBe(.5)
    expect(sample(Math.PI).influence).toBe(.2)
  })

  it('updates Amount and Full/Custom limits through live values without changing the player load identity', () => {
    const scene = createBuilderScene()
    scene.objects[0].drivers = [presetDriver('pulse', { source: 'bass-hit', amount: 5.55 })]
    let values = readDriverPreset(scene.objects[0].drivers[0].expression)!
    const identity = scenePlaybackIdentity(scene)
    expect(identity).not.toBeNull()
    let uniforms = resolveSceneForPlayback(scene).builderCompilation!.uniforms
    for (const change of [{ amount: 8.3, offset: -2.15 }, { minimum: -1, maximum: 1 }, DRIVER_INFLUENCE_RANGE]) {
      values = { ...values, ...change }
      scene.objects[0].drivers[0].expression = createDriverPresetExpression(values)
      expect(scenePlaybackIdentity(scene)).toBe(identity)
      const next = resolveSceneForPlayback(scene).builderCompilation!.uniforms
      expect(next).not.toEqual(uniforms)
      expect(next.map(uniform => ({ ...uniform, initialValue: 0 })))
        .toEqual(uniforms.map(uniform => ({ ...uniform, initialValue: 0 })))
      uniforms = next
    }
  })

  it('retains Full motion and its music response after saving and restoring a scene document', () => {
    const scene = createBuilderScene()
    scene.objects[0].drivers = [presetDriver('pulse', { source: 'bass-hit', amount: 5.55 })]
    const restored = parseSceneDocument(JSON.parse(JSON.stringify(scene)))
    expect(restored.kind).toBe('builder')
    if (restored.kind !== 'builder') throw new Error('Expected a restored Builder scene')
    const restoredDriver = restored.objects[0].drivers![0]
    expect(readDriverPreset(restoredDriver.expression)).toMatchObject({ source: 'bass-hit', amount: 5.55, ...DRIVER_INFLUENCE_RANGE })
    const sample = sampler(restoredDriver)
    expect(sample(0, { 'bass-hit': 0 }).influence).toBeCloseTo(5.55)
    expect(sample(0, { 'bass-hit': 1 }).influence).toBeCloseTo(2.775 * (1 + Math.cos(1)))
  })

  it('keeps Spin un-clamped and wraps its final rotation through repeated turns', () => {
    const driver = presetDriver('spin', { speed: -.4, phase: .3 })
    expect(driver.expression.type).not.toBe('clamp')
    const sample = sampler(driver)
    expect(sample(0)).toEqual({ influence: .3, property: .3 })
    expect(sample(10).influence).toBeCloseTo(-3.7)
    expect(sample(10).property).toBeCloseTo(-3.7 + Math.PI * 2)
    expect(sample(10 + 10 * Math.PI / .4).property).toBeCloseTo(sample(10).property)
  })
})

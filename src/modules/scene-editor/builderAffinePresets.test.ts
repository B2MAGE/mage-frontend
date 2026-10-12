import { describe, expect, it } from 'vitest'
import { resolveSceneForPlayback, validateBuilderDriverExpression, type BuilderDriverExpression } from '@modules/player'
import { createBuilderScene } from './builderEditor'
import { createDriverPresetExpression, DRIVER_INFLUENCE_RANGE, readDriverPreset } from './builderDrivers'
import { createBuilderRecipe } from './builderRecipes'

type Expression = BuilderDriverExpression
const constant = (value: number): Expression => ({ type: 'constant', value })
const input = (source: Extract<Expression, { type: 'input' }>['source']): Expression => ({ type: 'input', source })
const add = (left: Expression, right: Expression): Expression => ({ type: 'add', left, right })
const multiply = (left: Expression, right: Expression): Expression => ({ type: 'multiply', left, right })
const component = (source: 'scene-pointer' | 'view-ray', axis: 'x' | 'y' | 'z'): Expression => ({ type: 'component', input: input(source), axis })

/** Sample the actual trusted compiler so a missing clamp cannot quietly change rotation. */
function sample(expression: Expression, time: number) {
  const scene = createBuilderScene()
  scene.objects[0].drivers = [{ target: 'rotation.x', mode: 'add', expression }]
  const compiled = resolveSceneForPlayback(scene).builderCompilation!
  const declarations = compiled.shader.match(/\blet builder_(?:driver|value)_o0_0_\d+=[^;]*;/g)
  expect(declarations).toHaveLength(2)
  const evaluate = new Function('time', 'min', 'max', 'floor', ...compiled.uniforms.map(uniform => uniform.name),
    `${declarations!.join('')}return { influence: builder_driver_o0_0_0, property: builder_value_o0_0_0 };`,
  ) as (...args: unknown[]) => { influence: number; property: number }
  return evaluate(time, Math.min, Math.max, Math.floor, ...compiled.uniforms.map(uniform => uniform.initialValue))
}

describe('simple imported Builder inputs', () => {
  it.each([
    { expression: input('scene-size'), source: 'scene-size', amount: 1, offset: 0 },
    { expression: multiply(input('scene-size'), constant(1 / .6)), source: 'scene-size', amount: 1 / .6, offset: 0 },
    { expression: multiply(constant(-2), input('pointer-y')), source: 'pointer-y', amount: -2, offset: 0 },
    { expression: add(input('bass-level'), constant(.3)), source: 'bass-level', amount: 1, offset: .3 },
    { expression: add(constant(.3), input('bass-level')), source: 'bass-level', amount: 1, offset: .3 },
    { expression: add(multiply(input('scene-size'), constant(2)), constant(-.4)), source: 'scene-size', amount: 2, offset: -.4 },
    { expression: add(constant(-.4), multiply(constant(2), input('scene-size'))), source: 'scene-size', amount: 2, offset: -.4 },
    { expression: component('view-ray', 'z'), source: 'view-ray.z', amount: 1, offset: 0 },
    { expression: multiply(component('scene-pointer', 'x'), constant(2)), source: 'scene-pointer.x', amount: 2, offset: 0 },
  ])('recognizes $source with amount $amount and offset $offset without altering the expression', ({ expression, ...expected }) => {
    const before = structuredClone(expression)
    const controls = readDriverPreset(expression)
    expect(controls).toMatchObject({ preset: 'follow', ...expected, ...DRIVER_INFLUENCE_RANGE, unclamped: true })
    expect(expression).toEqual(before)
    expect(validateBuilderDriverExpression(createDriverPresetExpression(controls!)).type).toBe('scalar')
    expect(readDriverPreset(createDriverPresetExpression(controls!))).toEqual(controls)
  })

  it('exposes template metalness and simple dimension response as Follow input without replacing their formulas', () => {
    const recipe = createBuilderRecipe('embedded-scene-5')
    const before = structuredClone(recipe)
    const metalness = recipe.composition!.groups[0].drivers!.find(driver => driver.target === 'material.metalness')!
    const innerRadius = recipe.objects.at(-1)!.drivers![0]
    for (const driver of [metalness, innerRadius]) {
      expect(readDriverPreset(driver.expression)).toMatchObject({ preset: 'follow', source: 'scene-size', amount: 1 / .6,
        offset: 0, unclamped: true })
    }
    expect(recipe).toEqual(before)
  })

  it('retains existing explicit limits and adds limits only after the user chooses a custom range', () => {
    const expression: Expression = { type: 'clamp', input: input('pointer-x'), min: -.3, max: .4 }
    const limited = readDriverPreset(expression)!
    expect(limited).toMatchObject({ preset: 'follow', source: 'pointer-x', amount: 1, offset: 0, minimum: -.3, maximum: .4 })
    expect(limited.unclamped).toBeUndefined()
    expect(createDriverPresetExpression(limited)).toMatchObject({ type: 'clamp', min: -.3, max: .4 })

    const full = readDriverPreset(input('time'))!
    const custom = createDriverPresetExpression({ ...full, minimum: -1, maximum: 1 })
    expect(custom).toMatchObject({ type: 'clamp', min: -1, max: 1 })
    expect(readDriverPreset(custom)?.unclamped).toBeUndefined()
    expect(sample(custom, 6000).influence).toBe(1)
  })

  it('keeps unclamped Follow(Time) rotating at large elapsed times and preserves that behavior through edits', () => {
    const expression = multiply(input('time'), constant(2))
    const before = structuredClone(expression)
    const controls = readDriverPreset(expression)!
    const recreated = createDriverPresetExpression(controls)
    expect(readDriverPreset(recreated)).toMatchObject({ preset: 'follow', source: 'time', unclamped: true })
    for (const time of [0, 2.5, 6000, 86399]) expect(sample(recreated, time)).toEqual(sample(expression, time))
    const edited = createDriverPresetExpression({ ...controls, amount: 3, offset: .5 })
    expect(sample(edited, 6000).influence).toBe(18000.5)
    expect(readDriverPreset(edited)).toMatchObject({ preset: 'follow', amount: 3, offset: .5, unclamped: true })
    expect(expression).toEqual(before)
  })

  it('keeps the existing Spin and audio Pulse forms and semantics', () => {
    const spin = add(multiply(input('time'), constant(-.2)), constant(.5))
    const controls = readDriverPreset(spin)!
    expect(controls).toMatchObject({ preset: 'spin', speed: -.2, phase: .5 })
    expect(createDriverPresetExpression(controls)).toEqual(spin)

    const pulse = createDriverPresetExpression({ ...controls, preset: 'pulse', source: 'bass-hit', amount: 2,
      offset: .1, ...DRIVER_INFLUENCE_RANGE })
    expect(readDriverPreset(pulse)).toMatchObject({ preset: 'pulse', source: 'bass-hit', audioDriven: true, amount: 2, offset: .1 })
    expect(createDriverPresetExpression(readDriverPreset(pulse)!)).toEqual(pulse)
  })

  it.each([
    add(input('bass-level'), input('pointer-x')),
    multiply(input('time'), input('scene-size')),
    multiply(add(input('bass-level'), input('pointer-x')), constant(2)),
    input('view-ray'),
    component('scene-pointer', 'z'),
    constant(.5),
  ])('leaves combined formulas and unselectable sources for the formula editor: %j', expression => {
    const before = structuredClone(expression)
    expect(readDriverPreset(expression)).toBeNull()
    expect(expression).toEqual(before)
  })
})

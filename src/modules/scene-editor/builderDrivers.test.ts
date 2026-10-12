import { describe, expect, it } from 'vitest'
import { parseSceneDocument, validateBuilderDriverExpression, type BuilderDriverExpression } from '@modules/player'
import { createBuilderScene, updateBuilderObject } from './builderEditor'
import { createDriverPresetExpression, defaultDriverPreset, driverTargets, moveBuilderDriver, readDriverPreset, type DriverPresetValues } from './builderDrivers'
import { BUILDER_RECIPE_REFERENCE_SIZE, createBuilderRecipe } from './builderRecipes'
import { updateBuilderGroup } from './builderGroups'
import roundTrips from '../../../contracts/scenes/current-round-trips.json'

const values: DriverPresetValues = { preset: 'pulse', source: 'time', speed: 1.2, amount: .3, phase: .4, offset: .2, minimum: -.5, maximum: .6 }

describe('Builder animation controls', () => {
  it.each(['pulse', 'wobble', 'follow'] as const)('round-trips %s controls without losing authored numbers', preset => {
    const input = { ...values, preset, source: preset === 'follow' ? 'bass-level' : 'time', ...(preset === 'follow' ? { speed: 1, phase: 0 } : {}) }
    const expression = createDriverPresetExpression(input)
    expect(readDriverPreset(expression)).toMatchObject(input)
    expect(validateBuilderDriverExpression(expression).type).toBe('scalar')
  })

  it('fits spatial presets in the bounded expression depth and keeps Spin un-clamped', () => {
    expect(validateBuilderDriverExpression(createDriverPresetExpression({ ...values, source: 'view-ray.y' })).spatial).toBe(true)
    const spin = createDriverPresetExpression({ ...values, preset: 'spin', speed: -.4 })
    expect(spin.type).not.toBe('clamp')
    expect(readDriverPreset(spin)).toMatchObject({ preset: 'spin', speed: -.4, phase: .4 })
  })

  it('does not interpret arbitrary imported expressions as editable presets', () => {
    const combined: BuilderDriverExpression = { type: 'add', left: { type: 'input', source: 'bass-level' }, right: { type: 'input', source: 'pointer-x' } }
    expect(readDriverPreset(combined)).toBeNull()
    expect(combined).toEqual({ type: 'add', left: { type: 'input', source: 'bass-level' }, right: { type: 'input', source: 'pointer-x' } })
  })

  it('keeps repeated influences on a property independently ordered', () => {
    const scene = createBuilderScene(), object = scene.objects[0]
    const pulse = defaultDriverPreset(object, 'pulse').driver
    const wobble = { ...defaultDriverPreset(object, 'wobble').driver, target: pulse.target }
    const node = { ...object, drivers: [pulse, wobble] }
    expect(moveBuilderDriver(node, 1, -1).drivers).toEqual([wobble, pulse])
    expect(node.drivers).toEqual([pulse, wobble])
  })

  it('removes only properties made unavailable by changing a shape or group composition', () => {
    const scene = createBuilderScene()
    scene.objects[0].drivers = [
      { target: 'operation.radius', mode: 'add', expression: { type: 'constant', value: .2 } },
      defaultDriverPreset(scene.objects[0], 'spin').driver,
    ]
    const box = updateBuilderObject(scene, scene.objects[0].id, object => ({ ...object, operation: { type: 'box', width: 1, height: 1, depth: 1 } }))
    expect(box.objects[0].drivers?.map(driver => driver.target)).toEqual(['rotation.y'])
    expect(scene.objects[0].drivers).toHaveLength(2)
    const recipe = createBuilderRecipe('embedded-scene-5')
    const next = updateBuilderGroup(recipe, 'recipe-5-view', group => ({ ...group, operation: { type: 'union' } }))
    expect(next.composition!.groups.find(group => group.id === 'recipe-5-view')!.drivers?.some(driver => driver.target === 'blend')).toBe(false)
    expect(driverTargets(next.composition!.groups.find(group => group.id === 'recipe-5-view')!).some(target => target.value === 'material.metalness')).toBe(false)
    expect(driverTargets(next.composition!.groups[0]).some(target => target.value === 'material.metalness')).toBe(true)
  })
})

describe('editable Alloy Capsule recipe', () => {
  it('preserves an already saved current-format recipe without rewriting its expressions', () => {
    const fixture = roundTrips.cases.find(item => item.name === 'drivers-editable-alloy-capsule-current-recipe')
    expect(fixture).toBeDefined()
    expect(parseSceneDocument(fixture!.input)).toEqual(fixture!.normalized)
    expect(parseSceneDocument(JSON.parse(JSON.stringify(fixture!.normalized)))).toEqual(fixture!.normalized)
  })

  it('creates independent cylinder/sphere documents with concrete editable time, music, pointer and view controls', () => {
    const first = createBuilderRecipe('embedded-scene-5'), second = createBuilderRecipe('embedded-scene-5')
    expect(first.objects.map(object => object.operation.type)).toEqual(['cylinder', 'sphere', 'sphere'])
    expect(first.objects[0].material.metalness).toBeCloseTo(.6304962928840792 * BUILDER_RECIPE_REFERENCE_SIZE)
    expect(first.parameters.scale).toBe(10)
    expect(first.rendering).toEqual({ maxIterations: 56, stepSize: .7 })
    const [motion, view, body] = first.composition!.groups
    expect(motion.id).toBe('recipe-5-motion')
    expect(view.id).toBe('recipe-5-view')
    expect(body.id).toBe('recipe-5-body')
    expect(view.transform.rotationOrder).toBe('zyx')
    expect(view.drivers!.find(driver => driver.target === 'blend')!.mode).toBe('multiply')
    for (const owner of [...first.objects, ...first.composition!.groups]) {
      for (const driver of owner.drivers ?? []) expect(validateBuilderDriverExpression(driver.expression).type).toBe('scalar')
    }
    expect(JSON.stringify(first)).toContain('view-ray')
    expect(JSON.stringify(first)).toContain('scene-size')
    expect(JSON.stringify(first)).toContain('scene-pointer-down')
    expect(JSON.stringify(first)).toContain('scene-pointer')
    expect(JSON.stringify(first)).not.toContain('overall-level')
    expect(first).not.toHaveProperty('templateId')
    first.objects[0].material.color = '#123456'
    expect(second.objects[0].material.color).toBe('#3d4437')
    expect(parseSceneDocument(JSON.parse(JSON.stringify(first)))).toEqual(first)
  })
})

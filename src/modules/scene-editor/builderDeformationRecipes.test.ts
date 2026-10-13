import { describe, expect, it } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { normalizeCompiledShader } from '@notrac/mage/compiled-shader'
import { compileBuilderDocument, compileBuilderPreviewDocument } from '../player/templates/builderCompiler'
import { parseSceneDocument, type BuilderDriver, type BuilderDriverExpression, type BuilderOperation, type BuilderSceneDocument, type TemplateId } from '../player/templates/sceneContract'
import { validateSceneForPlayback, validateSceneForStorage } from '../player/policy/sceneValidation'
import { readTemplateShaderSource } from '../player/templates/templateSource'
import { builderRecipeReference, createBuilderRecipe } from './builderRecipes'
import { createTemplateScene, getTemplateEditorModel } from './templateEditor'
import { defaultDriverPreset } from './builderDrivers'

const references = [
  { id: 'embedded-scene-2', objects: 4, groups: 5, depth: 5, noise: 2, snapshotRotations: 2 },
  { id: 'embedded-scene-4', objects: 5, groups: 4, depth: 4, noise: 1, snapshotRotations: 2 },
  { id: 'embedded-scene-11', objects: 3, groups: 2, depth: 2, noise: 1, snapshotRotations: 0 },
  { id: 'embedded-scene-12', objects: 5, groups: 4, depth: 4, noise: 3, snapshotRotations: 2 },
] as const
type Vector = { x: number; y: number; z: number }
type Inputs = { size: number; pointerDown: number; time: number; mouse: Vector; ray: Vector }
type Event = { type: 'shape'; operation: BuilderOperation } | { type: 'expand'; frequency: number; strength: number } | { type: 'blend'; amount: number }
const baseline: Inputs = { size: .6, pointerDown: 0, time: 0, mouse: { x: -.13, y: .28, z: 0 }, ray: { x: .17, y: -.21, z: -.962 } }

describe('editable deformation and material recipes', () => {
  it.each(references)('compiles and saves $id without raising existing workload budgets', reference => {
    const scene = createBuilderRecipe(reference.id)
    const template = createTemplateScene(reference.id)
    expect(scene.settings).toEqual(template.settings)
    expect(scene.parameters).toEqual(template.parameters)
    expect(scene).not.toHaveProperty('templateId')
    expect(parseSceneDocument(JSON.parse(JSON.stringify(scene)))).toEqual(scene)
    expect(validateSceneForPlayback(scene)).toEqual(scene)
    expect(validateSceneForStorage(scene)).toEqual(scene)
    for (const compile of [compileBuilderDocument, compileBuilderPreviewDocument]) {
      const compiled = compile(scene)
      expect(compiled.workload).toMatchObject({ expandedPrimitives: reference.objects, groups: reference.groups, groupDepth: reference.depth })
      expect(compiled.workload.driverOperations).toBeLessThanOrEqual(192)
      expect(compiled.workload.liveUniforms).toBeLessThanOrEqual(64)
      expect(compiled.workload.modifierOperations).toBeLessThanOrEqual(80)
      expect(compiled.shader.match(/=noise\(vec3\(/g)).toHaveLength(reference.noise)
      expect(compiled.shader).not.toContain('embedded-scene-')
      expect(() => normalizeCompiledShader(compileShader(compiled.shader, { maxRaymarchIterations: 200 }), { maxRaymarchIterations: 200 })).not.toThrow()
    }
  })

  it.each(references)('matches executable $id shapes, post-union expansion order, and animated joins', ({ id }) => {
    const scene = createBuilderRecipe(id)
    for (const size of [.006, .02, .6, 1.4]) for (const pointerDown of [0, .01, .15, .4]) for (const time of [0, .2, 1.7, 8, 30, 120]) {
      const state = { ...baseline, size, pointerDown, time }
      expectNumbers(recordRecipe(scene, state), recordSource(id, state).events)
    }
  })

  it.each(references)('still saves $id with fully edited scene settings and an extra animation', ({ id }) => {
    const scene = createBuilderRecipe(id), model = getTemplateEditorModel(scene)
    const passes = { ...model.fx.passes }
    delete (passes as Partial<typeof passes>).colorify
    scene.settings = {
      ...scene.settings, controls: structuredClone(model.controls),
      camera: { ...scene.settings.camera, tilt: model.intent.camTilt, orientationMode: model.intent.camOrientationMode, orientationSpeed: model.intent.camOrientationSpeed },
      motion: { minimizing_factor: model.intent.minimizing_factor, power_factor: model.intent.power_factor,
        pointerDownMultiplier: model.intent.pointerDownMultiplier, base_speed: model.intent.base_speed, easing_speed: model.intent.easing_speed },
      state: { ...model.state, currPointerDown: 0 },
      effects: { passOrder: model.fx.passOrder, toneMapping: model.fx.toneMapping, passes,
        params: { afterImage: model.fx.params.afterImage, rgbShift: model.fx.params.rgbShift, kaleid: model.fx.params.kaleid } },
      audioResponse: 'mapped-v1', audioResponseConfig: { version: 1, sensitivity: 1,
        mappings: (['size', 'bass', 'mid', 'treble', 'audioLevel', 'audioHit'] as const).map(target => ({ target, source: 'bass-level', amount: 1, attack: .02, release: .2 })) },
    }
    scene.objects[0].drivers!.push(defaultDriverPreset(scene.objects[0], 'spin').driver)
    expect(validateSceneForPlayback(scene)).toEqual(scene)
    expect(validateSceneForStorage(scene)).toEqual(scene)
    expect(compileBuilderPreviewDocument(scene).workload.liveUniforms).toBeLessThanOrEqual(64)
  })

  it.each(references)('keeps $id material precision, coordinate snapshot, and rotation order', reference => {
    const scene = createBuilderRecipe(reference.id), groups = scene.composition!.groups
    for (const time of [0, .2, 1.7, 8, 30, 120]) {
      const state = { ...baseline, time }, source = recordSource(reference.id, state)
      const root = groups.find(group => group.id === scene.composition!.roots[0])!
      expect(typeof root.material!.color).toBe('object')
      const color = root.material!.color as Vector
      const actualColor = Object.fromEntries((['r', 'g', 'b'] as const).map((channel, index) => {
        const axis = (['x', 'y', 'z'] as const)[index]
        return [axis, applyDrivers(root.drivers ?? [], `material.color.${channel}`, color[axis], state)]
      }))
      expectNumbers(actualColor, source.color)
      expect(applyDrivers(root.drivers ?? [], 'material.metalness', root.material!.metalness, state)).toBeCloseTo(source.metalness, 12)
      expect(root.material!.shininess).toBeCloseTo(source.shininess, 12)
      expect(source.snapshotRotations).toBe(reference.snapshotRotations)
      // Coordinates are transformed inversely by the Builder frame; the Y sign
      // compensates for the engine's XZ rotation convention.
      const rotations = groups.filter(group => group.drivers?.some(driver => driver.target.startsWith('rotation.')))
        .flatMap(group => (group.transform.rotationOrder === 'zyx' ? ['x', 'y', 'z'] : ['y', 'x'])
          .filter(axis => group.drivers?.some(driver => driver.target === `rotation.${axis}`))
          .map(axis => ({ axis, value: applyDrivers(group.drivers!, `rotation.${axis}`, 0, state) * (axis === 'y' ? -1 : 1) })))
      expectNumbers(rotations, source.rotations)
      for (const group of groups.filter(group => group.modifiers?.length)) {
        const noise = group.drivers!.find(driver => driver.target === 'modifier.expand.amount')!.expression
        if (noise.type !== 'noise' || noise.input.type !== 'multiply' || noise.input.left.type !== 'input') throw new Error('Expected editable spatial noise')
        const coordinate = noise.input.left
        if (coordinate.source === 'world-position') expect(source.snapshotRotations).toBe(0)
        else {
          expect(coordinate.source).toBe('group-position')
          let ancestor = group
          for (let depth = 0; depth < (coordinate.ancestor ?? 1); depth++) ancestor = groups.find(candidate => candidate.children.includes(ancestor.id))!
          expect(ancestor).toBe(root)
          expect(root.drivers!.filter(driver => driver.target.startsWith('rotation.'))).toHaveLength(source.snapshotRotations)
        }
      }
    }
    const source = recordSource(reference.id, baseline)
    expect(scene.rendering).toEqual(source.rendering)
    expect(builderRecipeReference(reference.id)).toMatchObject({ sourceIterations: source.rendering.maxIterations, sourceStepSize: source.rendering.stepSize })
    for (const object of scene.objects) expect(object.material.color).toEqual(groups[0].material!.color)
  })

  it('retains fractional grid folding, editable noise strength/frequency, and exact numeric color through a round trip', () => {
    const scene = createBuilderRecipe('embedded-scene-2')
    expect(scene.objects.at(-1)!.operation).toMatchObject({ type: 'lattice', iterations: 1.99, spacing: 2.4 })
    const group = scene.composition!.groups.find(candidate => candidate.modifiers?.length)!
    const modifier = group.modifiers![0]
    if (modifier.type !== 'expand') throw new Error('Expected expand')
    modifier.amount = .3141592653589793
    const expression = group.drivers![0].expression
    if (expression.type !== 'noise' || expression.input.type !== 'multiply' || expression.input.right.type !== 'constant') throw new Error('Expected noise frequency')
    expression.input.right.value = 2.718281828459045
    scene.composition!.groups[0].material!.color = { x: -.123456789012345, y: .234567890123456, z: .345678901234567 }
    expect(validateSceneForStorage(JSON.parse(JSON.stringify(scene)))).toEqual(scene)
    const next = createBuilderRecipe('embedded-scene-2')
    expect(next.composition!.groups).not.toEqual(scene.composition!.groups)
    expect(scene.composition!.groups[0].material!.color).not.toEqual(scene.objects[0].material.color)
  })
})

function evaluate(expression: BuilderDriverExpression, state: Inputs): number | Vector {
  switch (expression.type) {
    case 'constant': return expression.value
    case 'input': {
      switch (expression.source) {
        case 'time': return state.time
        case 'scene-size': return state.size
        case 'scene-pointer-down': return state.pointerDown
        case 'scene-pointer': return state.mouse
        case 'view-ray': return state.ray
        default: throw new Error(`Unexpected nonnumeric recipe input ${expression.source}`)
      }
    }
    case 'component': return (evaluate(expression.input, state) as Vector)[expression.axis]
    case 'sin': return Math.sin(evaluate(expression.input, state) as number)
    case 'cos': return Math.cos(evaluate(expression.input, state) as number)
    case 'clamp': return Math.max(expression.min, Math.min(expression.max, evaluate(expression.input, state) as number))
    case 'add': return (evaluate(expression.left, state) as number) + (evaluate(expression.right, state) as number)
    case 'multiply': return (evaluate(expression.left, state) as number) * (evaluate(expression.right, state) as number)
    case 'noise': throw new Error('Spatial noise is compared structurally, not mocked as a render result')
  }
}
function applyDrivers(drivers: BuilderDriver[], target: string, baseline: number, state: Inputs) {
  return drivers.filter(driver => driver.target === target).reduce((value, driver) => {
    const influence = evaluate(driver.expression, state) as number
    return driver.mode === 'replace' ? influence : driver.mode === 'add' ? value + influence : value * influence
  }, baseline)
}
function expectNumbers(actual: unknown, expected: unknown) {
  if (typeof expected === 'number') { expect(actual).toBeTypeOf('number'); expect(actual).toBeCloseTo(expected, 11); return }
  if (expected && typeof expected === 'object') {
    expect(Object.keys(actual as object)).toEqual(Object.keys(expected))
    for (const [key, value] of Object.entries(expected)) expectNumbers((actual as Record<string, unknown>)[key], value)
  } else expect(actual).toEqual(expected)
}

function recordRecipe(scene: BuilderSceneDocument, state: Inputs): Event[] {
  const events: Event[] = []
  const walk = (id: string) => {
    const object = scene.objects.find(object => object.id === id)
    if (object) {
      const operation = { ...object.operation } as Record<string, unknown>
      for (const [key, value] of Object.entries(operation)) if (typeof value === 'number') operation[key] = applyDrivers(object.drivers ?? [], `operation.${key}`, value, state)
      events.push({ type: 'shape', operation: operation as BuilderOperation }); return
    }
    const group = scene.composition!.groups.find(group => group.id === id)!
    group.children.forEach((child, index) => {
      if (index && group.operation.type === 'smooth-union') events.push({ type: 'blend', amount: applyDrivers(group.drivers ?? [], 'blend', group.operation.blend, state) })
      walk(child)
    })
    for (const modifier of group.modifiers ?? []) {
      if (modifier.type !== 'expand') throw new Error('Unexpected recipe modifier')
      const influence = group.drivers!.find(driver => driver.target === 'modifier.expand.amount')!
      expect(influence.mode).toBe('multiply')
      const expression = influence.expression
      if (expression.type !== 'noise' || expression.input.type !== 'multiply' || expression.input.right.type !== 'constant'
        || typeof expression.input.right.value !== 'number') throw new Error('Expected ordinary editable noise')
      events.push({ type: 'expand', frequency: expression.input.right.value, strength: modifier.amount })
    }
  }
  scene.composition!.roots.forEach(walk)
  return events
}

/** Execute only immutable maintained catalog source with recording primitives.
 * getSpace returns a sentinel so noise records its frequency; this is an
 * operation/parameter audit, not a simulated GPU noise or pixel comparison.
 */
function recordSource(templateId: TemplateId, state: Inputs) {
  const events: Event[] = [], rotations: { axis: string; value: number }[] = []
  let inputIndex = 0, metalness = .5, shininess = .3, color: Vector = { x: 1, y: 1, z: 1 }, snapshotRotations = 0, frequency = 0
  const rendering = { maxIterations: 0, stepSize: 0 }
  const shape = (operation: BuilderOperation) => events.push({ type: 'shape', operation })
  const bindings = {
    input: () => inputIndex++ ? state.pointerDown : state.size, time: state.time, mouse: state.mouse,
    PI: Math.PI, max: Math.max, nsin: (value: number) => .5 + .5 * Math.sin(value),
    vec3: (value: number) => ({ x: value, y: value, z: value }), getRayDirection: () => state.ray,
    getSpace: () => { snapshotRotations = rotations.length; return 1 },
    noise: (value: number) => { frequency = value; return 1 },
    expand: (strength: number) => { if (events.some(event => event.type === 'shape')) events.push({ type: 'expand', frequency, strength }) },
    setMaxIterations: (value: number) => { rendering.maxIterations = value }, setStepSize: (value: number) => { rendering.stepSize = value },
    color: (x: number | Vector, y?: number, z?: number) => { color = typeof x === 'number' ? { x, y: y!, z: z! } : x },
    shine: (value: number) => { shininess = value }, metal: (value: number) => { metalness = value },
    rotateX: (value: number) => rotations.push({ axis: 'x', value }), rotateY: (value: number) => rotations.push({ axis: 'y', value }), rotateZ: (value: number) => rotations.push({ axis: 'z', value }),
    blend: (amount: number) => events.push({ type: 'blend', amount }),
    sphere: (radius: number) => shape({ type: 'sphere', radius }), cylinder: (radius: number, height: number) => shape({ type: 'cylinder', radius, height }),
    torus: (radius: number, tube: number) => shape({ type: 'torus', radius, tube }),
    boxFrame: (dimensions: Vector, thickness: number) => shape({ type: 'box-frame', width: dimensions.x, height: dimensions.y, depth: dimensions.z, thickness }),
    grid: (iterations: number, spacing: number, roundness: number) => shape({ type: 'lattice', iterations, spacing, thickness: spacing * roundness }),
  }
  new Function(...Object.keys(bindings), readTemplateShaderSource({ templateId, templateVersion: 1 }))(...Object.values(bindings))
  while (events.at(-1)?.type === 'blend') events.pop()
  return { events, rotations, color, metalness, shininess, snapshotRotations, rendering }
}

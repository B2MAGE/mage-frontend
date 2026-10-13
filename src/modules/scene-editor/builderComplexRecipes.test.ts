import { describe, expect, it } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { normalizeCompiledShader } from '@notrac/mage/compiled-shader'
import { createComplexBuilderRecipe } from './builderComplexRecipes'
import { compileBuilderDocument, compileBuilderPreviewDocument } from '../player/templates/builderCompiler'
import { parseSceneDocument, type BuilderDriverExpression, type BuilderDriver, type BuilderFrame, type BuilderGroup, type BuilderMaterial, type BuilderOperation, type BuilderSceneDocument, type TemplateId } from '../player/templates/sceneContract'
import { validateSceneForPlayback, validateSceneForStorage } from '../player/policy/sceneValidation'
import { readTemplateShaderSource } from '../player/templates/templateSource'
import { BUILDER_RENDERING_POLICY } from '../player/templates/builderCompiler'
import { createBuilderRecipe } from './builderRecipes'
import { openTemplateWorkspace } from './templateWorkspace'
import { builderColorChannels } from '../player/templates/builderColor'

type Vector = { x: number; y: number; z: number }
type Axis = keyof Vector
type State = { size: number; pointerDown: number; time: number; mouse: Vector; ray: Vector; point: Vector }
type Context = { parent: Vector; world: Vector; noise: Vector[] }
type ShapeRecord = { operation: BuilderOperation; position: Vector; material: BuilderMaterial }
type Recordings = { shapes: ShapeRecord[]; expansions: { after: number; amount: number }[]; joins: number[]; noise: Vector[] }
const ids = ['embedded-scene-0', 'embedded-scene-13'] as const
const vector = (x: number, y = x, z = x) => ({ x, y, z })
const norm = (value: Vector) => {
  const length = Math.hypot(value.x, value.y, value.z)
  return vector(value.x / length, value.y / length, value.z / length)
}
const baseline: State = { size: .6, pointerDown: 0, time: 0, mouse: vector(-.13, .28, 0), ray: norm(vector(.17, -.21, -.962)), point: vector(.21, -.48, .37) }

function expressionSize(expression: BuilderDriverExpression): { nodes: number; depth: number; constants: number; work: number } {
  const children = expression.type === 'add' || expression.type === 'multiply' ? [expression.left, expression.right]
    : 'input' in expression ? [expression.input] : []
  const values = children.map(expressionSize)
  return {
    nodes: 1 + values.reduce((sum, value) => sum + value.nodes, 0),
    depth: 1 + Math.max(0, ...values.map(value => value.depth)),
    constants: (expression.type === 'constant' ? typeof expression.value === 'number' ? 1 : 3 : expression.type === 'clamp' ? 2 : 0)
      + values.reduce((sum, value) => sum + value.constants, 0),
    work: (expression.type === 'noise' ? 8 : 1) + values.reduce((sum, value) => sum + value.work, 0),
  }
}

describe('complex editable recipes', () => {
  it.each(ids)('fits explicit whole-document and per-expression budgets for %s', id => {
    const scene = createComplexBuilderRecipe(id)
    const owners = [...scene.objects, ...scene.composition!.groups]
    const drivers = owners.flatMap(owner => owner.drivers ?? [])
    const sizes = drivers.map(driver => expressionSize(driver.expression))
    expect(drivers.length).toBeLessThanOrEqual(BUILDER_RENDERING_POLICY.limits.authoredDrivers)
    expect(Math.max(...owners.map(owner => owner.drivers?.length ?? 0))).toBeLessThanOrEqual(BUILDER_RENDERING_POLICY.driverLimits.perNode)
    expect(Math.max(...sizes.map(size => size.nodes))).toBeLessThanOrEqual(BUILDER_RENDERING_POLICY.driverLimits.expressionNodes)
    expect(Math.max(...sizes.map(size => size.depth))).toBeLessThanOrEqual(BUILDER_RENDERING_POLICY.driverLimits.expressionDepth)
    expect(sizes.reduce((sum, size) => sum + size.work, 0)).toBeLessThanOrEqual(BUILDER_RENDERING_POLICY.limits.driverOperations)
    expect(scene.objects).toHaveLength(3)
  })

  it.each(ids)('compiles %s as independent concrete data through current storage and playback validation', id => {
    const scene = createBuilderRecipe(id)
    expect(scene).not.toHaveProperty('templateId')
    expect(parseSceneDocument(JSON.parse(JSON.stringify(scene)))).toEqual(scene)
    expect(validateSceneForStorage(scene)).toEqual(scene)
    expect(validateSceneForPlayback(scene)).toEqual(scene)
    expect(openTemplateWorkspace(scene)).toEqual({ document: scene, templateSourceId: id })
    for (const compile of [compileBuilderDocument, compileBuilderPreviewDocument]) {
      const compiled = compile(scene)
      expect(compiled.shader).not.toContain('embedded-scene-')
      expect(compiled.workload.expandedPrimitives).toBe(3)
      expect(compiled.workload.groups).toBe(id === 'embedded-scene-0' ? 3 : 5)
      expect(compiled.workload.groupDepth).toBe(id === 'embedded-scene-0' ? 3 : 5)
      expect(() => normalizeCompiledShader(compileShader(compiled.shader, { maxRaymarchIterations: 200 }), { maxRaymarchIterations: 200 }), `${id}: ${compile.name}, ${compiled.workload.liveUniforms} uniforms`).not.toThrow()
    }
  })

  it.each(ids)('matches executable %s dimensions, scoped coordinates, materials and dynamic joins', id => {
    const scene = createComplexBuilderRecipe(id)
    for (const time of [0, .2, 1.7, 8, 30, 120]) for (const size of [.006, .02, .6, .9]) for (const pointerDown of [0, .01, .15, .4]) {
      for (const point of [vector(.21, -.48, .37), vector(-.73, .14, 1.21)]) {
        const state = { ...baseline, time, size, pointerDown, point }
        expectNumbers(recordRecipe(scene, state), recordSource(id, state))
      }
    }
  })

  it('keeps Rose sampling frames inverse while its two scoped noise fields use the next object coordinates', () => {
    const scene = createComplexBuilderRecipe('embedded-scene-13')
    for (const time of [0, 1, 13, 90]) {
      const state = { ...baseline, time, pointerDown: .25 }, actual = recordRecipe(scene, state), original = recordSource('embedded-scene-13', state)
      expect(actual.noise).toHaveLength(2)
      expectNumbers(actual.noise[0], vector(original.shapes[1].position.x * 2.6572, original.shapes[1].position.y * 2.6572, original.shapes[1].position.z * 2.6572))
      expectNumbers(actual.noise[1], vector(original.shapes[2].position.x * 1.0838, original.shapes[2].position.y * 1.0838, original.shapes[2].position.z * 1.0838))
      expect(actual.expansions.map(expansion => expansion.after)).toEqual([1, 2])
    }
  })

  it.each(ids)('keeps ordinary fields and independent responses editable after a recipe copy for %s', id => {
    const scene = createComplexBuilderRecipe(id), previous = recordRecipe(scene, baseline)
    const node = scene.objects[0]
    const key = node.operation.type === 'box-frame' ? 'width' : 'radius'
    const operation = node.operation as unknown as Record<string, number>
    operation[key] *= 1.25
    node.material.metalness *= .5
    const current = recordRecipe(scene, baseline)
    expect((current.shapes[0].operation as unknown as Record<string, number>)[key]).toBeCloseTo((previous.shapes[0].operation as unknown as Record<string, number>)[key] * 1.25, 11)
    expect(current.shapes[0].material.metalness).toBeCloseTo(previous.shapes[0].material.metalness * .5, 11)
    expect(current.shapes[1]).toEqual(previous.shapes[1])
    expect(createComplexBuilderRecipe(id)).not.toEqual(scene)
    node.bindings.push({ target: 'scale.x', source: 'treble-level', mode: 'add', amount: .25, offset: 0, attack: .02, release: .2 })
    expect(validateSceneForStorage(scene)).toEqual(scene)
    expect(compileBuilderPreviewDocument(scene).bindings).toHaveLength(1)
  })

  it('keeps Rose noise strength in the ordinary Expand property', () => {
    const scene = createComplexBuilderRecipe('embedded-scene-13')
    const noiseGroup = scene.composition!.groups.find(group => group.id === 'recipe-13-ring-restore')!
    const driver = noiseGroup.drivers!.find(driver => driver.expression.type === 'noise')!
    expect(driver.mode).toBe('multiply')
    expect(noiseGroup.modifiers).toEqual([{ type: 'expand', amount: .0002 }])
    const previous = recordRecipe(scene, baseline)
    noiseGroup.modifiers![0] = { type: 'expand', amount: .2 }
    expect(recordRecipe(scene, baseline).expansions[0].amount).not.toBe(previous.expansions[0].amount)
  })
})

function evaluate(expression: BuilderDriverExpression, state: State, context: Context): number | Vector {
  switch (expression.type) {
    case 'constant': return expression.value
    case 'input': {
      switch (expression.source) {
        case 'time': return state.time
        case 'scene-size': return state.size
        case 'scene-pointer-down': return state.pointerDown
        case 'scene-pointer': return state.mouse
        case 'view-ray': return state.ray
        case 'group-position': return context.parent
        case 'world-position': return context.world
        default: throw new Error(`Unexpected recipe input ${expression.source}`)
      }
    }
    case 'component': return (evaluate(expression.input, state, context) as Vector)[expression.axis]
    case 'sin': return Math.sin(evaluate(expression.input, state, context) as number)
    case 'cos': return Math.cos(evaluate(expression.input, state, context) as number)
    case 'clamp': return Math.max(expression.min, Math.min(expression.max, evaluate(expression.input, state, context) as number))
    case 'add': return (evaluate(expression.left, state, context) as number) + (evaluate(expression.right, state, context) as number)
    case 'multiply': {
      const left = evaluate(expression.left, state, context), right = evaluate(expression.right, state, context)
      if (typeof left === 'number' && typeof right === 'number') return left * right
      return Object.fromEntries((['x', 'y', 'z'] as const).map(axis => [axis, (typeof left === 'number' ? left : left[axis]) * (typeof right === 'number' ? right : right[axis])])) as Vector
    }
    case 'noise': {
      // Both sides record the exact coordinates. This deterministic stand-in
      // then checks the remaining scalar formula, not GPU noise fidelity.
      const point = evaluate(expression.input, state, context) as Vector
      context.noise.push(vector(point.x, point.y, point.z))
      return testNoise(point)
    }
  }
}
const testNoise = (point: Vector) => Math.sin(point.x * 1.13 + point.y * .47 + point.z * .31)
function applyDrivers(drivers: BuilderDriver[] | undefined, target: string, value: number, state: State, context: Context) {
  return (drivers ?? []).filter(driver => driver.target === target).reduce((current, driver) => {
    const influence = evaluate(driver.expression, state, context) as number
    return driver.mode === 'replace' ? influence : driver.mode === 'multiply' ? current * influence : current + influence
  }, value)
}
function rotate(point: Vector, axis: Axis, angle: number): Vector {
  const [first, second] = axis === 'x' ? ['y', 'z'] as const : axis === 'y' ? ['x', 'z'] as const : ['x', 'y'] as const
  return { ...point, [first]: point[first] * Math.cos(angle) - point[second] * Math.sin(angle), [second]: point[first] * Math.sin(angle) + point[second] * Math.cos(angle) }
}
function frame(point: Vector, transform: BuilderFrame, drivers: BuilderDriver[] | undefined, state: State, context: Context) {
  let next = vector(point.x - transform.position.x, point.y - transform.position.y, point.z - transform.position.z)
  for (const axis of [...transform.rotationOrder ?? 'xyz'].reverse() as Axis[]) {
    next = rotate(next, axis, applyDrivers(drivers, `rotation.${axis}`, transform.rotation[axis], state, context) * (axis === 'y' ? -1 : 1))
  }
  return vector(next.x / transform.scale, next.y / transform.scale, next.z / transform.scale)
}
function recordRecipe(scene: BuilderSceneDocument, state: State): Recordings {
  const result: Recordings = { shapes: [], expansions: [], joins: [], noise: [] }
  const context = (parent: Vector): Context => ({ parent, world: state.point, noise: result.noise })
  const visit = (id: string, parent: Vector) => {
    const object = scene.objects.find(object => object.id === id)
    if (object) {
      const operation = { ...object.operation } as Record<string, unknown>
      for (const [key, value] of Object.entries(operation)) if (typeof value === 'number') operation[key] = applyDrivers(object.drivers, `operation.${key}`, value, state, context(parent))
      let position = parent
      for (const axis of ['x', 'y', 'z'] as const) position = rotate(position, axis, applyDrivers(object.drivers, `rotation.${axis}`, object.transform.rotation[axis], state, context(parent)))
      const material = { ...object.material, color: Object.fromEntries((['r', 'g', 'b'] as const).map((channel, index) => [(['x', 'y', 'z'] as const)[index],
        applyDrivers(object.drivers, `material.color.${channel}`, builderColorChannels(object.material.color)[index], state, context(parent))])) as Vector }
      for (const property of ['metalness', 'shininess'] as const) material[property] = applyDrivers(object.drivers, `material.${property}`, material[property], state, context(parent))
      result.shapes.push({ operation: operation as BuilderOperation, position, material })
      return
    }
    const group: BuilderGroup = scene.composition!.groups.find(group => group.id === id)!
    const position = frame(parent, group.transform, group.drivers, state, context(parent))
    group.children.forEach((child, index) => {
      if (index && group.operation.type === 'smooth-union') result.joins.push(applyDrivers(group.drivers, 'blend', group.operation.blend, state, context(parent)))
      visit(child, position)
    })
    for (const modifier of group.modifiers ?? []) if (modifier.type === 'expand') {
      result.expansions.push({ after: result.shapes.length, amount: applyDrivers(group.drivers, 'modifier.expand.amount', modifier.amount, state, context(parent)) })
    }
  }
  scene.composition!.roots.forEach(id => visit(id, state.point))
  return result
}

function recordSource(templateId: TemplateId, state: State): Recordings {
  const result: Recordings = { shapes: [], expansions: [], joins: [], noise: [] }
  let inputIndex = 0, position = state.point
  const material: BuilderMaterial = { color: vector(1), metalness: .5, shininess: .3 }
  const shape = (operation: BuilderOperation) => result.shapes.push({ operation, position, material: structuredClone(material) })
  const bindings = {
    input: () => inputIndex++ ? state.pointerDown : state.size, time: state.time, mouse: state.mouse,
    PI: Math.PI, max: Math.max, min: Math.min, sin: Math.sin, cos: Math.cos,
    nsin: (value: number) => .5 + .5 * Math.sin(value), ncos: (value: number) => .5 + .5 * Math.cos(value),
    vec3: vector, normalize: norm, getRayDirection: () => state.ray, getSpace: () => position,
    reset: () => { position = state.point },
    // JS cannot overload vector multiplication; recording source below replaces
    // only its three maintained getSpace()*frequency noise arguments.
    noise: (point: Vector) => { if (result.shapes.length) result.noise.push(point); return testNoise(point) },
    scaleVector: (point: Vector, scale: number) => vector(point.x * scale, point.y * scale, point.z * scale),
    expand: (amount: number) => { if (result.shapes.length) result.expansions.push({ after: result.shapes.length, amount }) },
    setMaxIterations: () => {}, setStepSize: () => {}, setGeometryQuality: () => {},
    color: (x: number | Vector, y?: number, z?: number) => { material.color = typeof x === 'number' ? vector(x, y!, z!) : x },
    metal: (value: number) => { material.metalness = value }, shine: (value: number) => { material.shininess = value },
    rotateX: (value: number) => { position = rotate(position, 'x', value) }, rotateY: (value: number) => { position = rotate(position, 'y', value) }, rotateZ: (value: number) => { position = rotate(position, 'z', value) },
    blend: (amount: number) => result.joins.push(amount),
    boxFrame: (dimensions: Vector, thickness: number) => shape({ type: 'box-frame', width: dimensions.x, height: dimensions.y, depth: dimensions.z, thickness }),
    sphere: (radius: number) => shape({ type: 'sphere', radius }),
    torus: (radius: number, tube: number) => shape({ type: 'torus', radius, tube }),
    cylinder: (radius: number, height: number) => shape({ type: 'cylinder', radius, height }),
  }
  const source = readTemplateShaderSource({ templateId, templateVersion: 1 }).replace(/noise\((s[012]) \* ([\d.]+)\)/g, 'noise(scaleVector($1, $2))')
  new Function(...Object.keys(bindings), source)(...Object.values(bindings))
  return result
}
function expectNumbers(actual: unknown, expected: unknown) {
  if (typeof expected === 'number') { expect(actual).toBeTypeOf('number'); expect(actual).toBeCloseTo(expected, 10); return }
  if (expected && typeof expected === 'object') {
    expect(Object.keys(actual as object)).toEqual(Object.keys(expected))
    for (const [key, value] of Object.entries(expected)) expectNumbers((actual as Record<string, unknown>)[key], value)
  } else expect(actual).toEqual(expected)
}

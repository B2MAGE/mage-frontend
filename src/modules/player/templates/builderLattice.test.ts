import { describe, expect, it } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { normalizeCompiledShader } from '@notrac/mage/compiled-shader'
import { compileBuilderDocument, compileBuilderPreviewDocument } from './builderCompiler'
import { builderOperationFields } from './builderDefinitions'
import { builderDriverTargetRange } from './builderDrivers'
import { parseSceneDocument, type BuilderOperation, type BuilderSceneDocument } from './sceneContract'

type Vector = { x: number; y: number; z: number }
type Value = number | Vector
const axes = ['x', 'y', 'z'] as const
const vector = (x: number, y = x, z = x): Vector => ({ x, y, z })
const map = (left: Value, right: Value, operation: (a: number, b: number) => number): Value => {
  if (typeof left === 'number' && typeof right === 'number') return operation(left, right)
  return Object.fromEntries(axes.map(axis => [axis, operation(typeof left === 'number' ? left : left[axis],
    typeof right === 'number' ? right : right[axis])])) as Vector
}

/** Probe actual packaged GLSL straight-line math, rejecting anything outside these fixtures. */
function distanceProbe(document: BuilderSceneDocument) {
  const artifact = compileShader(compileBuilderDocument(document).shader)
  const body = artifact.geoGLSL.slice(artifact.geoGLSL.lastIndexOf('float surfaceDistance'))
  return (point: Vector): number => {
    const values: Record<string, Value> = { p: point }
    const evaluate = (raw: string): Value => {
      const expression = raw.trim()
      if (/^-?\d+(\.\d+)?$/.test(expression)) return Number(expression)
      if (expression in values) return values[expression]
      const component = expression.match(/^(\w+)\.([xyz])$/)
      if (component) return (values[component[1]] as Vector)[component[2] as keyof Vector]
      const binary = expression.match(/^\(([^()]+)([+*/-])([^()]+)\)$/)
      if (binary) return map(evaluate(binary[1]), evaluate(binary[3]), (a, b) => binary[2] === '+' ? a + b
        : binary[2] === '-' ? a - b : binary[2] === '*' ? a * b : a / b)
      const call = expression.match(/^(abs|min|max|length|vec3)\((.*)\)$/)
      if (call) {
        const args = call[2].split(',').map(evaluate)
        if (call[1] === 'vec3') return vector(args[0] as number, (args[1] ?? args[0]) as number, (args[2] ?? args[0]) as number)
        if (call[1] === 'abs') return map(args[0], 0, Math.abs)
        if (call[1] === 'min' || call[1] === 'max') return map(args[0], args[1], call[1] === 'min' ? Math.min : Math.max)
        return Math.hypot(...axes.map(axis => (args[0] as Vector)[axis]))
      }
      throw new Error(`Unsupported distance probe expression: ${expression}`)
    }
    for (const raw of body.split('\n').slice(1)) {
      const line = raw.trim()
      if (!line) continue
      const primitive = line.match(/^float prim_0 = (.+);$/)
      if (primitive) return evaluate(primitive[1]) as number
      const declaration = line.match(/^(?:float|vec3) (\w+) = (.+);$/)
      if (declaration) { values[declaration[1]] = evaluate(declaration[2]); continue }
      const displacement = line.match(/^(\w+) -= (.+);$/)
      if (displacement) { values[displacement[1]] = map(values[displacement[1]], evaluate(displacement[2]), (a, b) => a - b); continue }
      if (/^\w+\.[xyz]{2} = \w+\.[xyz]{2}\*rot2\(0\.0+\);$/.test(line)) continue
      const assignment = line.match(/^(\w+) = (.+);$/)
      if (assignment) { values[assignment[1]] = evaluate(assignment[2]); continue }
      throw new Error(`Unsupported distance probe instruction: ${line}`)
    }
    throw new Error('Distance probe did not reach a primitive')
  }
}

function fixture(operation: BuilderOperation): BuilderSceneDocument {
  return parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
    objects: [{ id: 'shape', operation }] }) as BuilderSceneDocument
}

function boxDistance(point: Vector, extent: Vector) {
  const delta = axes.map(axis => Math.abs(point[axis]) - extent[axis])
  return Math.hypot(...delta.map(value => Math.max(0, value))) + Math.min(0, Math.max(...delta))
}

/** Independent geometric reference: a frame is twelve rectangular rods. */
function edgeDistance(point: Vector, extent: Vector, thickness: number) {
  return Math.min(...axes.flatMap(long => {
    const short = axes.filter(axis => axis !== long)
    return [-1, 1].flatMap(first => [-1, 1].map(second => {
      const center = vector(0), halfSize = { ...extent }
      short.forEach((axis, index) => {
        center[axis] = Math.max(0, extent[axis] - thickness) * (index ? second : first)
        halfSize[axis] = Math.min(extent[axis], thickness)
      })
      return boxDistance(map(point, center, (a, b) => a - b) as Vector, halfSize)
    }))
  }))
}

describe('Builder frames and procedural lattices', () => {
  it.each([.08, 1.4])('matches twelve-edge geometry at frame thickness %s, including a filled frame', thickness => {
    const extent = vector(.7, 1.1, .9)
    const sample = distanceProbe(fixture({ type: 'box-frame', width: extent.x, height: extent.y, depth: extent.z, thickness }))
    for (const x of [-1.2, -.7, -.63, 0, .69, 1]) for (const y of [-1.3, -.7, 0, 1.07]) for (const z of [-1, -.81, 0, .87, 1.3]) {
      const point = vector(x, y, z)
      expect(sample(point)).toBeCloseTo(edgeDistance(point, extent, thickness), 6)
    }
    expect(sample(vector(0))).toBeGreaterThan(thickness < .7 ? 0 : -2)
  })

  it.each([1, 1.99, 2])('matches explicitly mirrored frame segments for %s levels without rounding', iterations => {
    const spacing = .3, thickness = .002
    const sample = distanceProbe(fixture({ type: 'lattice', iterations, spacing, thickness }))
    let centers = [0]
    // Build explicit mirrored geometry from the innermost stage outward.
    const offsets = Array.from({ length: Math.floor(iterations) }, (_, index) => spacing * 2 ** (iterations - 1 - index)).reverse()
    for (const offset of offsets) centers = centers.flatMap(center => [offset + center, -offset - center])
    const extent = vector(spacing)
    for (const point of [vector(0), vector(.31, .29, 0), vector(.6, .6, .6), vector(.9, -.3, 0), vector(1.4, .2, -.8)]) {
      const expected = Math.min(...centers.flatMap(x => centers.flatMap(y => centers.map(z =>
        edgeDistance(vector(point.x - x, point.y - y, point.z - z), extent, 0))))) - thickness
      expect(sample(point)).toBeCloseTo(expected, 6)
    }
  })

  it('keeps thin lattice rods finite and converges without expanding the march budget', () => {
    const document = fixture({ type: 'lattice', iterations: 1, spacing: .3, thickness: .0001 })
    document.objects[0].transform.scale.x = .01
    const sample = distanceProbe(document)
    let z = 5.5, count = 0
    for (; count < 96; count++) {
      const distance = sample(vector(0, 0, z))
      expect(Number.isFinite(distance)).toBe(true)
      if (distance < .00001) break
      z -= distance * .7
    }
    expect(count).toBeLessThan(20)
    expect(z).toBeCloseTo(.6001, 4)
    expect(sample(vector(.003, .3, 0))).toBeGreaterThan(0)
  })

  it('charges procedural work per arranged copy using the unchanged work limit', () => {
    const document = fixture({ type: 'lattice', iterations: 5, spacing: .3, thickness: .02 })
    document.objects[0].arrangements = [{ type: 'linear', axis: 'x', count: 5, spacing: 3 }, { type: 'linear', axis: 'y', count: 2, spacing: 3 }]
    expect(compileBuilderDocument(document).workload).toMatchObject({ expandedPrimitives: 10, modifierOperations: 80 })
    document.objects[0].arrangements[0].count = 6
    expect(() => compileBuilderDocument(document)).toThrow('modifierOperations requires 96; maximum is 80')
    document.objects[0].operation = { type: 'box-frame', width: 1, height: 1, depth: 1, thickness: .08 }
    expect(compileBuilderDocument(document).workload).toMatchObject({ expandedPrimitives: 12, modifierOperations: 36 })
  })

  it('offers only geometry fields as animation targets and keeps numeric driver edits live', () => {
    const document = fixture({ type: 'lattice', iterations: 1.99, spacing: .3, thickness: .002 })
    const object = document.objects[0]
    expect(builderOperationFields(object.operation).find(field => field.key === 'iterations')?.animatable).toBe(false)
    expect(builderDriverTargetRange(object, 'operation.iterations')).toBeNull()
    expect(builderDriverTargetRange(object, 'operation.spacing')).toMatchObject({ minimum: .01, maximum: 10 })
    expect(builderDriverTargetRange(object, 'operation.thickness')).toMatchObject({ minimum: .0001, maximum: 3 })
    object.drivers = [{ target: 'operation.thickness', mode: 'add', expression: { type: 'constant', value: .02 } },
      { target: 'operation.spacing', mode: 'add', expression: { type: 'input', source: 'bass-level' } }]
    const first = compileBuilderPreviewDocument(document)
    object.drivers[0].expression = { type: 'constant', value: .04 }
    const second = compileBuilderPreviewDocument(document)
    expect(first.shader).toBe(second.shader)
    expect(first.uniforms).not.toEqual(second.uniforms)
    expect(() => normalizeCompiledShader(compileShader(first.shader))).not.toThrow()
  })

  it('preserves the chosen order for group and inherited object rotations', () => {
    const document = fixture({ type: 'box-frame', width: 1, height: 1, depth: 1, thickness: .08 })
    const frame = { position: vector(0), rotation: vector(.1, .2, .3), scale: 1 }
    document.objects[0].frame = { ...frame, rotationOrder: 'yxz' }
    document.composition = { version: 1, roots: ['g'], groups: [{ id: 'g', name: 'Frame', children: ['shape'],
      transform: { ...frame, rotationOrder: 'zyx' }, operation: { type: 'union' } }] }
    const shader = compileBuilderDocument(document).shader
    expect(shader).toContain('rotateX(0.1);rotateY(-(0.2));rotateZ(0.3);')
    expect(shader).toContain('rotateZ(0.3);rotateX(0.1);rotateY(-(0.2));')
    expect(() => normalizeCompiledShader(compileShader(shader))).not.toThrow()
  })
})

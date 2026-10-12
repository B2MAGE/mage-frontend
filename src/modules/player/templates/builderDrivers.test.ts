import { describe, expect, it, vi } from 'vitest'
import { builderDriverTargetRange, validateBuilderDriverExpression, validateBuilderDrivers } from './builderDrivers'
import { parseSceneDocument, type BuilderDriver, type BuilderDriverExpression, type BuilderSceneDocument } from './sceneContract'

const scalar = (value = 1): BuilderDriverExpression => ({ type: 'constant', value })
const driver = (expression: BuilderDriverExpression, target: BuilderDriver['target'] = 'rotation.y'): BuilderDriver => ({ target, mode: 'add', expression })
const scene = (drivers: BuilderDriver[] = []) => parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
  objects: [{ id: 'sphere', operation: { type: 'sphere' }, drivers }] }) as BuilderSceneDocument

describe('bounded Builder driver contract', () => {
  it('preserves ordered influences and exact numeric values across serialization', () => {
    const document = scene([driver({ type: 'multiply', left: { type: 'input', source: 'time' }, right: scalar(0.15) }),
      driver({ type: 'component', input: { type: 'input', source: 'view-ray' }, axis: 'y' }),
      driver({ type: 'input', source: 'bass-level' })])
    expect(parseSceneDocument(JSON.parse(JSON.stringify(document)))).toEqual(document)
    expect(validateBuilderDrivers(document)).toEqual({ driverOperations: 6, authoredDrivers: 3, driverUniforms: 2 })
  })

  it('allows typed vector math but requires scalar property outputs', () => {
    const vector: BuilderDriverExpression = { type: 'multiply', left: scalar(0.5), right: { type: 'input', source: 'local-position' } }
    expect(validateBuilderDriverExpression(vector)).toMatchObject({ type: 'vector', spatial: true })
    expect(() => scene([driver(vector)])).toThrow(/scalar/)
    expect(() => scene([driver({ type: 'component', input: vector, axis: 'z' })])).not.toThrow()
    expect(() => scene([driver({ type: 'add', left: vector, right: scalar() })])).toThrow(/matching/)
    expect(() => scene([driver({ type: 'component', input: scalar(), axis: 'x' })])).toThrow(/vector/)
  })

  it.each(['local-position', 'group-position', 'world-position', 'view-ray'] as const)('recognizes %s as spatial vector data', source => {
    expect(validateBuilderDriverExpression({ type: 'input', source })).toMatchObject({ type: 'vector', spatial: true })
  })

  it('rejects unknown operations, fields, sources, and accessors without invoking them', () => {
    for (const expression of [{ type: 'eval', value: 'alert(1)' }, { type: 'input', source: 'camera' },
      { type: 'constant', value: 1, code: 'anything' }, { type: 'constant', value: Number.POSITIVE_INFINITY }]) {
      expect(() => validateBuilderDriverExpression(expression)).toThrow()
    }
    const get = vi.fn(() => 'constant')
    expect(() => validateBuilderDriverExpression(Object.defineProperty({}, 'type', { get, enumerable: true }))).toThrow()
    expect(get).not.toHaveBeenCalled()
  })

  it('checks target availability and ordered clamp ranges', () => {
    expect(() => scene([driver(scalar(), 'operation.radius')])).not.toThrow()
    expect(() => scene([driver(scalar(), 'operation.width')])).toThrow(/unavailable/)
    expect(() => scene([driver({ type: 'clamp', input: scalar(), min: 2, max: 1 })])).toThrow(/minimum/)
    const group = { id: 'g', name: 'Group', children: ['sphere'], operation: { type: 'union' as const },
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 } }
    expect(builderDriverTargetRange(group, 'scale')).toEqual(expect.objectContaining({ minimum: 0.01 }))
    expect(builderDriverTargetRange(group, 'blend')).toBeNull()
    expect(builderDriverTargetRange(group, 'material.metalness')).toBeNull()
    expect(builderDriverTargetRange(group, 'scale.x')).toBeNull()
  })

  it('rejects expression depth and node overflow before expansion', () => {
    let expression = scalar()
    for (let depth = 1; depth < 8; depth++) expression = { type: 'sin', input: expression }
    expect(() => scene([driver(expression)])).not.toThrow()
    expect(() => scene([driver({ type: 'sin', input: expression })])).toThrow(/depth/)
    let wide = scalar()
    for (let layer = 0; layer < 5; layer++) wide = { type: 'add', left: wide, right: wide }
    expect(() => scene([driver(wide)])).toThrow(/nodes/)
  })

  it('counts arranged expressions and required live values against scene budgets', () => {
    const expression: BuilderDriverExpression = { type: 'clamp', input: { type: 'sin', input: { type: 'multiply',
      left: { type: 'input', source: 'time' }, right: scalar(2) } }, min: -1, max: 1 }
    const document = scene([driver(expression), driver(expression), driver(expression)])
    document.objects[0].arrangements = [{ type: 'linear', axis: 'x', count: 16, spacing: 1 }]
    expect(() => validateBuilderDrivers(document)).toThrow(/expanded driver work/)
    const costly = scene(Array.from({ length: 8 }, () => driver({ type: 'component', axis: 'x',
      input: { type: 'add', left: { type: 'constant', value: { x: 0, y: 1, z: 2 } }, right: { type: 'constant', value: { x: 0, y: 1, z: 2 } } } })))
    costly.objects.push({ ...structuredClone(costly.objects[0]), id: 'second' })
    expect(() => validateBuilderDrivers(costly)).toThrow(/uniforms/)
  })
})

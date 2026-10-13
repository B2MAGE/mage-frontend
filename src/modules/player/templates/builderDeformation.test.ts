import { describe, expect, it } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { normalizeCompiledShader } from '@notrac/mage/compiled-shader'
import { compileBuilderDocument, compileBuilderPreviewDocument } from './builderCompiler'
import { validateBuilderDriverExpression, validateBuilderDrivers } from './builderDrivers'
import { parseSceneDocument, type BuilderDriverExpression, type BuilderSceneDocument } from './sceneContract'
import { sceneStructuralContent } from '../liveSceneSettings'

const noise: BuilderDriverExpression = { type: 'noise', input: { type: 'input', source: 'local-position' } }
const parse = (objects: unknown[], composition?: unknown) => parseSceneDocument({
  schemaVersion: 1, kind: 'builder', builderVersion: 1, objects, ...(composition ? { composition } : {}),
}) as BuilderSceneDocument
const object = () => ({ id: 'shape', operation: { type: 'sphere', radius: 1 },
  modifiers: [{ type: 'expand', amount: 0.2 }],
  drivers: [{ target: 'modifier.expand.amount', mode: 'multiply', expression: noise }] })

describe('scoped Builder deformation and procedural color', () => {
  it('round-trips exact signed numeric channels without hex quantization', () => {
    const color = { x: .08256470259178794, y: -.782309705948631, z: .763003005740327 }
    const scene = parse([{ ...object(), material: { color } }])
    expect(parseSceneDocument(JSON.parse(JSON.stringify(scene)))).toEqual(scene)
    expect(scene.objects[0].material.color).toEqual(color)
    expect(compileBuilderDocument(scene).shader).toContain(`color(${color.x},${color.y},${color.z})`)
    expect(() => parse([{ ...object(), material: { color: { ...color, z: 1.01 } } }])).toThrow()
  })

  it('compiles and hoists nested noise once per authored node and arrangement copy', () => {
    const nested: BuilderDriverExpression = { type: 'noise', input: { type: 'multiply',
      left: { type: 'input', source: 'local-position' }, right: noise } }
    const scene = parse([{ ...object(), drivers: [{ target: 'modifier.expand.amount', mode: 'multiply', expression: nested }],
      arrangements: [{ type: 'linear', axis: 'x', count: 2, spacing: 1 }] }])
    expect(validateBuilderDriverExpression(nested)).toMatchObject({ type: 'scalar', nodes: 5, operations: 19 })
    expect(validateBuilderDrivers(scene).driverOperations).toBe(38)
    const compiled = compileBuilderDocument(scene)
    expect(compiled.shader.match(/=noise\(/g)).toHaveLength(4)
    expect(compiled.shader).not.toContain('builder_bound_distance')
    expect(() => normalizeCompiledShader(compileShader(compiled.shader))).not.toThrow()
    scene.objects[0].arrangements[0].count = 16
    expect(() => compileBuilderDocument(scene)).toThrow(/expanded driver work/)
  })

  it('requires a vector noise input and only accepts valid ancestor selectors', () => {
    expect(() => validateBuilderDriverExpression({ type: 'noise', input: { type: 'input', source: 'time' } })).toThrow(/vector/)
    for (const source of ['time', 'local-position', 'world-position']) {
      expect(() => validateBuilderDriverExpression({ type: 'input', source, ancestor: 2 })).toThrow(/ancestor/)
    }
    for (const ancestor of [0, 7, 1.5]) {
      expect(() => validateBuilderDriverExpression({ type: 'input', source: 'group-position', ancestor })).toThrow(/ancestor/)
    }
  })

  it('applies group distance operations after all children and scales expansion with the group', () => {
    const scene = parse([{ id: 'first', operation: { type: 'sphere' } }, { id: 'second', operation: { type: 'box' } }],
      { version: 1, roots: ['group'], groups: [{ id: 'group', children: ['first', 'second'], transform: { scale: 2 },
        modifiers: [{ type: 'expand', amount: .3 }, { type: 'shell', thickness: .1 }] }] })
    const result = compileBuilderDocument(scene)
    expect(result.workload.modifierOperations).toBe(3)
    const deformation = 'expand((0.3*2));shell((0.1*2));'
    expect(result.shader).toContain(deformation)
    expect(result.shader.indexOf(deformation)).toBeGreaterThan(result.shader.indexOf('builder_leaf_1();'))
    const artifact = normalizeCompiledShader(compileShader(result.shader))
    expect(artifact.frag.replace(/\/\/[^\n]*/g, '')).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('uses the requested captured ancestor, and world space when no such parent exists', () => {
    const scene = parse([object()], { version: 1, roots: ['outer'], groups: [
      { id: 'outer', children: ['inner'], transform: { scale: 2 } }, { id: 'inner', children: ['shape'] },
    ] })
    scene.objects[0].drivers![0].expression = { type: 'noise', input: { type: 'input', source: 'group-position', ancestor: 2 } }
    const compiled = compileBuilderDocument(scene)
    expect(compiled.shader).toMatch(/=noise\(vec3\(max\(-1000000,min\(1000000,builder_group_position_0.x\)/)
    const next = structuredClone(scene)
    next.objects[0].drivers![0].expression = { type: 'noise', input: { type: 'input', source: 'group-position', ancestor: 6 } }
    expect(compileBuilderDocument(next).shader).toMatch(/=noise\(vec3\(max\(-1000000,min\(1000000,builder_world_position.x\)/)
    expect(sceneStructuralContent(next)).not.toEqual(sceneStructuralContent(scene))
    expect(() => normalizeCompiledShader(compileShader(compiled.shader))).not.toThrow()
  })

  it('preserves signed ray colors and supports time-driven color through the same scalar targets', () => {
    const scene = parse([{ id: 'shape', operation: { type: 'sphere' }, drivers: [
      { target: 'material.color.r', mode: 'replace', expression: { type: 'component', input: { type: 'input', source: 'view-ray' }, axis: 'x' } },
      { target: 'material.color.g', mode: 'replace', expression: { type: 'sin', input: { type: 'input', source: 'time' } } },
    ] }])
    for (const compile of [compileBuilderDocument, compileBuilderPreviewDocument]) {
      const result = compile(scene)
      expect(result.shader).toContain('max(-1,min(1,builder_driver_o0_0_0))')
      expect(result.shader).toContain('color(builder_value_o0_0_0,builder_value_o0_0_1,')
      expect(() => normalizeCompiledShader(compileShader(result.shader))).not.toThrow()
    }
  })
})

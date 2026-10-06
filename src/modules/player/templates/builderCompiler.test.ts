import { describe, expect, it } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { normalizeCompiledShader } from '@notrac/mage/compiled-shader'
import { compileBuilderDocument } from './builderCompiler'
import { parseSceneDocument, type BuilderSceneDocument } from './sceneContract'

const operation = (index: number) => [
  { type: 'sphere', radius: 0.5 },
  { type: 'box', width: 0.5, height: 0.75, depth: 1 },
  { type: 'torus', radius: 0.8, tube: 0.15 },
  { type: 'cylinder', radius: 0.4, height: 1.2 },
][index % 4]

function document(objects = 4): BuilderSceneDocument {
  return parseSceneDocument({
    schemaVersion: 1, kind: 'builder', builderVersion: 1,
    objects: Array.from({ length: objects }, (_, index) => ({
      id: `object-${index}`,
      name: index === 0 ? 'Name containing sphere(999); is inert' : `Object ${index}`,
      operation: operation(index),
      transform: { position: { x: index * 0.25, y: 0, z: 0 }, rotation: { x: 0.1, y: 0.2, z: 0.3 }, scale: { x: 1, y: 1.5, z: 2 } },
      material: { color: '#8066ff', metalness: 0.2, shininess: 0.7 },
      bindings: [
        { target: 'position.x', source: 'bass-level' },
        { target: 'position.y', source: 'mid-hit' },
        { target: 'position.z', source: 'pointer-x' },
        { target: 'material.metalness', source: 'pointer-down' },
      ],
    })),
  }) as BuilderSceneDocument
}

describe('compileBuilderDocument', () => {
  it('generates deterministic renderer input from the approved version-one catalog', () => {
    const input = document()
    const first = compileBuilderDocument(input)
    const second = compileBuilderDocument(structuredClone(input))
    expect(second).toEqual(first)
    expect(first.shader).toContain('extractSDF(sphere)')
    expect(first.shader).toContain('builder_box_delta_1_0=abs(builder_box_space_1_0)-vec3(0.5,0.75,1)')
    expect(first.shader).not.toContain('extractSDF(box)')
    expect(first.shader).toContain('extractSDF(torus)')
    expect(first.shader).toContain('extractSDF(cylinder)')
    expect(first.shader).not.toContain(input.objects[0].name)
    expect(first.shader).not.toContain(input.objects[0].id)
    expect(first.workload).toEqual({ expandedPrimitives: 4, compositionOperations: 3,
      transformOperations: 20, materialOperations: 12, liveUniforms: 16,
      modifierOperations: 0, arrangementOperations: 0, animationOperations: 0,
      optionalEffects: 0, generatedSourceBytes: new TextEncoder().encode(first.shader).byteLength })
  })

  it('expands nested bounded arrangements and applies modifiers and spin to every copy', () => {
    const input = document(1)
    input.objects[0].arrangements = [
      { type: 'linear', axis: 'x', count: 2, spacing: 1.5 },
      { type: 'radial', axis: 'y', count: 3, radius: 2 },
    ]
    input.objects[0].modifiers = [
      { type: 'twist', axis: 'y', amount: 1.5 },
      { type: 'expand', amount: 0.2 },
      { type: 'shell', thickness: 0.1 },
    ]
    input.objects[0].motion = { type: 'spin', axis: 'z', speed: 0.5 }
    const compiled = compileBuilderDocument(input)
    expect(compiled.shader.match(/extractSDF\(sphere\)/g)).toHaveLength(6)
    expect(compiled.shader).toContain('rotateZ((0.3+time*0.5))')
    expect(compiled.shader).toContain('builder_twist_angle_0_0_0=builder_twist_space_0_0_0.y*1.5')
    expect(compiled.shader).toContain('abs((builder_distance_0_0-0.2))-0.1')
    expect(compiled.shader.indexOf('builder_twist_angle_0_0_0')).toBeLessThan(compiled.shader.indexOf('extractSDF(sphere)'))
    expect(compiled.shader.indexOf('extractSDF(sphere)')).toBeLessThan(compiled.shader.indexOf('abs((builder_distance_0_0-0.2))-0.1'))
    expect(compiled.workload).toMatchObject({ expandedPrimitives: 6, compositionOperations: 5,
      transformOperations: 30, materialOperations: 18, modifierOperations: 30,
      arrangementOperations: 5, animationOperations: 6 })
    expect(() => compileShader(compiled.shader)).not.toThrow()
  })

  it('accepts exactly 16 expanded copies and rejects the next one', () => {
    const input = document(2)
    input.objects[0].arrangements = [{ type: 'linear', axis: 'x', count: 8, spacing: 1 }]
    input.objects[1].arrangements = [{ type: 'radial', axis: 'y', count: 8, radius: 2 }]
    expect(compileBuilderDocument(input).workload.expandedPrimitives).toBe(16)

    const overBudget = document(3)
    overBudget.objects[0].arrangements = input.objects[0].arrangements
    overBudget.objects[1].arrangements = input.objects[1].arrangements
    expect(() => compileBuilderDocument(overBudget)).toThrow('expandedPrimitives requires 17; maximum is 16')
  })

  it('creates stable bounded uniforms only for declared live properties', () => {
    const compiled = compileBuilderDocument(document(1))
    expect(compiled.uniforms).toEqual([
      expect.objectContaining({ objectId: 'object-0', target: 'position.x', name: 'builder_o0_position_x', initialValue: 0, minimum: -100, maximum: 100 }),
      expect.objectContaining({ objectId: 'object-0', target: 'position.y', name: 'builder_o0_position_y', initialValue: 0, minimum: -100, maximum: 100 }),
      expect.objectContaining({ objectId: 'object-0', target: 'position.z', name: 'builder_o0_position_z', initialValue: 0, minimum: -100, maximum: 100 }),
      expect.objectContaining({ objectId: 'object-0', target: 'material.metalness', name: 'builder_o0_material_metalness', initialValue: 0.2, minimum: 0, maximum: 1 }),
    ])
    expect(compiled.shader.match(/input\(/g)).toHaveLength(4)
  })

  it('compiles a boundary scene to an artifact accepted by the patched engine', () => {
    const compiled = compileBuilderDocument(document(16))
    expect(compiled.workload.liveUniforms).toBe(64)
    expect(compiled.workload.expandedPrimitives).toBe(16)
    const artifact = compileShader(compiled.shader, { maxRaymarchIterations: 200 })
    expect(artifact.uniforms).toHaveLength(70)
    expect(() => normalizeCompiledShader(artifact, { maxRaymarchIterations: 200 })).not.toThrow()
  })

  it('compiles empty documents to an empty, valid renderer program', () => {
    const compiled = compileBuilderDocument(document(0))
    expect(compiled.uniforms).toEqual([])
    expect(compiled.workload.expandedPrimitives).toBe(0)
    expect(() => compileShader(compiled.shader)).not.toThrow()
  })
})

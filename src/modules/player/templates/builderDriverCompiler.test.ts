import { describe, expect, it } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { normalizeCompiledShader } from '@notrac/mage/compiled-shader'
import { compileBuilderDocument, compileBuilderPreviewDocument } from './builderCompiler'
import { parseSceneDocument, type BuilderDriver, type BuilderDriverExpression, type BuilderSceneDocument } from './sceneContract'
import { extractLiveSceneSettings, sceneStructuralContent, validateLiveSceneSettings } from '../liveSceneSettings'
import { assertBuilderUniformManifest } from './builderUniformValues'
import { createBuilderRecipe } from '../../scene-editor/builderRecipes'

const constant = (value: number): BuilderDriverExpression => ({ type: 'constant', value })
const driver = (expression: BuilderDriverExpression, target: BuilderDriver['target'] = 'rotation.y', mode: BuilderDriver['mode'] = 'add'): BuilderDriver => ({ target, mode, expression })
function fixture(drivers: BuilderDriver[] = []): BuilderSceneDocument {
  return parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
    objects: [{ id: 'shape', operation: { type: 'cylinder' }, drivers }],
  }) as BuilderSceneDocument
}

describe('bounded Builder driver compilation', () => {
  it('compiles time, music, pointer and arithmetic through trusted inputs with no authored source', () => {
    const scene = fixture([
      driver({ type: 'multiply', left: { type: 'input', source: 'time' }, right: constant(0.2) }),
      driver({ type: 'input', source: 'bass-level' }, 'scale.y'),
      driver({ type: 'input', source: 'pointer-x' }),
      driver({ type: 'clamp', input: { type: 'sin', input: { type: 'input', source: 'time' } }, min: 0.1, max: 2 }, 'operation.radius', 'multiply'),
    ])
    const compiled = compileBuilderPreviewDocument(scene)
    expect(compiled.shader).toContain('time-floor(time/86400)*86400')
    expect(compiled.shader).toContain('floor(')
    expect(compiled.shader).not.toContain('scene.objects')
    expect(compiled.uniforms.filter(value => value.target === 'driver-signal')).toHaveLength(2)
    expect(compiled.workload.authoredDrivers).toBe(4)
    expect(() => normalizeCompiledShader(compileShader(compiled.shader))).not.toThrow()
  })

  it('keeps constant, range and vector-component numeric edits live with exact slot validation', () => {
    const scene = fixture([driver({ type: 'clamp', input: { type: 'component', axis: 'y',
      input: { type: 'constant', value: { x: 1, y: 2, z: 3 } } }, min: -2, max: 4 })])
    const next = structuredClone(scene)
    next.objects[0].drivers![0].expression = { type: 'clamp', input: { type: 'component', axis: 'y',
      input: { type: 'constant', value: { x: 1, y: 4, z: 3 } } }, min: -1, max: 5 }
    expect(sceneStructuralContent(next)).toEqual(sceneStructuralContent(scene))
    const before = extractLiveSceneSettings(scene), after = extractLiveSceneSettings(next)
    expect(after.builderUniforms).not.toEqual(before.builderUniforms)
    expect(() => assertBuilderUniformManifest(after.builderUniforms!, compileBuilderPreviewDocument(scene).uniforms)).not.toThrow()
    expect(() => validateLiveSceneSettings({ ...after, builderUniforms: after.builderUniforms!.map((entry, index) =>
      index === 0 ? { ...entry, driverSlot: 63 } : entry) })).not.toThrow()
    expect(() => assertBuilderUniformManifest(after.builderUniforms!.map((entry, index) =>
      index === 0 ? { ...entry, driverSlot: 63 } : entry), compileBuilderPreviewDocument(scene).uniforms)).toThrow()
  })

  it('recompiles when a driver input changes so the loaded audio channel cannot stay stale', () => {
    const scene = fixture([driver({ type: 'input', source: 'bass-level' }, 'scale.x')])
    const next = structuredClone(scene)
    next.objects[0].drivers![0].expression = { type: 'input', source: 'treble-level' }
    expect(sceneStructuralContent(next)).not.toEqual(sceneStructuralContent(scene))
  })

  it('uses actual per-pixel view rays and separate world, group and baseline local frames', () => {
    const scene = fixture(['view-ray', 'world-position', 'group-position', 'local-position'].map(source => driver({ type: 'component', axis: 'x',
      input: { type: 'cos', input: { type: 'multiply', left: { type: 'input', source: source as 'view-ray' }, right: constant(0.2) } } })))
    scene.composition = { version: 1, roots: ['group'], groups: [{ id: 'group', name: 'Group', children: ['shape'],
      transform: { position: { x: 1, y: 0, z: 0 }, rotation: { x: 0, y: 0.5, z: 0 }, scale: 2 }, operation: { type: 'union' } }] }
    const compiled = compileBuilderPreviewDocument(scene)
    expect(compiled.shader).toContain('getRayDirection()')
    expect(compiled.shader).toContain('builder_world_position')
    expect(compiled.shader).toContain('builder_group_position_0')
    expect(compiled.shader).toContain('builder_local_position_0_0')
    expect(compiled.shader).not.toContain('cameraPosition')
    expect(compiled.workload.transformOperations).toBe(15)
    expect(() => normalizeCompiledShader(compileShader(compiled.shader))).not.toThrow()
  })

  it('applies group drivers to transformations, blend and an inherited material', () => {
    const scene = fixture()
    scene.composition = { version: 1, roots: ['group'], groups: [{ id: 'group', name: 'Group', children: ['shape'],
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 },
      operation: { type: 'smooth-union', blend: 0.2 }, material: { color: '#888888', metalness: 0.2, shininess: 0.5 },
      drivers: [driver(constant(0.5), 'scale'), driver(constant(0.8), 'material.metalness', 'replace')],
    }] }
    const compiled = compileBuilderPreviewDocument(scene)
    expect(compiled.shader).toContain('metal(builder_value_g0_1)')
    expect(() => compileShader(compiled.shader)).not.toThrow()
  })

  it('compiles the editable Alloy Capsule recipe within the existing mobile and uniform budgets', () => {
    const scene = createBuilderRecipe('embedded-scene-5')
    const compiled = compileBuilderPreviewDocument(scene)
    expect(compiled.workload.expandedPrimitives).toBe(3)
    expect(compiled.workload.liveUniforms).toBeLessThanOrEqual(64)
    expect(compiled.workload.driverOperations).toBeLessThanOrEqual(192)
    expect(() => normalizeCompiledShader(compileShader(compiled.shader, { maxRaymarchIterations: 96 }), { maxRaymarchIterations: 96 })).not.toThrow()
    expect(compiled.shader).toContain('getRayDirection().y')
    expect(compiled.shader).not.toContain('embedded-scene-5')
  })

  it('preserves Alloy constituent proportions and material at the documented size 0.6 reference', () => {
    // Fixed coefficients come from the checked-in version-one Alloy template.
    // Current Builder motion is intentionally measured using its own frame convention.
    const scene = createBuilderRecipe('embedded-scene-5')
    const referenceSize = 0.6
    expect(scene.parameters.scale).toBe(1)
    expect(scene.objects[0].operation).toMatchObject({ type: 'cylinder' })
    const cylinder = scene.objects[0].operation as { radius: number; height: number }
    expect(cylinder.radius).toBeCloseTo(0.9446738625954518 * referenceSize, 8)
    expect(cylinder.height).toBeCloseTo(0.9446738625954518 * referenceSize, 8)
    expect((scene.objects[1].operation as { radius: number }).radius).toBeCloseTo(0.7023682612074287 * referenceSize, 8)
    expect((scene.objects[2].operation as { radius: number }).radius).toBeCloseTo(referenceSize / 3, 8)
    for (const object of scene.objects) {
      expect(object.transform.position).toEqual({ x: 0, y: 0, z: 0 })
      expect(object.material.color).toBe('#3d4437')
      expect(object.material.metalness).toBeCloseTo(0.6304962928840792 * referenceSize, 8)
      expect(object.material.shininess).toBeCloseTo(0.6210181878056416, 8)
    }
    expect(scene.composition!.roots).toEqual(['capsule-motion'])
    expect(scene.composition!.groups[0].children).toEqual(['capsule-view'])
    expect(scene.composition!.groups[1].children).toEqual(['capsule-body', 'capsule-inner-sphere'])
    expect(scene.composition!.groups[2].children).toEqual(['capsule-cylinder', 'capsule-outer-sphere'])
    const shader = compileBuilderPreviewDocument(scene).shader
    expect(shader.indexOf('builder_frame_g0')).toBeLessThan(shader.indexOf('builder_frame_g1'))
    expect(shader.indexOf('builder_frame_g1')).toBeLessThan(shader.indexOf('builder_frame_g2'))
    expect(shader.indexOf('builder_frame_g2')).toBeLessThan(shader.indexOf('extractSDF(cylinder)'))
    expect(shader.indexOf('extractSDF(cylinder)')).toBeLessThan(shader.indexOf('extractSDF(sphere)'))
  })

  it('emits a linear sequence for eight influences on the same property', () => {
    const scene = fixture(Array.from({ length: 8 }, () => driver(constant(0.2))))
    const compiled = compileBuilderPreviewDocument(scene)
    expect(compiled.shader.match(/let builder_value_o0_0_/g)).toHaveLength(8)
    expect(compiled.workload.generatedSourceBytes).toBeLessThan(6000)
    expect(() => compileShader(compiled.shader)).not.toThrow()
  })

  it('rejects forged driver trees independently at compiler entry and counts expanded work', () => {
    const scene = fixture([driver(constant(1))])
    ;(scene.objects[0].drivers![0].expression as unknown as { type: string }).type = 'eval'
    expect(() => compileBuilderDocument(scene)).toThrow(/unsupported driver operation/)
    const copies = fixture([driver({ type: 'sin', input: { type: 'multiply', left: { type: 'input', source: 'time' }, right: constant(0.2) } })])
    copies.objects[0].arrangements = [{ type: 'linear', axis: 'x', count: 8, spacing: 1 }]
    expect(compileBuilderDocument(copies).workload.driverOperations).toBe(32)
  })
})

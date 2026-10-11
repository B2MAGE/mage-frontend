import { describe, expect, it } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { normalizeCompiledShader } from '@notrac/mage/compiled-shader'
import { builderCompositionNodes, builderCompositionRoots } from './builderComposition'
import { compileBuilderDocument, compileBuilderPreviewDocument } from './builderCompiler'
import { assertBuilderUniformManifest, builderUniformValues, validateBuilderUniformValues } from './builderUniformValues'
import { parseSceneDocument, type BuilderSceneDocument } from './sceneContract'

const objects = [
  { id: 'red', name: 'sphere(999) remains inert', operation: { type: 'sphere' }, material: { color: '#ff0000' }, transform: { position: { x: -0.75 } } },
  { id: 'blue', operation: { type: 'sphere' }, material: { color: '#0000ff' }, transform: { position: { x: 0.75 } } },
  { id: 'other', operation: { type: 'box' }, transform: { position: { z: -2 } } },
]
const parse = (composition?: unknown) => parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
  objects, ...(composition === undefined ? {} : { composition }) }) as BuilderSceneDocument
const grouped = () => parse({ version: 1, roots: ['outer', 'other'], groups: [
  { id: 'outer', name: 'Parent', children: ['red', 'inner'], operation: { type: 'smooth-union', blend: 0.4 },
    transform: { position: { x: 2 }, rotation: { x: 0.1, y: 0.2, z: 0.3 }, scale: 2 } },
  { id: 'inner', children: ['blue'], transform: { scale: 0.5 } },
] })

describe('Builder composition compilation', () => {
  it('keeps stable registry addresses and reads explicit forest order independently', () => {
    const document = grouped()
    expect(builderCompositionRoots(document)).toEqual(['outer', 'other'])
    expect(builderCompositionNodes(document).get('blue')).toMatchObject({ kind: 'object', index: 1 })
    expect(builderCompositionNodes(document).get('inner')).toMatchObject({ kind: 'group', index: 1 })
    expect(builderCompositionRoots(parse())).toEqual(['red', 'blue', 'other'])
  })

  it('compiles bounded nested transforms, composition, and materials with the packaged engine', () => {
    const document = grouped()
    document.objects[1].modifiers = [{ type: 'twist', axis: 'y', amount: 0.5 }, { type: 'expand', amount: 0.1 }]
    document.objects[1].arrangements = [{ type: 'linear', axis: 'x', count: 2, spacing: 1 }]
    document.objects[1].motion = { type: 'spin', axis: 'z', speed: 0.5 }
    const compiled = compileBuilderDocument(document)
    expect(compiled.workload).toMatchObject({ expandedPrimitives: 4, compositionOperations: 3,
      groups: 2, groupDepth: 2, transformOperations: 30, materialOperations: 12, animationOperations: 2 })
    expect(compiled.shader).toContain('rotateZ(0.3);rotateY(-(0.2));rotateX(0.1);')
    expect(compiled.shader).toContain('builder_frame_g0/2')
    expect(compiled.shader).toContain('let builder_blend_0_1=(0.4*2)')
    expect(compiled.shader).not.toContain(document.objects[0].name)
    expect(compiled.shader).not.toContain('outer')
    expect(compiled.shader.indexOf('builder_frame_g0')).toBeLessThan(compiled.shader.indexOf('builder_frame_g1'))
    expect(() => normalizeCompiledShader(compileShader(compiled.shader))).not.toThrow()
  })

  it('captures the previous distance before adding a sibling and preserves nearest-child materials', () => {
    const shader = compileBuilderDocument(grouped()).shader
    expect(shader).toContain('let builder_prior_0_1=getSDF()+0;')
    expect(shader).toContain('mixMat(1);setSDF(')
    expect(shader).toContain(');resetMixColor();')
    expect(shader).not.toContain('overwrite(')
    const artifact = compileShader(shader)
    // A captured scalar is emitted before the next child scope. A bare
    // getSDF reference would read the already-updated union here instead.
    const geo = artifact.geoGLSL.slice(artifact.geoGLSL.lastIndexOf('float surfaceDistance'))
    const capture = geo.match(/float (v_\d+) = \(scope_1_d\+v_\d+\);/)
    expect(capture).not.toBeNull()
    expect(geo.indexOf(capture![0])).toBeLessThan(geo.indexOf('float scope_4_d'))
    expect(artifact.colorGLSL).toContain('blendMaterial(scope_1_currentMaterial, scope_1_material, 1.00000000)')
    expect(artifact.colorGLSL).toMatch(/if \(prim_\d+ < scope_1_d\) \{ scope_1_material = scope_\d+_material; \}/)
  })

  it('treats zero smoothing as exact union without a division by zero or recompilation', () => {
    const document = grouped()
    const before = compileBuilderPreviewDocument(document)
    document.composition!.groups[0].operation = { type: 'smooth-union', blend: 0 }
    const after = compileBuilderPreviewDocument(document)
    expect(after.shader).toBe(before.shader)
    expect(after.uniforms).toContainEqual(expect.objectContaining({ groupIndex: 0, target: 'blend', initialValue: 0 }))
    expect(after.shader).toContain('/(builder_blend_0_1+(1-sign(builder_blend_0_1)))')
    expect(after.shader).not.toMatch(/\bblend\(/)
    expect(() => normalizeCompiledShader(compileShader(after.shader))).not.toThrow()
  })

  it('keeps group transform and override material numeric changes live, with outer material winning', () => {
    const document = grouped()
    document.composition!.groups[0].material = { color: '#00ff00', metalness: 0.2, shininess: 0.7 }
    document.composition!.groups[1].material = { color: '#ffff00', metalness: 0.9, shininess: 0.1 }
    const before = compileBuilderPreviewDocument(document)
    document.composition!.groups[0].transform.scale = 3
    document.composition!.groups[0].transform.position.x = 4
    document.composition!.groups[0].material!.metalness = 0.8
    const after = compileBuilderPreviewDocument(document)
    expect(after.shader).toBe(before.shader)
    expect(after.shader.match(/color\(0,1,0\)/g)).toHaveLength(2)
    expect(after.shader).not.toContain('color(1,1,0)')
    expect(after.shader.match(/metal\(builder_g0_material_metalness\)/g)).toHaveLength(2)
    expect(after.uniforms).toContainEqual(expect.objectContaining({ groupIndex: 0, target: 'scale', initialValue: 3 }))
    expect(after.workload.materialOperations).toBe(15)
  })

  it('applies a saved object frame outside all arrangements, local deformation, and spin', () => {
    const document = parse()
    document.objects[0].frame = { position: { x: 2, y: 3, z: 4 }, rotation: { x: 0, y: 0.5, z: 0 }, scale: 2 }
    document.objects[0].arrangements = [{ type: 'linear', axis: 'x', count: 2, spacing: 1 }]
    document.objects[0].motion = { type: 'spin', axis: 'y', speed: 0.5 }
    const compiled = compileBuilderDocument(document)
    expect(compiled.shader.match(/builder_frame_o0=getSpace/g)).toHaveLength(1)
    expect(compiled.shader.indexOf('builder_frame_o0')).toBeLessThan(compiled.shader.indexOf('let builder_object_0_0'))
    expect(compiled.shader).toContain('*(min(1,min(1,1))*2)')
    expect(compiled.workload.transformOperations).toBe(25)
    expect(() => normalizeCompiledShader(compileShader(compiled.shader))).not.toThrow()
  })

  it('keeps group and object live addresses disjoint and checks the exact loaded manifest', () => {
    const manifest = compileBuilderPreviewDocument(grouped()).uniforms
    const values = builderUniformValues(manifest)
    expect(validateBuilderUniformValues(values)).toEqual(values)
    expect(() => assertBuilderUniformManifest(values, manifest)).not.toThrow()
    expect(() => validateBuilderUniformValues([{ groupIndex: 8, target: 'scale', value: 1 }])).toThrow()
    expect(() => validateBuilderUniformValues([{ groupIndex: 0, objectIndex: 0, target: 'scale', value: 1 }])).toThrow()
    expect(() => validateBuilderUniformValues([{ groupIndex: 0, target: 'scale.x', value: 1 }])).toThrow()
    expect(() => validateBuilderUniformValues([{ groupIndex: 0, target: 'blend', value: -0.1 }])).toThrow()
    expect(() => assertBuilderUniformManifest(values.map(value => 'groupIndex' in value
      ? { ...value, groupIndex: 7 } : value), manifest)).toThrow()
  })

  it('accounts for every group and preserved frame at the full composition boundary', () => {
    const input = parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
      objects: Array.from({ length: 16 }, (_, index) => ({ id: `o${index}`, operation: { type: 'sphere' }, frame: {} })),
      composition: { version: 1, roots: Array.from({ length: 8 }, (_, index) => `g${index}`),
        groups: Array.from({ length: 8 }, (_, index) => ({ id: `g${index}`, children: [`o${index * 2}`, `o${index * 2 + 1}`],
          operation: { type: 'smooth-union', blend: 0.2 }, material: {} })) },
    }) as BuilderSceneDocument
    const compiled = compileBuilderPreviewDocument(input)
    expect(compiled.workload).toMatchObject({ expandedPrimitives: 16, compositionOperations: 15,
      transformOperations: 200, materialOperations: 72, groups: 8, groupDepth: 1, liveUniforms: 64 })
    expect(compiled.workload.generatedSourceBytes).toBeLessThanOrEqual(32768)
    expect(() => normalizeCompiledShader(compileShader(compiled.shader))).not.toThrow()
  })
})

import { describe, expect, it } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { normalizeCompiledShader } from '@notrac/mage/compiled-shader'
import { compileBuilderDocument, compileBuilderPreviewDocument } from './builderCompiler'
import { createBuilderDriverCompilation } from './builderDriverCompiler'
import { builderDriverResultRange, validateBuilderDriverExpression, validateBuilderDrivers } from './builderDrivers'
import { parseSceneDocument, type BuilderDriver, type BuilderDriverExpression, type BuilderSceneDocument } from './sceneContract'
import { BUILDER_RECIPES, createBuilderRecipe } from '../../scene-editor/builderRecipes'

const input = (source: Extract<BuilderDriverExpression, { type: 'input' }>['source']): BuilderDriverExpression => ({ type: 'input', source })
const driver = (target: BuilderDriver['target'], expression: BuilderDriverExpression): BuilderDriver => ({ target, mode: 'replace', expression })
const scene = (drivers: BuilderDriver[]) => parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
  objects: [{ id: 'frame', operation: { type: 'box-frame' }, drivers }],
}) as BuilderSceneDocument

describe('Builder native scene inputs', () => {
  it('reads shared engine size and pointer inputs without creating additional mapped signals', () => {
    const document = scene([
      driver('operation.width', input('scene-size')),
      driver('operation.height', input('scene-size')),
      driver('operation.depth', input('scene-pointer-down')),
      driver('operation.thickness', input('scene-pointer-down')),
      ...(['x', 'y', 'z'] as const).map(axis => driver(`rotation.${axis}`, {
        type: 'component', axis, input: input('scene-pointer'),
      })),
    ])
    expect(validateBuilderDrivers(document)).toMatchObject({ driverUniforms: 2, authoredDrivers: 7 })
    for (const compile of [compileBuilderDocument, compileBuilderPreviewDocument]) {
      const result = compile(document)
      expect(result.uniforms.filter(uniform => uniform.target === 'driver-signal')).toHaveLength(0)
      expect(result.shader.match(/let size = input\(\);/g)).toHaveLength(1)
      expect(result.shader.match(/let pointerDown = input\(\);/g)).toHaveLength(1)
      expect(result.shader).toContain('let builder_driver_o0_0_4=mouse.x;')
      expect(result.shader).toContain('let builder_driver_o0_0_5=mouse.y;')
      expect(result.shader).toContain('let builder_driver_o0_0_6=0;')
      const artifact = normalizeCompiledShader(compileShader(result.shader))
      expect(artifact.frag).toContain('mouse')
      expect(artifact.frag).toContain('pointerDown')
      expect(artifact.frag).toContain('size')
    }
  })

  it('requires extracting a component of the native pointer vector and treats native size as scalar', () => {
    expect(validateBuilderDriverExpression(input('scene-pointer'))).toMatchObject({ type: 'vector', spatial: false, signals: new Set() })
    expect(validateBuilderDriverExpression(input('scene-size'))).toMatchObject({ type: 'scalar', spatial: false, signals: new Set() })
    expect(validateBuilderDriverExpression(input('scene-pointer-down'))).toMatchObject({ type: 'scalar', spatial: false, signals: new Set() })
    expect(() => scene([driver('rotation.x', input('scene-pointer'))])).toThrow(/scalar/)
    expect(() => scene([driver('rotation.x', { type: 'component', axis: 'x', input: input('scene-size') })])).toThrow(/vector/)
  })

  it('reserves native scalar uniforms before filling the preview property budget', () => {
    const document = scene([
      driver('operation.width', input('scene-size')),
      driver('operation.thickness', input('scene-pointer-down')),
    ])
    document.objects = Array.from({ length: 6 }, (_, index) => ({ ...structuredClone(document.objects[0]), id: `frame-${index}` }))
    const result = compileBuilderPreviewDocument(document)
    expect(result.workload.liveUniforms).toBe(64)
    expect(result.uniforms).toHaveLength(62)
    expect(result.uniforms.filter(uniform => uniform.target === 'driver-signal')).toHaveLength(0)
    const artifact = normalizeCompiledShader(compileShader(result.shader))
    expect(artifact.uniforms.filter(uniform => uniform.name === 'size')).toHaveLength(1)
    expect(artifact.uniforms.filter(uniform => uniform.name === 'pointerDown')).toHaveLength(1)
  })

  it('counts native inputs at the required 64-uniform validation boundary', () => {
    const document = scene([])
    const vectorComponent: BuilderDriverExpression = { type: 'component', axis: 'x', input: { type: 'constant', value: { x: 1, y: 2, z: 3 } } }
    document.objects = Array.from({ length: 3 }, (_, index) => ({ ...structuredClone(document.objects[0]), id: `frame-${index}`,
      drivers: Array.from({ length: 7 }, () => driver('rotation.x', structuredClone(vectorComponent))),
    }))
    document.objects[0].drivers!.push(driver('operation.width', input('scene-size')))
    document.objects[1].drivers!.push(driver('operation.width', input('scene-pointer-down')))
    // 21 vector constants take 63 slots, plus the two shared native scalars.
    expect(() => validateBuilderDrivers(document)).toThrow(/64 uniforms/)
    expect(() => compileBuilderDocument(document)).toThrow(/64 uniforms/)
    document.objects[0].drivers![0].expression = { type: 'add',
      left: { type: 'constant', value: 1 }, right: { type: 'constant', value: 2 },
    }
    expect(validateBuilderDrivers(document).driverUniforms).toBe(64)
    const result = compileBuilderPreviewDocument(document)
    expect(result.workload.liveUniforms).toBe(64)
    expect(result.uniforms).toHaveLength(62)
    expect(() => normalizeCompiledShader(compileShader(result.shader))).not.toThrow()
  })

  it.each(BUILDER_RECIPES.map(recipe => recipe.templateId))(
    'packages the native-input %s recipe within the existing uniform limit', templateId => {
      const document = createBuilderRecipe(templateId)
      for (const compile of [compileBuilderDocument, compileBuilderPreviewDocument]) {
        const result = compile(document)
        expect(result.workload.liveUniforms).toBeLessThanOrEqual(64)
        expect(result.uniforms.length + 2).toBe(result.workload.liveUniforms)
        const artifact = normalizeCompiledShader(compileShader(result.shader))
        expect(artifact.uniforms.filter(uniform => uniform.name.startsWith('builder_')).length).toBe(result.uniforms.length)
        expect(artifact.uniforms.filter(uniform => uniform.name === 'size' || uniform.name === 'pointerDown')).toHaveLength(2)
      }
    },
  )

  it.each([.00005, 0, -.002])('retains native signed primitive dimensions %s while keeping transform scales positive', value => {
    const document = scene([
      driver('operation.width', input('scene-size')),
      driver('operation.thickness', input('scene-pointer-down')),
      driver('scale.x', input('scene-size')),
    ])
    const object = document.objects[0]
    const compilation = createBuilderDriverCompilation(document, false)
    const owner = compilation.owner(object, 'test', { local: 'local', group: 'group', world: 'world' })
    const width = owner.apply('operation.width', '1')
    const thickness = owner.apply('operation.thickness', '.08')
    const scale = owner.apply('scale.x', '1')
    // Evaluate only the compiler's trusted straight-line driver assignments, with
    // controlled numeric engine inputs, to verify behavior at and below zero.
    const evaluate = new Function('size', 'pointerDown', 'max', 'min', `${owner.declarations}return [${width},${thickness},${scale}];`)
    const values = evaluate(value, value, Math.max, Math.min)
    expect(values).toEqual([value, value, .01])
    expect(builderDriverResultRange(object, object.drivers![2]).minimum).toBe(.01)
    const compiled = compileBuilderDocument(document)
    expect(compiled.shader).not.toContain('builder_bound_distance_0_0')
    expect(() => normalizeCompiledShader(compileShader(compiled.shader))).not.toThrow()
  })
})

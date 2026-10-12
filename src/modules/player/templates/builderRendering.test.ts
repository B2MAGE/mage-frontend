import { describe, expect, it } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import { COMPILED_SHADER_LIMITS, normalizeCompiledShader } from '@notrac/mage/compiled-shader'
import { compileBuilderDocument, compileBuilderPreviewDocument } from './builderCompiler'
import { BUILDER_RENDER_SETTINGS } from './builderDefinitions'
import { parseSceneDocument, type BuilderRenderSettings, type BuilderSceneDocument } from './sceneContract'
import { parseSceneImport, SCENE_RUNTIME_CEILINGS, validateSceneForStorage } from '../policy/sceneValidation'

const input = (rendering?: unknown) => ({ schemaVersion: 1, kind: 'builder', builderVersion: 1,
  objects: [{ id: 'frame', operation: { type: 'box-frame' } }],
  ...(rendering === undefined ? {} : { rendering }) })
const document = (rendering?: unknown) => parseSceneDocument(input(rendering)) as BuilderSceneDocument

describe('Builder authored rendering settings', () => {
  it('keeps existing documents absent and their original rendering defaults unchanged', () => {
    const original = document()
    expect(original).not.toHaveProperty('rendering')
    expect(validateSceneForStorage(original)).not.toHaveProperty('rendering')
    expect(compileBuilderDocument(original).shader).toMatch(/^setMaxIterations\(96\);setStepSize\(0.7\);/)
    expect(document({}).rendering).toEqual({ maxIterations: 96, stepSize: .7 })
    expect(document({ maxIterations: 151 }).rendering).toEqual({ maxIterations: 151, stepSize: .7 })
    expect(document({ stepSize: .26597607104610804 }).rendering).toEqual({ maxIterations: 96, stepSize: .26597607104610804 })
  })

  it('uses the existing engine ceilings instead of increasing a global rendering limit', () => {
    expect(BUILDER_RENDER_SETTINGS.maxIterations.maximum).toBe(SCENE_RUNTIME_CEILINGS.raymarchIterations)
    expect(BUILDER_RENDER_SETTINGS.maxIterations.maximum).toBe(COMPILED_SHADER_LIMITS.maxIterations)
    expect(BUILDER_RENDER_SETTINGS.stepSize.minimum).toBe(COMPILED_SHADER_LIMITS.minStepSize)
    expect(BUILDER_RENDER_SETTINGS.stepSize.maximum).toBe(COMPILED_SHADER_LIMITS.maxStepSize)
    expect(SCENE_RUNTIME_CEILINGS.raymarchIterations).toBe(200)
  })

  it.each([
    { maxIterations: 1, stepSize: .005 },
    { maxIterations: 151, stepSize: .26597607104610804 },
    { maxIterations: 198, stepSize: .8838993805155669 },
    { maxIterations: 200, stepSize: 1 },
  ])('preserves and compiles the authored profile $maxIterations / $stepSize', rendering => {
    const scene = document(rendering)
    expect(validateSceneForStorage(scene)).toEqual(scene)
    expect(parseSceneImport(JSON.stringify(scene))).toEqual(scene)
    for (const compile of [compileBuilderDocument, compileBuilderPreviewDocument]) {
      const compiled = compile(scene)
      expect(compiled.shader).toContain(`setMaxIterations(${rendering.maxIterations});setStepSize(${rendering.stepSize});`)
      const artifact = normalizeCompiledShader(compileShader(compiled.shader), { maxRaymarchIterations: 200 })
      expect(artifact.frag).toContain(`const int MAX_ITERATIONS = ${rendering.maxIterations};`)
      const emitted = Number(artifact.frag.match(/const float STEP_SIZE_CONSTANT = ([^;]+);/)![1])
      expect(emitted).toBeCloseTo(rendering.stepSize, 7)
    }
  })

  it.each([
    { maxIterations: 0 }, { maxIterations: 201 }, { maxIterations: 96.5 }, { maxIterations: '198' },
    { maxIterations: NaN }, { maxIterations: Infinity },
    { stepSize: 0 }, { stepSize: .0049 }, { stepSize: 1.0001 }, { stepSize: '0.7' },
    { stepSize: NaN }, { stepSize: Infinity }, { source: 'setStepSize(1)' }, null, [],
  ])('rejects malformed or out-of-range rendering data %j', rendering => {
    expect(() => parseSceneDocument(input(rendering))).toThrow()
    expect(() => validateSceneForStorage(input(rendering))).toThrow()
  })

  it.each([
    { maxIterations: 201, stepSize: .7 }, { maxIterations: 1.5, stepSize: .7 },
    { maxIterations: Infinity, stepSize: .7 }, { maxIterations: 96, stepSize: 0 },
    { maxIterations: 96, stepSize: 1.01 }, { maxIterations: 96, stepSize: NaN },
  ])('rejects invalid direct compiler input before source generation', rendering => {
    const scene = document()
    scene.rendering = rendering as BuilderRenderSettings
    expect(() => compileBuilderDocument(scene)).toThrow('sceneData.rendering.')
  })

  it('changes only the requested march settings without changing shape or driver budgets', () => {
    const scene = document()
    const before = compileBuilderDocument(scene)
    scene.rendering = { maxIterations: 198, stepSize: .8838993805155669 }
    const after = compileBuilderDocument(scene)
    expect(after.shader.slice(after.shader.indexOf('\n'))).toBe(before.shader.slice(before.shader.indexOf('\n')))
    expect({ ...after.workload, generatedSourceBytes: 0 }).toEqual({ ...before.workload, generatedSourceBytes: 0 })
    expect(after.uniforms).toEqual(before.uniforms)
  })
})

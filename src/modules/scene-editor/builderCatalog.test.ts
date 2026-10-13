import { describe, expect, it } from 'vitest'
import catalogFixtures from '../../../contracts/scenes/builder-catalog.v1.fixtures.json'
import { compileShader } from '@notrac/mage/compiler'
import { normalizeCompiledShader } from '@notrac/mage/compiled-shader'
import { BUILDER_GROUP_TRANSFORMS, BUILDER_LIMITS, BUILDER_MODIFIERS, BUILDER_SHAPES, builderOperationFields,
  createBuilderBinding, listSelectableSceneTemplates, parseSceneDocument, type BuilderDriverExpression,
  type TemplateId } from '@modules/player'
import { compileBuilderDocument, compileBuilderPreviewDocument } from '../player/templates/builderCompiler'
import { validateSceneForPlayback, validateSceneForStorage } from '../player/policy/sceneValidation'
import { driverTargets } from './builderDrivers'
import { SCALAR_INPUTS, VECTOR_INPUTS } from './builderExpressions'
import { BUILDER_RECIPES, createBuilderRecipe } from './builderRecipes'
import { parseSceneDraftRecord, sceneDraftFingerprint, type SceneDraftRecord } from './sceneDraftRecovery'
import { buildSceneSubmissionDocument, prettyPrintEditorSceneData, readEditableSceneData, validateForm } from './utils'

const catalog = listSelectableSceneTemplates()
const expressionInputs = new Set([...SCALAR_INPUTS, ...VECTOR_INPUTS].map(option => option.value))

/** Check authored trees against the inputs actually offered by the shared editor. */
function checkExpressionControls(expression: BuilderDriverExpression) {
  switch (expression.type) {
    case 'constant': return
    case 'input':
      expect(expressionInputs.has(expression.source), `Missing input control: ${expression.source}`).toBe(true)
      if (expression.source === 'group-position') expect(expression.ancestor ?? 1).toBeLessThanOrEqual(BUILDER_LIMITS.groupDepth)
      return
    case 'add': case 'multiply':
      checkExpressionControls(expression.left)
      checkExpressionControls(expression.right)
      return
    case 'component': case 'sin': case 'cos': case 'clamp': case 'noise':
      checkExpressionControls(expression.input)
      return
    default: {
      const unsupported: never = expression
      throw new Error(`Missing calculation control: ${JSON.stringify(unsupported)}`)
    }
  }
}

describe('complete editable template catalog', () => {
  it('offers a concrete Builder recipe for every selectable version-one template', () => {
    expect(catalog).toHaveLength(14)
    expect(BUILDER_RECIPES.map(recipe => recipe.templateId).sort()).toEqual(catalog.map(template => template.templateId).sort())
    expect(new Set(BUILDER_RECIPES.map(recipe => recipe.templateId)).size).toBe(catalog.length)
  })

  it('keeps the shared persistence corpus synchronized with every canonical editable recipe', () => {
    expect(catalogFixtures.contractVersion).toBe(1)
    expect(catalogFixtures.recipes.map(recipe => recipe.templateId).sort()).toEqual(catalog.map(template => template.templateId).sort())
    for (const fixture of catalogFixtures.recipes) {
      const document = parseSceneDocument(fixture.document)
      expect(document.kind).toBe('builder')
      if (document.kind !== 'builder') throw new Error(`${fixture.label} must be an editable document`)
      expect(document.settings.audioResponse).toBe('mapped-v1')
      expect(createBuilderRecipe(fixture.templateId as TemplateId, document.settings, document.parameters)).toEqual(document)
    }
  })

  it.each(catalog)('$label only uses shapes, properties and calculations offered by ordinary controls', ({ templateId }) => {
    const scene = createBuilderRecipe(templateId as TemplateId)
    for (const object of scene.objects) {
      expect(BUILDER_SHAPES.map(shape => shape.value)).toContain(object.operation.type)
      expect(builderOperationFields(object.operation).map(field => field.key).sort())
        .toEqual(Object.keys(object.operation).filter(key => key !== 'type').sort())
    }
    for (const node of [...scene.objects, ...scene.composition!.groups]) {
      for (const modifier of node.modifiers ?? []) expect(Object.keys(BUILDER_MODIFIERS)).toContain(modifier.type)
      const targets = driverTargets(node).map(target => target.value)
      for (const driver of node.drivers ?? []) {
        expect(targets, `${templateId}: ${node.name} has no control for ${driver.target}`).toContain(driver.target)
        checkExpressionControls(driver.expression)
      }
    }
    for (const group of scene.composition!.groups) {
      expect(['union', 'smooth-union']).toContain(group.operation.type)
      expect(BUILDER_GROUP_TRANSFORMS.rotationOrder.enum).toContain(group.transform.rotationOrder ?? 'xyz')
    }
  })

  it.each(catalog)('$label produces independent documents that survive current save, export, import and draft recovery', ({ templateId, label }) => {
    const id = templateId as TemplateId
    const original = createBuilderRecipe(id)
    const scene = createBuilderRecipe(id)
    scene.objects[0].name = 'Edited constituent'
    scene.objects[0].transform.position.x += .1
    scene.settings.skybox = 3
    scene.settings.audioResponse = 'mapped-v1'
    scene.settings.audioResponseConfig = { version: 1, sensitivity: 1, mappings: [
      { target: 'size', source: 'bass-level', amount: .15, attack: .02, release: .2 },
    ] }
    // Distinct inputs stay attached to the selected objects, not the recipe identity.
    scene.objects[0].bindings = [createBuilderBinding('position.x', 'bass-hit')]
    scene.objects[1].bindings = [createBuilderBinding('position.y', 'treble-level')]
    const stored = buildSceneSubmissionDocument(scene)
    expect(stored).toEqual(scene)
    expect(stored).not.toHaveProperty('templateId')
    expect(stored).not.toHaveProperty('shader')
    expect(readEditableSceneData(stored)).toEqual(scene)
    const exported = prettyPrintEditorSceneData(stored)
    expect(validateForm(label, exported)).toEqual({ errors: {}, parsedSceneData: scene })
    expect(validateSceneForPlayback(JSON.parse(exported))).toEqual(scene)
    expect(validateSceneForStorage(JSON.parse(exported))).toEqual(scene)

    const snapshot = { name: label, description: '', sceneData: scene, sceneDataText: exported,
      selectedTagIds: [], selectedBuilderObjectId: scene.composition!.roots[0], templateSourceId: id }
    const record: SceneDraftRecord = { version: 1, savedAt: 123, baseFingerprint: sceneDraftFingerprint(snapshot), snapshot,
      saveContext: { savedSceneId: null, expectedRevision: null, saveNeedsReview: false } }
    expect(parseSceneDraftRecord(JSON.stringify(record))?.snapshot).toEqual(snapshot)
    expect(createBuilderRecipe(id)).toEqual(original)
    expect(original.objects[0].bindings).not.toEqual(scene.objects[0].bindings)
  })

  it.each(catalog)('$label compiles preview and playback through the packaged engine within the shared ceilings', ({ templateId }) => {
    const scene = createBuilderRecipe(templateId as TemplateId)
    for (const compile of [compileBuilderPreviewDocument, compileBuilderDocument]) {
      const result = compile(scene)
      expect(result.workload.expandedPrimitives).toBeLessThanOrEqual(BUILDER_LIMITS.expandedPrimitives)
      expect(result.workload.groups).toBeLessThanOrEqual(BUILDER_LIMITS.groups)
      expect(result.workload.groupDepth).toBeLessThanOrEqual(BUILDER_LIMITS.groupDepth)
      expect(result.workload.driverOperations).toBeLessThanOrEqual(1024)
      expect(result.workload.liveUniforms).toBeLessThanOrEqual(64)
      expect(result.workload.modifierOperations).toBeLessThanOrEqual(80)
      expect(result.shader).not.toContain('embedded-scene-')
      expect(() => normalizeCompiledShader(compileShader(result.shader, { maxRaymarchIterations: 200 }), { maxRaymarchIterations: 200 })).not.toThrow()
    }
  })

  it('rejects opaque source and unsupported recipe imports instead of silently restoring a template', () => {
    const scene = createBuilderRecipe('embedded-scene-0')
    for (const invalid of [{ ...scene, shader: 'sphere(1)' }, { ...scene, templateId: 'embedded-scene-0' },
      { ...scene, objects: [{ ...scene.objects[0], operation: { type: 'script', source: 'sphere(1)' } }] },
      { ...scene, objects: [{ ...scene.objects[0], drivers: [{ target: 'position.x', mode: 'replace',
        expression: { type: 'input', source: 'arbitrary-code' } }] }] }]) {
      expect(() => parseSceneDocument(invalid)).toThrow()
      expect(validateForm('Invalid scene', JSON.stringify(invalid)).errors.sceneData).toBeTruthy()
    }
  })
})

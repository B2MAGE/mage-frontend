import { describe, expect, it } from 'vitest'
import { compileShader } from '@notrac/mage/compiler'
import schema from '../../../../contracts/scenes/scene-v1.schema.json'
import { BUILDER_BINDING_RANGES, BUILDER_OPERATIONS, BUILDER_SHAPES, builderOperationFields,
  createBuilderArrangement, createBuilderModifier, createBuilderMotion, createBuilderOperation } from './builderDefinitions'
import { compileBuilderDocument } from './builderCompiler'
import { parseSceneDocument, type BuilderBinding, type BuilderSceneDocument } from './sceneContract'

const objectRule = schema.$defs.builder.properties.objects.items.properties
function scene(object: unknown): BuilderSceneDocument {
  return parseSceneDocument({ schemaVersion: 1, kind: 'builder', builderVersion: 1, objects: [object] }) as BuilderSceneDocument
}

describe('shared Builder definitions reach the contract, inspector and compiler', () => {
  it('has inspector metadata for every schema operation and every numeric property', () => {
    expect(BUILDER_SHAPES.map(shape => shape.value)).toEqual(objectRule.operation.anyOf.map(rule => rule.properties.type.const))
    for (const { value } of BUILDER_SHAPES) {
      const rule = objectRule.operation.anyOf.find(item => item.properties.type.const === value)!
      expect(BUILDER_OPERATIONS[value].fields.map(field => field.key)).toEqual(Object.keys(rule.properties).filter(key => key !== 'type'))
    }
  })

  it.each(BUILDER_SHAPES)('$label defaults, field limits and compiler support agree', ({ value }) => {
    const operation = createBuilderOperation(value)
    const document = scene({ id: 'shape', operation: { type: value } })
    expect(document.objects[0].operation).toEqual(operation)
    for (const field of builderOperationFields(operation)) {
      expect(field.value).toBe(field.default)
      for (const boundary of [field.minimum, field.maximum]) {
        expect(() => scene({ id: 'shape', operation: { ...operation, [field.key]: boundary } })).not.toThrow()
      }
      for (const outside of [field.minimum - 0.001, field.maximum + 0.001]) {
        expect(() => scene({ id: 'shape', operation: { ...operation, [field.key]: outside } })).toThrow()
      }
    }
    // A new catalog entry must produce a real artifact, not just a valid dropdown option.
    expect(() => compileShader(compileBuilderDocument(document).shader)).not.toThrow()
  })

  it('uses transport defaults when adding modifier, arrangement and motion stages', () => {
    for (const type of ['expand', 'shell', 'twist'] as const) {
      expect(scene({ id: 'shape', operation: { type: 'sphere' }, modifiers: [{ type }] }).objects[0].modifiers)
        .toEqual([createBuilderModifier(type)])
    }
    for (const type of ['linear', 'radial'] as const) {
      expect(scene({ id: 'shape', operation: { type: 'sphere' }, arrangements: [{ type }] }).objects[0].arrangements)
        .toEqual([createBuilderArrangement(type)])
    }
    for (const type of ['none', 'spin'] as const) {
      expect(scene({ id: 'shape', operation: { type: 'sphere' }, motion: { type } }).objects[0].motion)
        .toEqual(createBuilderMotion(type))
    }
  })

  it.each(Object.keys(BUILDER_BINDING_RANGES) as BuilderBinding['target'][])(
    '%s compiles with the same limits as the editable property', target => {
      const [branch, property] = target.split('.')
      const rule = branch === 'material'
        ? objectRule.material.properties[property as 'metalness' | 'shininess']
        : objectRule.transform.properties[branch as 'position' | 'rotation' | 'scale'].properties[property as 'x' | 'y' | 'z']
      const document = scene({ id: 'shape', operation: { type: 'sphere' }, bindings: [{ target, source: 'bass-hit' }] })
      expect(compileBuilderDocument(document).uniforms[0]).toEqual({ objectId: 'shape', objectIndex: 0,
        target, name: `builder_o0_${target.replace('.', '_')}`, initialValue: rule.default,
        minimum: rule.minimum, maximum: rule.maximum })
    },
  )
})

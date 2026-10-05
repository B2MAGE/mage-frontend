import { describe, expect, it } from 'vitest'
import { parseSceneDocument } from '@modules/player'
import {
  addBuilderObject,
  applyBuilderTemplate,
  changeBuilderBranch,
  createBuilderScene,
  duplicateBuilderObject,
  getBuilderEditorModel,
  removeBuilderObject,
  updateBuilderObject,
} from './builderEditor'

describe('Builder editor document helpers', () => {
  it('creates a valid source-free Builder document with one editable object', () => {
    const document = createBuilderScene()
    expect(parseSceneDocument(document)).toEqual(document)
    expect(document).toMatchObject({
      kind: 'builder',
      parameters: { scale: 1 },
      objects: [{ id: 'object-1', name: 'Sphere 1', operation: { type: 'sphere', radius: 1 } }],
    })
    expect(JSON.stringify(document)).not.toContain('shader')
  })

  it('adds, updates, duplicates, and removes objects with stable unique ids', () => {
    let document = addBuilderObject(createBuilderScene(), 'box')
    document = updateBuilderObject(document, 'object-2', object => ({
      ...object,
      name: 'Backdrop',
      transform: { ...object.transform, position: { x: 4, y: 2, z: -1 } },
    }))
    document = duplicateBuilderObject(document, 'object-2')
    expect(document.objects.map(object => object.id)).toEqual(['object-1', 'object-2', 'object-3'])
    expect(document.objects[2]).toMatchObject({ name: 'Backdrop copy', operation: { type: 'box' } })
    document = removeBuilderObject(document, 'object-1')
    expect(document.objects.map(object => object.id)).toEqual(['object-2', 'object-3'])
    expect(parseSceneDocument(document)).toEqual(document)
  })

  it('keeps objects while applying a starting style and scene-wide controls', () => {
    const original = { ...updateBuilderObject(createBuilderScene(), 'object-1', object => ({ ...object, name: 'Hero' })), parameters: { scale: 3, speed: 1 } }
    const styled = applyBuilderTemplate(original, 'reaction-rings-v1')
    const model = getBuilderEditorModel(styled)
    const changed = changeBuilderBranch(styled, 'intent', { ...model.intent, autoRotate: false, fov: 90 })
    expect(changed.objects).toEqual(original.objects)
    expect(changed.parameters.scale).toBe(3)
    expect(changed.settings.camera).toMatchObject({ autoRotate: false, fov: 90 })
    expect(changed.kind).toBe('builder')
  })
})

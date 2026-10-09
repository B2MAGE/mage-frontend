import { describe, expect, it } from 'vitest'
import { parseSceneDocument } from '@modules/player'
import {
  addBuilderObject,
  applyBuilderTemplate,
  changeBuilderBranch,
  createBuilderScene,
  duplicateBuilderObject,
  getBuilderEditorModel,
  moveBuilderObject,
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
    const withHero = updateBuilderObject(createBuilderScene(), 'object-1', object => ({ ...object, name: 'Hero' }))
    const original = { ...addBuilderObject(withHero, 'box'), parameters: { scale: 3, speed: 1 } }
    const styled = applyBuilderTemplate(original, 'embedded-scene-0')
    const model = getBuilderEditorModel(styled)
    const changed = changeBuilderBranch(styled, 'intent', { ...model.intent, autoRotate: false, fov: 90 })
    expect(changed.objects.map(object => ({ name: object.name, operation: object.operation, transform: object.transform })))
      .toEqual(original.objects.map(object => ({ name: object.name, operation: object.operation, transform: object.transform })))
    expect(changed.objects.map(object => object.material)).toEqual([
      { color: '#8066ff', metalness: 0.5, shininess: 0.8 },
      { color: '#55d6ff', metalness: 0.5, shininess: 0.8 },
    ])
    expect(changed.parameters.scale).toBe(3)
    expect(changed.settings.camera).toMatchObject({ autoRotate: false, fov: 90 })
    expect(changed.kind).toBe('builder')
  })

  it('keeps references and IDs attached to objects through reorder, deletion, and duplication', () => {
    const original = addBuilderObject(addBuilderObject(createBuilderScene(), 'box'), 'sphere')
    const reordered = moveBuilderObject(original, 'object-3', 'object-1')
    expect(reordered.objects.map(object => object.id)).toEqual(['object-3', 'object-1', 'object-2'])
    expect(reordered.objects[0]).toBe(original.objects[2])
    const removed = removeBuilderObject(reordered, 'object-1')
    const duplicate = duplicateBuilderObject(removed, 'object-3')
    expect(duplicate.objects.map(object => object.id)).toEqual(['object-3', 'object-2', 'object-4'])
    expect(duplicate.objects[0]).toBe(original.objects[2])
    expect(duplicate.objects[2].transform).not.toBe(original.objects[2].transform)
    const renamed = updateBuilderObject(duplicate, 'object-2', object => ({ ...object, id: 'wrong', name: 'Selected object' }))
    expect(renamed.objects[1]).toMatchObject({ id: 'object-2', name: 'Selected object' })
    expect(updateBuilderObject(renamed, 'object-1', object => ({ ...object, name: 'Deleted' }))).toBe(renamed)
    expect(original.objects.map(object => object.id)).toEqual(['object-1', 'object-2', 'object-3'])
  })
})

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSceneEditorState } from './useSceneEditorState'
import { addBuilderObject, createBuilderScene } from './builderEditor'
import { buildSceneSubmissionDocument } from './utils'
import { createTemplateScene } from './templateEditor'
import { assertSceneDocumentBudget, BUILDER_LIMITS, createBuilderBinding, parseSceneDocument, type BuilderDriverExpression, type BuilderSceneDocument } from '@modules/player'
import { groupBuilderNodes, ungroupBuilderNode, updateBuilderGroup } from './builderGroups'
import { updateBuilderBinding } from './builderBindings'
import { addNoiseDeformation, addProceduralColor } from './builderProcedural'

vi.mock('@shared/lib', async original => ({ ...await original<typeof import('@shared/lib')>(), fetchAvailableTags: async () => [] }))

async function draft(sceneData = createBuilderScene()) {
  const hook = renderHook(() => useSceneEditorState({ authenticatedFetch: vi.fn(), initialState: { name: 'My draft', sceneData } }))
  await waitFor(() => expect(hook.result.current.tagsLoading).toBe(false))
  return hook
}

describe('scene draft commands and current document round trips', () => {
  it('keeps precise procedural material and joined deformation through undo, redo, and saved-document round trips', async () => {
    const { result } = await draft()
    act(() => result.current.handleGroupBuilderNodes(['object-1']))
    const before = structuredClone(result.current.builderDocument!)
    act(() => result.current.handleUpdateBuilderGroup('group-1', group => addProceduralColor(addNoiseDeformation({ ...group,
      material: { color: { x: .08256470259178794, y: -.782309705948631, z: .763003005740327 }, metalness: .5, shininess: .3 },
    }), 'view-ray')))
    const authored = structuredClone(result.current.builderDocument!)
    expect(authored.composition!.groups[0].drivers).toHaveLength(4)
    expect(buildSceneSubmissionDocument(result.current.sceneData)).toEqual(authored)
    act(() => result.current.undoDraft())
    expect(result.current.builderDocument).toEqual(before)
    act(() => result.current.redoDraft())
    expect(result.current.builderDocument).toEqual(authored)
    act(() => result.current.handleUngroupBuilderNode('group-1'))
    expect(result.current.builderCommandError).toMatch(/joined surface/)
    expect(result.current.builderDocument).toEqual(authored)
    act(() => result.current.handleRawSceneDataChange(JSON.stringify(authored)))
    act(() => result.current.handleFormatJson())
    expect(parseSceneDocument(result.current.sceneData)).toEqual(authored)
    expect(buildSceneSubmissionDocument(result.current.sceneData)).toEqual(authored)
  })

  it.each(['legacy', 'mapped-v1'] as const)('preserves independent responses through %s scene settings, group duplication, deletion, Undo, and export/import', async mode => {
    const { result } = await draft()
    act(() => result.current.handleAddBuilderObject('box'))
    act(() => result.current.handleAudioResponseModeChange(mode, ['size']))
    act(() => {
      result.current.handleUpdateBuilderObject('object-1', object => ({ ...object, bindings: [createBuilderBinding('scale.x', 'bass-level'), createBuilderBinding('rotation.z', 'pointer-x')] }))
      result.current.handleUpdateBuilderObject('object-2', object => ({ ...object, bindings: [createBuilderBinding('position.y', 'treble-hit')] }))
      result.current.handleGroupBuilderNodes(['object-1', 'object-2'])
    })
    const before = structuredClone(result.current.builderDocument!)
    act(() => result.current.handleDuplicateBuilderObject('group-1'))
    const copied = result.current.builderDocument!
    expect(copied.objects.map(object => object.id)).toEqual(['object-1', 'object-2', 'object-3', 'object-4'])
    expect(copied.objects[2].bindings).toEqual(before.objects[0].bindings)
    expect(copied.objects[3].bindings).toEqual(before.objects[1].bindings)
    act(() => result.current.handleUpdateBuilderObject('object-3', object => updateBuilderBinding(object, 'scale.x', { source: 'mid-hit', amount: -.4 })))
    expect(result.current.builderDocument?.objects[0].bindings[0].source).toBe('bass-level')
    expect(result.current.builderDocument?.objects[2].bindings[0]).toMatchObject({ source: 'mid-hit', amount: -.4 })
    const saved = buildSceneSubmissionDocument(result.current.sceneData)
    expect(saved).toMatchObject({ kind: 'builder', settings: { audioResponse: mode } })
    act(() => result.current.handleRemoveBuilderObject('group-1'))
    expect(result.current.builderDocument?.objects.map(object => object.id)).toEqual(['object-3', 'object-4'])
    expect(result.current.builderDocument?.composition?.groups[0].children).toEqual(['object-3', 'object-4'])
    act(() => result.current.undoDraft())
    expect(buildSceneSubmissionDocument(result.current.sceneData)).toEqual(saved)
    act(() => result.current.handleRawSceneDataChange(JSON.stringify(saved)))
    act(() => result.current.handleFormatJson())
    expect(buildSceneSubmissionDocument(result.current.sceneData)).toEqual(saved)
    expect(JSON.parse(result.current.sceneDataText)).toEqual(saved)
  })
  it('groups, nests, duplicates, ungroups, and removes through one shared undo history with stable selection', async () => {
    const { result } = await draft()
    act(() => { result.current.handleAddBuilderObject('box'); result.current.handleAddBuilderObject('torus') })
    const before = structuredClone(result.current.sceneData)
    act(() => result.current.handleGroupBuilderNodes(['object-1', 'object-2']))
    expect(result.current.selectedBuilderObjectId).toBe('group-1')
    expect(result.current.builderDocument?.composition?.roots).toEqual(['group-1', 'object-3'])
    act(() => result.current.undoDraft())
    expect(result.current.sceneData).toEqual(before)
    expect(result.current.selectedBuilderObjectId).toBe('object-3')
    act(() => result.current.redoDraft())
    expect(result.current.selectedBuilderObjectId).toBe('group-1')
    act(() => result.current.handleGroupBuilderNodes(['group-1', 'object-3']))
    expect(result.current.selectedBuilderObjectId).toBe('group-2')
    const nested = structuredClone(result.current.sceneData)
    act(() => result.current.handleDuplicateBuilderObject('group-2'))
    expect(result.current.selectedBuilderObjectId).toBe('group-3')
    expect(result.current.builderDocument?.objects).toHaveLength(6)
    act(() => result.current.undoDraft())
    expect(result.current.sceneData).toEqual(nested)
    act(() => result.current.handleUngroupBuilderNode('group-2'))
    expect(result.current.selectedBuilderObjectId).toBe('group-1')
    act(() => result.current.undoDraft())
    expect(result.current.sceneData).toEqual(nested)
    act(() => result.current.handleRemoveBuilderObject('group-2'))
    expect(result.current.builderDocument?.objects).toHaveLength(0)
    act(() => result.current.undoDraft())
    expect(result.current.sceneData).toEqual(nested)
    expect(result.current.selectedBuilderObjectId).toBe('group-2')
    act(() => result.current.handleRawSceneDataChange(JSON.stringify(nested)))
    expect(parseSceneDocument(result.current.sceneData)).toEqual(nested)
    expect(buildSceneSubmissionDocument(result.current.sceneData)).toEqual(nested)
  })

  it('keeps failed group moves visible without changing the draft or undo history', async () => {
    const { result } = await draft()
    act(() => result.current.handleAddBuilderObject('box'))
    act(() => result.current.handleGroupBuilderNodes(['object-1', 'object-2']))
    const before = structuredClone(result.current.sceneData)
    act(() => result.current.handleReparentBuilderNode('group-1', 'group-1'))
    expect(result.current.builderCommandError).toMatch(/inside itself/)
    expect(result.current.sceneData).toEqual(before)
    act(() => result.current.undoDraft())
    expect(result.current.builderDocument?.composition).toBeUndefined()
  })

  it('rejects an ungroup that exceeds the shared document budget, preserving the draft, selection, and undo', async () => {
    let objects = addBuilderObject(createBuilderScene(), 'sphere')
    let large: BuilderSceneDocument | undefined
    let expression: BuilderDriverExpression = { type: 'input', source: 'time' }
    for (let depth = 0; depth < 11; depth++) expression = { type: 'clamp', input: expression, min: 0, max: 1 }
    for (let count = 2; count <= BUILDER_LIMITS.objects; count++) {
      // Four music responses and bounded animation expressions bring the scene
      // near the JSON budget. Ungrouping copies its inherited frame onto each child.
      const responsive = { ...objects, objects: objects.objects.map(object => ({ ...object,
        drivers: (['rotation.x', 'rotation.y', 'rotation.z', 'scale.x'] as const).map(target => ({ target, mode: 'add' as const, expression })),
        bindings: [createBuilderBinding('position.x', 'bass-level'), createBuilderBinding('position.y', 'mid-level'),
          createBuilderBinding('position.z', 'treble-level'), createBuilderBinding('rotation.z', 'pointer-x')] })) }
      const document = updateBuilderGroup(groupBuilderNodes(responsive, responsive.objects.map(object => object.id), 'group-1'), 'group-1', group => ({ ...group, transform: { ...group.transform, scale: 2 } }))
      try {
        assertSceneDocumentBudget(document)
        try { assertSceneDocumentBudget(ungroupBuilderNode(document, 'group-1')) }
        catch { large = document; break }
      } catch { /* Find a valid scene near the shared document limit. */ }
      objects = addBuilderObject(objects, 'sphere')
    }
    expect(large).toBeDefined()
    expect(() => parseSceneDocument(large)).not.toThrow()
    expect(() => assertSceneDocumentBudget(large)).not.toThrow()
    expect(() => assertSceneDocumentBudget(ungroupBuilderNode(large!, 'group-1'))).toThrow(/total object fields/)
    const { result } = await draft(large!)
    act(() => result.current.handleNameChange('Changed title'))
    const before = structuredClone(result.current.draftSnapshot)
    act(() => result.current.handleUngroupBuilderNode('group-1'))
    expect(result.current.builderCommandError).toMatch(/scene size limit/)
    expect(result.current.draftSnapshot).toEqual(before)
    act(() => result.current.undoDraft())
    expect(result.current.name).toBe('My draft')
    expect(result.current.sceneData).toEqual(large)
    expect(result.current.selectedBuilderObjectId).toBe('group-1')
  })

  it('applies queued object commands to the latest draft and never reuses a deleted object reference', async () => {
    const { result } = await draft()
    act(() => {
      result.current.handleAddBuilderObject('box')
      result.current.handleAddBuilderObject('sphere')
      result.current.handleMoveBuilderObject('object-3', 'object-1')
      result.current.handleRemoveBuilderObject('object-3')
      result.current.handleAddBuilderObject('box')
      result.current.handleUpdateBuilderObject('object-3', object => ({ ...object, name: 'Deleted target' }))
    })
    expect(result.current.builderDocument?.objects.map(object => object.id)).toEqual(['object-1', 'object-2', 'object-4'])
    expect(result.current.builderDocument?.objects.some(object => object.name === 'Deleted target')).toBe(false)
    act(() => result.current.handleDuplicateBuilderObject('object-2'))
    expect(result.current.builderDocument?.objects.map(object => object.id)).toEqual(['object-1', 'object-2', 'object-4', 'object-5'])
  })

  it('reimports an edited Builder document without moving object IDs or losing mapped response settings', async () => {
    const { result } = await draft()
    act(() => result.current.handleAddBuilderObject('box'))
    act(() => result.current.handleUpdateBuilderObject('object-2', object => ({ ...object, name: 'Hero', transform: { ...object.transform, position: { x: 2, y: 3, z: 4 } } })))
    act(() => result.current.handleAudioResponseModeChange('mapped-v1', ['size']))
    const saved = buildSceneSubmissionDocument(result.current.sceneData)
    const source = result.current.sceneDataText
    act(() => result.current.handleRemoveBuilderObject('object-1'))
    act(() => result.current.handleRawSceneDataChange(source))
    act(() => result.current.handleFormatJson())
    expect(buildSceneSubmissionDocument(result.current.sceneData)).toEqual(saved)
    expect(JSON.parse(result.current.sceneDataText)).toEqual(saved)
    expect(result.current.name).toBe('My draft')
  })

  it.each(['legacy', 'mapped-v1'] as const)('round trips an explicit custom document with %s audio response through edit and export', async audioResponse => {
    const { result } = await draft()
    const custom = { schemaVersion: 1, kind: 'custom', scene: { visualizer: { shader: 'sphere(1)' }, audioResponse } }
    act(() => result.current.handleRawSceneDataChange(JSON.stringify(custom)))
    act(() => result.current.updateBranch('intent', intent => ({ ...intent, fov: 82 })))
    const saved = buildSceneSubmissionDocument(result.current.sceneData)
    expect(saved).toMatchObject({ ...custom, scene: { audioResponse, intent: { fov: 82 } } })
    act(() => result.current.handleRawSceneDataChange(JSON.stringify(createTemplateScene())))
    act(() => result.current.confirmTemplateImport())
    act(() => result.current.handleRawSceneDataChange(JSON.stringify(saved)))
    act(() => result.current.handleFormatJson())
    expect(JSON.parse(result.current.sceneDataText)).toEqual(saved)
  })

  it('invalidates a captured thumbnail when the scene changes while retaining scene details', async () => {
    const { result } = await draft()
    const file = new File(['first revision'], 'preview.png', { type: 'image/png' })
    act(() => result.current.handleThumbnailCapture(file, 'data:image/png;base64,cHJldmlldw=='))
    expect(result.current.thumbnailFile).toBe(file)
    act(() => result.current.handleNameChange('Renamed'))
    expect(result.current.thumbnailFile).toBe(file)
    act(() => result.current.updateBranch('intent', intent => ({ ...intent, fov: 80 })))
    expect(result.current.thumbnailFile).toBeNull()
    expect(result.current.thumbnailPreviewUrl).toBeNull()
    expect(result.current.name).toBe('Renamed')
  })

  it('applies rapid numeric commands to the latest draft instead of an earlier render', async () => {
    const { result } = await draft()
    act(() => {
      result.current.updateBranch('intent', intent => ({ ...intent, fov: 82 }))
      result.current.updateBranch('intent', intent => ({ ...intent, time_multiplier: 2 }))
      result.current.updateBuilderValue('parameters.scale', 3)
    })
    expect(result.current.builderDocument).toMatchObject({
      parameters: { scale: 3, speed: 2 }, settings: { camera: { fov: 82 } },
    })
  })
})

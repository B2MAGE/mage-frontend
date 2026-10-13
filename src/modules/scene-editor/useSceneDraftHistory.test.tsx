import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createBuilderScene } from './builderEditor'
import { useSceneEditorState } from './useSceneEditorState'
import { useSceneDraftHistory } from './useSceneDraftHistory'
import type { PersonalTemplateSource, SceneDraftSnapshot } from './sceneDraftRecovery'
import { builderDesignKey } from './builderDesign'

vi.mock('@shared/lib', async original => ({ ...await original<typeof import('@shared/lib')>(), fetchAvailableTags: async () => [] }))

async function editor() {
  const hook = renderHook(() => useSceneEditorState({ authenticatedFetch: vi.fn(),
    initialState: { name: 'Builder draft', sceneData: createBuilderScene() } }))
  await waitFor(() => expect(hook.result.current.tagsLoading).toBe(false))
  return hook
}

describe('Builder draft history', () => {
  it('refreshes the saved source across matching undo and redo snapshots while preserving every design and unrelated source', () => {
    const draft = (name: string, source: PersonalTemplateSource | null = null): SceneDraftSnapshot & { sceneData: ReturnType<typeof createBuilderScene> } => {
      const sceneData = createBuilderScene()
      sceneData.objects[0].name = name
      return { name: '', description: '', sceneData, sceneDataText: JSON.stringify(sceneData),
        selectedTagIds: [], selectedBuilderObjectId: 'object-1', templateSourceId: null, personalTemplateSource: source }
    }
    const source: PersonalTemplateSource = { templateId: 17, name: 'Saved design', revision: 4,
      documentKey: builderDesignKey(createBuilderScene()) }
    const unrelated = draft('Another template', { ...source, templateId: 99, name: 'Another source' })
    const initial = draft('Unsaved draft')
    const original = draft('Original saved object', source)
    const edited = draft('Edited object', source)
    const future = draft('Later object', source)
    const { result } = renderHook(() => useSceneDraftHistory(() => initial))
    act(() => result.current.restore(unrelated))
    act(() => result.current.restore(original))
    act(() => result.current.commit(() => edited, 'Edit object'))
    act(() => result.current.commit(() => future, 'Later edit'))
    act(() => result.current.undo())
    const updatedSource = { ...source, revision: 5, name: 'Renamed design', documentKey: builderDesignKey(edited.sceneData) }
    act(() => result.current.setPersonalTemplateSource(updatedSource))
    expect(result.current.draft.sceneData).toBe(edited.sceneData)
    expect(result.current.draft.personalTemplateSource).toEqual(updatedSource)
    expect(result.current.undoLabel).toBe('Edit object')
    expect(result.current.redoLabel).toBe('Later edit')
    act(() => result.current.undo())
    expect(result.current.draft.sceneData).toBe(original.sceneData)
    expect(result.current.draft.sceneDataText).toBe(original.sceneDataText)
    expect(result.current.draft.personalTemplateSource).toEqual(updatedSource)
    act(() => result.current.undo())
    expect(result.current.draft).toEqual(unrelated)
    act(() => result.current.undo())
    expect(result.current.draft).toEqual(initial)
    expect(result.current.canUndo).toBe(false)
    act(() => result.current.redo())
    expect(result.current.draft).toEqual(unrelated)
    act(() => result.current.redo())
    expect(result.current.draft.sceneData).toBe(original.sceneData)
    expect(result.current.draft.personalTemplateSource).toEqual(updatedSource)
    act(() => result.current.redo())
    expect(result.current.draft.sceneData).toBe(edited.sceneData)
    expect(result.current.draft.personalTemplateSource).toEqual(updatedSource)
    act(() => result.current.redo())
    expect(result.current.draft.sceneData).toBe(future.sceneData)
    expect(result.current.draft.personalTemplateSource).toEqual(updatedSource)
    expect(result.current.canRedo).toBe(false)
  })

  it('undoes, redoes, and restores editor template identity with its document', () => {
    const sceneData = createBuilderScene()
    const initial: SceneDraftSnapshot = { name: '', description: '', sceneData,
      sceneDataText: JSON.stringify(sceneData), selectedTagIds: [], selectedBuilderObjectId: 'object-1', templateSourceId: null }
    const { result } = renderHook(() => useSceneDraftHistory(() => initial))
    act(() => result.current.commit(draft => ({ ...draft, templateSourceId: 'embedded-scene-5' })))
    expect(result.current.draft.templateSourceId).toBe('embedded-scene-5')
    expect(result.current.canUndo).toBe(true)
    act(() => result.current.undo())
    expect(result.current.draft.templateSourceId).toBeNull()
    act(() => result.current.redo())
    expect(result.current.draft.templateSourceId).toBe('embedded-scene-5')
    act(() => result.current.restore({ ...initial, templateSourceId: 'embedded-scene-8' }))
    expect(result.current.draft.templateSourceId).toBe('embedded-scene-8')
    act(() => result.current.undo())
    expect(result.current.draft.templateSourceId).toBe('embedded-scene-5')
  })

  it('undoes duplicate, reorder and delete with the same identities, bindings and selection', async () => {
    const { result } = await editor()
    act(() => result.current.handleAddBuilderObject('box'))
    expect(result.current.selectedBuilderObjectId).toBe('object-2')
    act(() => result.current.handleUpdateBuilderObject('object-2', object => ({ ...object,
      bindings: [{ target: 'position.x', source: 'bass-level', mode: 'add', amount: 0.2, offset: 0, attack: 0.1, release: 0.3 }] })))
    const original = structuredClone(result.current.builderDocument!.objects[1])
    act(() => result.current.handleDuplicateBuilderObject('object-2'))
    expect(result.current.selectedBuilderObjectId).toBe('object-3')
    expect(result.current.builderDocument!.objects[2].bindings).toEqual(original.bindings)
    act(() => result.current.handleMoveBuilderObject('object-3', 'object-1'))
    expect(result.current.selectedBuilderObjectId).toBe('object-3')
    expect(result.current.builderDocument!.objects.map(object => object.id)).toEqual(['object-3', 'object-1', 'object-2'])
    act(() => result.current.handleRemoveBuilderObject('object-3'))
    expect(result.current.selectedBuilderObjectId).toBe('object-1')
    act(() => result.current.undoDraft())
    expect(result.current.selectedBuilderObjectId).toBe('object-3')
    expect(result.current.builderDocument!.objects[0]).toMatchObject({ id: 'object-3', bindings: original.bindings })
    act(() => result.current.undoDraft())
    expect(result.current.builderDocument!.objects.map(object => object.id)).toEqual(['object-1', 'object-2', 'object-3'])
    act(() => result.current.undoDraft())
    expect(result.current.selectedBuilderObjectId).toBe('object-2')
    expect(result.current.builderDocument!.objects[1]).toEqual(original)
    act(() => result.current.redoDraft())
    expect(result.current.selectedBuilderObjectId).toBe('object-3')
  })

  it('treats a continuous field edit as one undo and clears redo after a new command', async () => {
    const { result } = await editor()
    act(() => {
      result.current.history.beginEdit('builder-position-x')
      for (const x of [1, 2, 3]) result.current.handleUpdateBuilderObject('object-1', object => ({ ...object,
        transform: { ...object.transform, position: { ...object.transform.position, x } } }))
      result.current.history.endEdit()
    })
    expect(result.current.builderDocument!.objects[0].transform.position.x).toBe(3)
    act(() => result.current.undoDraft())
    expect(result.current.builderDocument!.objects[0].transform.position.x).toBe(0)
    expect(result.current.history.canUndo).toBe(false)
    expect(result.current.history.canRedo).toBe(true)
    act(() => result.current.handleAddBuilderObject('torus'))
    expect(result.current.history.canRedo).toBe(false)
  })

  it('retains invalid JSON for recovery and reverses an import in one command', async () => {
    const { result } = await editor()
    const before = result.current.sceneDataText
    const imported = createBuilderScene()
    imported.objects[0].id = 'imported-orb'
    act(() => result.current.handleRawSceneDataChange(JSON.stringify(imported)))
    expect(result.current.selectedBuilderObjectId).toBe('imported-orb')
    act(() => result.current.undoDraft())
    expect(result.current.sceneDataText).toBe(before)
    expect(result.current.selectedBuilderObjectId).toBe('object-1')
    act(() => result.current.handleRawSceneDataChange('{ unfinished'))
    expect(result.current.sceneDataText).toBe('{ unfinished')
    expect(result.current.builderDocument!.objects[0].id).toBe('object-1')
    act(() => result.current.undoDraft())
    expect(result.current.sceneDataText).toBe(before)
  })

  it('resets details and objects to the opened draft and lets Undo recover the work', async () => {
    const { result } = await editor()
    act(() => result.current.handleNameChange('New name'))
    act(() => result.current.setDescription('Unfinished work'))
    act(() => result.current.handleAddBuilderObject('cylinder'))
    const edited = result.current.draftSnapshot
    act(() => result.current.resetDraft())
    expect(result.current.name).toBe('Builder draft')
    expect(result.current.description).toBe('')
    expect(result.current.builderDocument!.objects).toHaveLength(1)
    act(() => result.current.undoDraft())
    expect(result.current.draftSnapshot).toEqual(edited)
  })
})

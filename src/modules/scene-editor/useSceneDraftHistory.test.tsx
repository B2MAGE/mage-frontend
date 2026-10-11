import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createBuilderScene } from './builderEditor'
import { useSceneEditorState } from './useSceneEditorState'

vi.mock('@shared/lib', async original => ({ ...await original<typeof import('@shared/lib')>(), fetchAvailableTags: async () => [] }))

async function editor() {
  const hook = renderHook(() => useSceneEditorState({ authenticatedFetch: vi.fn(),
    initialState: { name: 'Builder draft', sceneData: createBuilderScene() } }))
  await waitFor(() => expect(hook.result.current.tagsLoading).toBe(false))
  return hook
}

describe('Builder draft history', () => {
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

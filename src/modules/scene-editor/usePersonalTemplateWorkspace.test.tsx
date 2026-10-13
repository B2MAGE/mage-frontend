import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createBuilderScene } from './builderEditor'
import { usePersonalTemplateWorkspace } from './usePersonalTemplateWorkspace'
import type { PersonalTemplate } from './personalTemplates'

const library = vi.hoisted(() => ({ templates: [], save: vi.fn(), load: vi.fn(), rename: vi.fn(), remove: vi.fn() }))
vi.mock('./usePersonalTemplates', () => ({ usePersonalTemplates: () => library }))

function draft() {
  const sceneData = createBuilderScene()
  return { name: '', description: '', sceneData, sceneDataText: JSON.stringify(sceneData), selectedTagIds: [], selectedBuilderObjectId: null }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('template library work cannot replace newer editor work', () => {
  it('does not start an upload if the account changed during capture', async () => {
    library.save.mockReset()
    const capture = deferred<File>()
    const current = draft()
    const { result, rerender } = renderHook(({ userId }) => usePersonalTemplateWorkspace({
      authenticatedFetch: vi.fn(), userId, source: null, readDraft: () => current,
      captureThumbnail: () => capture.promise, onLoad: vi.fn(), onSaved: vi.fn(), onSourceChange: vi.fn(),
    }), { initialProps: { userId: 1 } })
    let saving!: Promise<void>
    act(() => { saving = result.current.save('Private template') })
    rerender({ userId: 2 })
    await act(async () => {
      capture.resolve(new File(['preview'], 'preview.png', { type: 'image/png' }))
      await expect(saving).rejects.toThrow('changed')
    })
    expect(library.save).not.toHaveBeenCalled()
  })

  it('keeps a newer scene when an earlier template load finishes', async () => {
    const loading = deferred<PersonalTemplate>()
    library.load.mockReturnValueOnce(loading.promise)
    let current = draft()
    const onLoad = vi.fn(() => true)
    const { result } = renderHook(() => usePersonalTemplateWorkspace({
      authenticatedFetch: vi.fn(), userId: 1, source: null, readDraft: () => current,
      captureThumbnail: vi.fn(), onLoad, onSaved: vi.fn(), onSourceChange: vi.fn(),
    }))
    let opening!: Promise<boolean>
    act(() => { opening = result.current.open(7) })
    current = { ...draft(), name: 'Changed while loading' }
    await act(async () => {
      loading.resolve({ templateId: 7, name: 'Earlier', revision: 0, sceneData: createBuilderScene(),
        thumbnailRef: null, createdAt: '', updatedAt: '' })
      expect(await opening).toBe(false)
    })
    expect(onLoad).not.toHaveBeenCalled()
    expect(result.current.loadError).toContain('Your work was kept')
  })
})

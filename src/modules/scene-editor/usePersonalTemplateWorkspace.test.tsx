import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBuilderScene } from './builderEditor'
import { builderDesign } from './builderDesign'
import { usePersonalTemplateWorkspace } from './usePersonalTemplateWorkspace'
import type { PersonalTemplate } from './personalTemplates'

const library = vi.hoisted(() => ({ templates: [], save: vi.fn(), load: vi.fn(), rename: vi.fn(), remove: vi.fn() }))
vi.mock('./usePersonalTemplates', () => ({ usePersonalTemplates: () => library }))

function draft() {
  const sceneData = createBuilderScene()
  return { name: '', description: '', sceneData, sceneDataText: JSON.stringify(sceneData), selectedTagIds: [], selectedBuilderObjectId: null }
}
const template = (): PersonalTemplate => ({ templateId: 7, name: 'Personal design', revision: 0,
  sceneData: builderDesign(createBuilderScene()), createdAt: '', updatedAt: '' })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => vi.clearAllMocks())

describe('template library work cannot replace newer editor work', () => {
  it('saves the design directly without any preview callback', async () => {
    const current = draft()
    const saved = template()
    library.save.mockResolvedValueOnce(saved)
    const onSaved = vi.fn()
    const { result } = renderHook(() => usePersonalTemplateWorkspace({
      authenticatedFetch: vi.fn(), userId: 1, source: null, readDraft: () => current,
      onLoad: vi.fn(), onSaved, onSourceChange: vi.fn(), onDeleted: vi.fn(),
    }))
    await act(async () => { await result.current.save('Personal design') })
    expect(library.save).toHaveBeenCalledWith({ name: 'Personal design', sceneData: builderDesign(current.sceneData), template: undefined })
    expect(onSaved).toHaveBeenCalledWith(saved, current.sceneData)
    expect(result.current.notice).toBe('Saved “Personal design”.')
    act(() => result.current.dismissNotice())
    expect(result.current.notice).toBe('')
  })

  it('does not apply a save completion after the signed-in account changes', async () => {
    const saving = deferred<PersonalTemplate>()
    library.save.mockReturnValueOnce(saving.promise)
    const current = draft()
    const onSaved = vi.fn()
    const { result, rerender } = renderHook(({ userId }) => usePersonalTemplateWorkspace({
      authenticatedFetch: vi.fn(), userId, source: null, readDraft: () => current,
      onLoad: vi.fn(), onSaved, onSourceChange: vi.fn(), onDeleted: vi.fn(),
    }), { initialProps: { userId: 1 } })
    let pending!: Promise<void>
    act(() => { pending = result.current.save('Private template') })
    rerender({ userId: 2 })
    await act(async () => { saving.resolve(template()); await pending })
    expect(onSaved).not.toHaveBeenCalled()
    expect(result.current.notice).toBe('')
  })

  it.each(['changed', 'cancelled'])('keeps editor work when an earlier template load finishes after it was %s', async reason => {
    const loading = deferred<PersonalTemplate>()
    library.load.mockReturnValueOnce(loading.promise)
    let current = draft()
    const onLoad = vi.fn(() => true)
    const { result } = renderHook(() => usePersonalTemplateWorkspace({
      authenticatedFetch: vi.fn(), userId: 1, source: null, readDraft: () => current,
      onLoad, onSaved: vi.fn(), onSourceChange: vi.fn(), onDeleted: vi.fn(),
    }))
    let opening!: Promise<boolean>
    act(() => { opening = result.current.open(7) })
    if (reason === 'changed') current = { ...draft(), name: 'Changed while loading' }
    else act(() => result.current.cancelOpen())
    await act(async () => { loading.resolve(template()); expect(await opening).toBe(false) })
    expect(onLoad).not.toHaveBeenCalled()
    expect(result.current.loadError).toBe(reason === 'changed'
      ? 'The editor changed while the template was loading. Your work was kept; choose the template again when ready.' : '')
  })
})

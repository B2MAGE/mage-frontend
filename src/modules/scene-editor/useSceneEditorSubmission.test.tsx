import { act, renderHook } from '@testing-library/react'
import { useState, type FormEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSceneEditorSubmission } from './useSceneEditorSubmission'
import { createBuilderScene } from './builderEditor'
import type { SceneEditorSubmissionMode } from './types'
import { createSceneDraftRecovery, parseSceneDraftRecord, sceneDraftFingerprint, type SceneDraftSaveContext } from './sceneDraftRecovery'

const uploads = vi.hoisted(() => ({ upload: vi.fn(), replace: vi.fn() }))
vi.mock('./sceneThumbnailUpload', () => ({ uploadNewSceneThumbnail: uploads.upload, replaceSceneThumbnail: uploads.replace }))
const event = { preventDefault() {} } as FormEvent<HTMLFormElement>
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function setup(mode: SceneEditorSubmissionMode = { type: 'edit', sceneId: 42, revision: 0 }) {
  const document = createBuilderScene()
  const props = { authenticatedFetch: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const id = /^\/scenes\/(\d+)$/.exec(String(url))
    const request = JSON.parse(String(init?.body ?? '{}'))
    return new Response(JSON.stringify({ sceneId: id ? Number(id[1]) : 42, revision: id ? request.expectedRevision + 1 : 0 }))
  }), availableTags: [],
    captureThumbnailIfMissing: vi.fn(async () => new File(['preview'], 'preview.png', { type: 'image/png' })),
    description: 'Saved details', mode, name: 'My scene', onComplete: vi.fn(), sceneData: document,
    sceneDataText: JSON.stringify(document), selectedTagIds: [4, 7], setErrors: vi.fn(), setIsSubmitting: vi.fn(),
    tagsError: null, tagsLoading: false, thumbnailFile: null as File | null, onSaveContextChange: vi.fn() }
  return { props, ...renderHook(next => {
    const [saveContext, setSaveContext] = useState<SceneDraftSaveContext>({ savedSceneId: null,
      expectedRevision: mode.type === 'edit' ? mode.revision : null, saveNeedsReview: false })
    const submission = useSceneEditorSubmission({ ...next, saveContext, onSaveContextChange: context => {
      next.onSaveContextChange(context)
      setSaveContext(context)
    } })
    return { ...submission, saveContext }
  }, { initialProps: props }) }
}

afterEach(() => { vi.resetAllMocks() })

describe('atomic draft submission ownership', () => {
  it.each(['create', 'edit'] as const)('saves content and the complete tag selection in one %s request', async type => {
    uploads.upload.mockResolvedValue('thumbnail/key')
    const { result, props } = setup(type === 'create' ? { type } : { type, sceneId: 42, revision: 0 })
    await act(() => result.current.handleSubmit(event))
    expect(props.authenticatedFetch).toHaveBeenCalledTimes(1)
    const [url, init] = props.authenticatedFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(type === 'create' ? '/scenes' : '/scenes/42')
    expect(JSON.parse(String(init.body))).toMatchObject({ tagIds: [4, 7], sceneData: props.sceneData })
    if (type === 'edit') expect(JSON.parse(String(init.body)).expectedRevision).toBe(0)
    else expect(JSON.parse(String(init.body))).not.toHaveProperty('expectedRevision')
    expect(props.onComplete).toHaveBeenCalledOnce()
  })

  it('sends an empty tag selection explicitly and keeps a rejected draft available for retry', async () => {
    const { result, props, rerender } = setup()
    props.authenticatedFetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Tag missing', details: { tagIds: 'Choose an existing tag.' } }), { status: 400 }))
    rerender({ ...props, selectedTagIds: [] })
    await act(() => result.current.handleSubmit(event))
    expect(JSON.parse(String((props.authenticatedFetch.mock.calls[0] as unknown as [string, RequestInit])[1].body)).tagIds).toEqual([])
    expect(props.setErrors).toHaveBeenLastCalledWith(expect.objectContaining({ tags: 'Choose an existing tag.' }))
    expect(props.onComplete).not.toHaveBeenCalled()
    await act(() => result.current.handleSubmit(event))
    expect(props.authenticatedFetch).toHaveBeenCalledTimes(2)
    expect(props.onComplete).toHaveBeenCalledOnce()
  })

  it('does not post a stale draft after thumbnail capture and prevents duplicate attempts', async () => {
    const pending = deferred<File>()
    const { result, props, rerender } = setup({ type: 'create' })
    props.captureThumbnailIfMissing.mockReturnValue(pending.promise)
    let first!: Promise<void>
    act(() => { first = result.current.handleSubmit(event) })
    await act(() => result.current.handleSubmit(event))
    expect(props.captureThumbnailIfMissing).toHaveBeenCalledOnce()
    rerender({ ...props, name: 'New draft' })
    await act(async () => { pending.resolve(new File(['old'], 'old.png')); await first })
    expect(uploads.upload).not.toHaveBeenCalled()
    expect(props.authenticatedFetch).not.toHaveBeenCalled()
    expect(props.onComplete).not.toHaveBeenCalled()
  })

  it.each(['success', 'failure'] as const)('settles an earlier %s before allowing the newer draft to save', async outcome => {
    const pending = deferred<Response>()
    const { result, props, rerender } = setup()
    props.authenticatedFetch.mockReturnValueOnce(pending.promise)
    let first!: Promise<void>
    act(() => { first = result.current.handleSubmit(event) })
    const firstOptions = (props.authenticatedFetch.mock.calls[0] as unknown as [string, RequestInit])[1]
    rerender({ ...props, name: 'New draft', thumbnailFile: new File(['new'], 'new.png') })
    expect(firstOptions.signal?.aborted).toBe(false)
    await act(() => result.current.handleSubmit(event))
    expect(props.authenticatedFetch).toHaveBeenCalledOnce()
    await act(async () => {
      pending.resolve(new Response(JSON.stringify(outcome === 'success'
        ? { sceneId: 42, revision: 1 } : { details: { name: 'Old field error' } }), { status: outcome === 'success' ? 200 : 400 }))
      await first
    })
    expect(props.onComplete).not.toHaveBeenCalled()
    expect(uploads.replace).not.toHaveBeenCalled()
    const retainNewerDraft = props.setErrors.mock.lastCall?.[0] as unknown as (errors: object) => object
    expect(retainNewerDraft({ name: 'New draft validation' })).toMatchObject({ name: 'New draft validation' })
    expect(result.current.saveContext.expectedRevision).toBe(outcome === 'success' ? 1 : 0)
    await act(() => result.current.handleSubmit(event))
    expect(props.authenticatedFetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String((props.authenticatedFetch.mock.calls[1] as unknown as [string, RequestInit])[1].body)))
      .toMatchObject({ name: 'New draft', expectedRevision: outcome === 'success' ? 1 : 0 })
    expect(props.onComplete).toHaveBeenCalledOnce()
  })

  it('retains a successful create reference and updates it with the newer complete draft', async () => {
    uploads.upload.mockResolvedValue('old-thumbnail/key')
    const pending = deferred<Response>()
    const { result, props, rerender } = setup({ type: 'create' })
    props.authenticatedFetch.mockReturnValueOnce(pending.promise)
    let first!: Promise<void>
    await act(async () => {
      first = result.current.handleSubmit(event)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(props.authenticatedFetch).toHaveBeenCalledOnce()
    const newerDocument = { ...props.sceneData, parameters: { ...props.sceneData.parameters, scale: 2 } }
    rerender({ ...props, name: 'Newer draft', description: 'Latest details', selectedTagIds: [8],
      sceneData: newerDocument, sceneDataText: JSON.stringify(newerDocument) })
    await act(() => result.current.handleSubmit(event))
    expect(props.authenticatedFetch).toHaveBeenCalledOnce()
    await act(async () => { pending.resolve(new Response('{"sceneId":73,"revision":0}')); await first })
    expect(props.onComplete).not.toHaveBeenCalled()
    expect(result.current.hasSavedScene).toBe(true)
    expect(uploads.replace).not.toHaveBeenCalled()
    await act(() => result.current.handleSubmit(event))
    const calls = props.authenticatedFetch.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([url, init]) => [url, init.method])).toEqual([['/scenes', 'POST'], ['/scenes/73', 'PUT']])
    expect(JSON.parse(String(calls[1][1].body))).toMatchObject({ name: 'Newer draft', description: 'Latest details', tagIds: [8], sceneData: newerDocument, expectedRevision: 0 })
    expect(props.captureThumbnailIfMissing).toHaveBeenCalledOnce()
    expect(props.onComplete).toHaveBeenCalledOnce()
  })

  it('does not create a duplicate after losing the response to a dispatched create', async () => {
    uploads.upload.mockResolvedValue('thumbnail/key')
    const { result, props } = setup({ type: 'create' })
    props.authenticatedFetch.mockRejectedValueOnce(new TypeError('Network connection lost'))
    await act(() => result.current.handleSubmit(event))
    expect(result.current.saveNeedsReview).toBe(true)
    await act(() => result.current.handleSubmit(event))
    expect(props.authenticatedFetch).toHaveBeenCalledOnce()
    expect(props.onComplete).not.toHaveBeenCalled()
  })

  it('persists the uncertain create before dispatching POST, then remembers its identity and revision', async () => {
    uploads.upload.mockResolvedValue('thumbnail/key')
    const { result, props } = setup({ type: 'create' })
    const values = new Map<string, string>()
    const recovery = createSceneDraftRecovery('create-test', () => ({
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value) },
      removeItem: key => { values.delete(key) },
    }))
    const draft = { name: props.name, description: props.description, sceneData: props.sceneData,
      sceneDataText: props.sceneDataText, selectedTagIds: props.selectedTagIds, selectedBuilderObjectId: null }
    recovery.update({ snapshot: draft, baseFingerprint: sceneDraftFingerprint(draft) })
    props.onSaveContextChange.mockImplementation(recovery.persistSaveContext)
    props.authenticatedFetch.mockImplementation(async () => {
      expect(parseSceneDraftRecord(values.get('create-test')!)?.saveContext)
        .toEqual({ savedSceneId: null, expectedRevision: null, saveNeedsReview: true })
      return new Response('{"sceneId":73,"revision":0}', { status: 201 })
    })
    await act(() => result.current.handleSubmit(event))
    expect(parseSceneDraftRecord(values.get('create-test')!)?.saveContext)
      .toEqual({ savedSceneId: 73, expectedRevision: 0, saveNeedsReview: false })
    expect(props.onComplete).toHaveBeenCalledOnce()
    recovery.dispose()
  })

  it('keeps a draft after a stale revision conflict and blocks another PUT until the saved scene is reviewed', async () => {
    const { result, props } = setup({ type: 'edit', sceneId: 42, revision: 7 })
    props.authenticatedFetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 'SCENE_EDIT_CONFLICT',
      message: 'This scene was changed by another editor.' }), { status: 409 }))
    await act(() => result.current.handleSubmit(event))
    expect(JSON.parse(String(props.authenticatedFetch.mock.calls[0][1]?.body)).expectedRevision).toBe(7)
    expect(result.current.saveContext).toEqual({ savedSceneId: null, expectedRevision: 7, saveNeedsReview: true })
    const showConflict = props.setErrors.mock.lastCall?.[0] as (errors: object) => { form: string }
    expect(showConflict({}).form).toContain('changed in another editor')
    await act(() => result.current.handleSubmit(event))
    expect(props.authenticatedFetch).toHaveBeenCalledOnce()
    expect(props.onComplete).not.toHaveBeenCalled()
  })

  it.each([{ sceneId: 42 }, { sceneId: 42, revision: -1 }, { sceneId: 99, revision: 1 }])(
    'requires review when a successful update response has an invalid reference: %j', async payload => {
      const { result, props } = setup()
      props.authenticatedFetch.mockResolvedValueOnce(new Response(JSON.stringify(payload)))
      await act(() => result.current.handleSubmit(event))
      expect(result.current.saveNeedsReview).toBe(true)
      await act(() => result.current.handleSubmit(event))
      expect(props.authenticatedFetch).toHaveBeenCalledOnce()
      expect(props.onComplete).not.toHaveBeenCalled()
    },
  )

  it('disposes a pending save without completing navigation or attaching a thumbnail', async () => {
    const pending = deferred<Response>()
    const { result, props, rerender, unmount } = setup()
    props.authenticatedFetch.mockReturnValueOnce(pending.promise)
    rerender({ ...props, thumbnailFile: new File(['preview'], 'preview.png') })
    let request!: Promise<void>
    act(() => { request = result.current.handleSubmit(event) })
    unmount()
    await act(async () => { pending.resolve(new Response('{}')); await request })
    expect(uploads.replace).not.toHaveBeenCalled()
    expect(props.onComplete).not.toHaveBeenCalled()
  })
})

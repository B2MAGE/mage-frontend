import { act, renderHook } from '@testing-library/react'
import type { FormEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSceneEditorSubmission } from './useSceneEditorSubmission'
import { createBuilderScene } from './builderEditor'
import type { SceneEditorSubmissionMode } from './types'

const uploads = vi.hoisted(() => ({ upload: vi.fn(), replace: vi.fn() }))
vi.mock('./sceneThumbnailUpload', () => ({ uploadNewSceneThumbnail: uploads.upload, replaceSceneThumbnail: uploads.replace }))
const event = { preventDefault() {} } as FormEvent<HTMLFormElement>
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function setup(mode: SceneEditorSubmissionMode = { type: 'edit', sceneId: 42 }) {
  const document = createBuilderScene()
  const props = { authenticatedFetch: vi.fn(async () => new Response('{"sceneId":42}')), availableTags: [],
    captureThumbnailIfMissing: vi.fn(async () => new File(['preview'], 'preview.png', { type: 'image/png' })),
    description: 'Saved details', mode, name: 'My scene', onComplete: vi.fn(), sceneData: document,
    sceneDataText: JSON.stringify(document), selectedTagIds: [4, 7], setErrors: vi.fn(), setIsSubmitting: vi.fn(),
    tagsError: null, tagsLoading: false, thumbnailFile: null as File | null }
  return { props, ...renderHook(next => useSceneEditorSubmission(next), { initialProps: props }) }
}

afterEach(() => { vi.resetAllMocks() })

describe('atomic draft submission ownership', () => {
  it.each(['create', 'edit'] as const)('saves content and the complete tag selection in one %s request', async type => {
    uploads.upload.mockResolvedValue('thumbnail/key')
    const { result, props } = setup(type === 'create' ? { type } : { type, sceneId: 42 })
    await act(() => result.current.handleSubmit(event))
    expect(props.authenticatedFetch).toHaveBeenCalledTimes(1)
    const [url, init] = props.authenticatedFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(type === 'create' ? '/scenes' : '/scenes/42')
    expect(JSON.parse(String(init.body))).toMatchObject({ tagIds: [4, 7], sceneData: props.sceneData })
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
      pending.resolve(new Response(JSON.stringify({ details: { name: 'Old field error' } }), { status: outcome === 'success' ? 200 : 400 }))
      await first
    })
    expect(props.onComplete).not.toHaveBeenCalled()
    expect(uploads.replace).not.toHaveBeenCalled()
    const retainNewerDraft = props.setErrors.mock.lastCall?.[0] as unknown as (errors: object) => object
    expect(retainNewerDraft({ name: 'New draft validation' })).toMatchObject({ name: 'New draft validation' })
    await act(() => result.current.handleSubmit(event))
    expect(props.authenticatedFetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String((props.authenticatedFetch.mock.calls[1] as unknown as [string, RequestInit])[1].body)).name).toBe('New draft')
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
    await act(async () => { pending.resolve(new Response('{"sceneId":73}')); await first })
    expect(props.onComplete).not.toHaveBeenCalled()
    expect(result.current.hasSavedScene).toBe(true)
    expect(uploads.replace).not.toHaveBeenCalled()
    await act(() => result.current.handleSubmit(event))
    const calls = props.authenticatedFetch.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([url, init]) => [url, init.method])).toEqual([['/scenes', 'POST'], ['/scenes/73', 'PUT']])
    expect(JSON.parse(String(calls[1][1].body))).toMatchObject({ name: 'Newer draft', description: 'Latest details', tagIds: [8], sceneData: newerDocument })
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

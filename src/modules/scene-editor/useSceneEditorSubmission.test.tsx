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
  const props = { authenticatedFetch: vi.fn(async () => new Response('{}')), availableTags: [],
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

  it.each(['success', 'failure'] as const)('ignores an old %s response after a newer draft is saved', async outcome => {
    const pending = deferred<Response>()
    const { result, props, rerender } = setup()
    props.authenticatedFetch.mockReturnValueOnce(pending.promise)
    let first!: Promise<void>
    act(() => { first = result.current.handleSubmit(event) })
    const firstOptions = (props.authenticatedFetch.mock.calls[0] as unknown as [string, RequestInit])[1]
    rerender({ ...props, name: 'New draft' })
    expect(firstOptions.signal?.aborted).toBe(true)
    await act(() => result.current.handleSubmit(event))
    const errorsBeforeOldResponse = props.setErrors.mock.calls.length
    await act(async () => { pending.resolve(new Response('{}', { status: outcome === 'success' ? 200 : 400 })); await first })
    expect(props.onComplete).toHaveBeenCalledOnce()
    expect(props.setErrors).toHaveBeenCalledTimes(errorsBeforeOldResponse)
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

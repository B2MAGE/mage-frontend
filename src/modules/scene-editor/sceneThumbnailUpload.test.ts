import { afterEach, describe, expect, it, vi } from 'vitest'
import { replaceSceneThumbnail, uploadNewSceneThumbnail } from './sceneThumbnailUpload'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const file = new File(['preview'], 'preview.png', { type: 'image/png' })
const signed = () => new Response(JSON.stringify({ objectKey: 'thumbnail/key', uploadUrl: 'https://storage.example/preview.png', method: 'PUT' }))
afterEach(() => vi.restoreAllMocks())

describe('thumbnail upload cancellation', () => {
  it('does not upload a capture when its draft was replaced during presign', async () => {
    const pending = deferred<Response>()
    const fetcher = vi.fn(() => pending.promise)
    const storage = vi.spyOn(globalThis, 'fetch')
    const abort = new AbortController()
    const upload = uploadNewSceneThumbnail(fetcher, file, abort.signal)
    const rejection = expect(upload).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort()
    pending.resolve(signed())
    await rejection
    expect(storage).not.toHaveBeenCalled()
  })

  it('never finalizes a thumbnail after a stale storage upload completes', async () => {
    const pending = deferred<Response>()
    const fetcher = vi.fn(async () => signed())
    const storage = vi.spyOn(globalThis, 'fetch').mockReturnValue(pending.promise)
    const abort = new AbortController()
    const upload = replaceSceneThumbnail(fetcher, 12, file, abort.signal)
    const rejection = expect(upload).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(storage).toHaveBeenCalledOnce())
    abort.abort()
    pending.resolve(new Response(null, { status: 200 }))
    await rejection
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledWith('/scenes/12/thumbnail/presign', expect.objectContaining({ signal: abort.signal }))
  })
})

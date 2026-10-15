import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDiscoveryPreview, fetchDiscoveryScenes } from './loaders'
import type { DiscoveryPageQuery } from './types'

const query: DiscoveryPageQuery = { page: 0, size: 12, sort: 'descending', tag: 'warm light' }
const summary = {
  sceneId: 7,
  ownerUserId: 2,
  creatorDisplayName: 'Peter',
  name: 'Prism',
  createdAt: '2026-10-14T12:00:00Z',
  thumbnailRef: '/prism.webp',
  availability: { sceneId: 7, available: true, code: 'AVAILABLE', message: null },
  engagement: { views: 20, comments: 3, upvotes: 2, downvotes: 1, likesRatio: 67 },
}
const page = { items: [summary], page: 0, size: 12, totalElements: 14, totalPages: 2 }

function respond(payload: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }))
}

afterEach(() => vi.restoreAllMocks())

describe('Explore page requests', () => {
  it('requests one bounded server page with all filters and cancellation', async () => {
    const request = respond(page)
    const controller = new AbortController()
    const result = await fetchDiscoveryScenes(query, controller.signal)
    expect(request).toHaveBeenCalledTimes(1)
    const [url, options] = request.mock.calls[0]
    const parsed = new URL(String(url), 'http://localhost')
    expect(parsed.pathname).toBe('/api/scenes/discovery')
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ page: '0', size: '12', sort: 'descending', tag: 'warm light' })
    expect(options).toEqual({ signal: controller.signal, cache: 'no-store' })
    expect(result).toMatchObject({ page: 0, size: 12, totalElements: 14, totalPages: 2 })
    expect(result.items[0]).toMatchObject({ sceneId: 7, thumbnailRef: '/prism.webp', engagement: { views: 20, comments: 3, likesRatio: 67 } })
    expect(result.items[0]).not.toHaveProperty('sceneData')
  })

  it('keeps execution data out of summary objects even if a response includes extra fields', async () => {
    respond({ ...page, items: [{ ...summary, sceneData: { secret: 'document' }, source: 'shader', compiledArtifact: 'artifact' }] })
    const result = await fetchDiscoveryScenes(query)
    expect(JSON.stringify(result)).not.toMatch(/sceneData|secret|shader|artifact|source/)
  })

  it('accepts empty and out-of-range pages with accurate totals', async () => {
    respond({ items: [], page: 7, size: 12, totalElements: 14, totalPages: 2 })
    expect(await fetchDiscoveryScenes({ ...query, page: 7 })).toMatchObject({ items: [], page: 7, totalPages: 2 })
    vi.restoreAllMocks()
    respond({ items: [], page: 0, size: 12, totalElements: 0, totalPages: 0 })
    expect(await fetchDiscoveryScenes(query)).toMatchObject({ items: [], totalPages: 0 })
  })

  it.each([
    null,
    [],
    { ...page, page: 1 },
    { ...page, size: 48 },
    { ...page, totalElements: -1 },
    { ...page, totalPages: 3 },
    { ...page, items: [{}] },
    { ...page, items: [summary, summary] },
    { ...page, items: Array.from({ length: 13 }, (_, index) => ({ ...summary, sceneId: index + 1 })) },
  ])('rejects malformed pages instead of showing a false empty result: %j', async payload => {
    respond(payload)
    await expect(fetchDiscoveryScenes(query)).rejects.toThrow(/Invalid scene/)
  })

  it('surfaces failed responses for the page retry state', async () => {
    respond({ message: 'unavailable' }, 503)
    await expect(fetchDiscoveryScenes(query)).rejects.toThrow('503')
  })

  it('propagates cancellation rather than returning an empty catalog', async () => {
    const controller = new AbortController()
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const request = fetchDiscoveryScenes(query, controller.signal)
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('intentional card preview requests', () => {
  it('loads only the requested scene and passes its abort signal', async () => {
    const request = respond({ ...summary, sceneData: { kind: 'builder' } })
    const controller = new AbortController()
    const result = await fetchDiscoveryPreview(7, controller.signal)
    expect(request).toHaveBeenCalledExactlyOnceWith('/api/scenes/7', { signal: controller.signal, cache: 'no-store' })
    expect(result.sceneData).toEqual({ kind: 'builder' })
  })

  it('honors a current playback denial instead of using returned execution data', async () => {
    respond({ ...summary, sceneData: { kind: 'builder' }, availability: { sceneId: 7, available: false, code: 'SCENE_DISABLED', message: 'Unavailable' } })
    expect((await fetchDiscoveryPreview(7, new AbortController().signal)).sceneData).toBeNull()
  })

  it('rejects a response for a different scene', async () => {
    respond({ ...summary, sceneId: 8, sceneData: {} })
    await expect(fetchDiscoveryPreview(7, new AbortController().signal)).rejects.toThrow('Invalid scene preview')
  })

  it.each([401, 403, 404])('does not bypass a %s detail response', async status => {
    respond({ message: 'Unavailable' }, status)
    await expect(fetchDiscoveryPreview(7, new AbortController().signal)).rejects.toThrow(String(status))
  })
})

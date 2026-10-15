import { describe, expect, it, vi } from 'vitest'
import { jsonResponse } from '@shared/test/http'
import { fetchUserScenes } from './loaders'

describe('fetchUserScenes', () => {
  it('loads all analytics in one owner-list request and uses the server ratio', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(jsonResponse([
      {
        sceneId: 10, ownerUserId: 8, creatorDisplayName: 'Peter', name: 'Prism Core',
        createdAt: '2026-10-14T12:00:00Z', thumbnailRef: null,
        engagement: { views: 80, comments: 6, likesRatio: 73, upvotes: 1, downvotes: 1 },
      },
      {
        sceneId: 11, ownerUserId: 8, creatorDisplayName: 'Peter', name: 'New scene',
        createdAt: '2026-10-14T12:00:00Z', thumbnailRef: null,
        engagement: { views: 0, comments: 0, likesRatio: 0, upvotes: 0, downvotes: 0 },
      },
    ]))

    await expect(fetchUserScenes(authenticatedFetch, 8)).resolves.toMatchObject([
      { id: 10, viewsCount: 80, commentsCount: 6, likesRatio: 73 },
      { id: 11, viewsCount: 0, commentsCount: 0, likesRatio: 0 },
    ])
    expect(authenticatedFetch.mock.calls).toEqual([['/users/8/scenes']])
  })

  it('keeps an empty library empty without fetching comment data', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(jsonResponse([]))

    await expect(fetchUserScenes(authenticatedFetch, 8)).resolves.toEqual([])
    expect(authenticatedFetch.mock.calls).toEqual([['/users/8/scenes']])
  })

  it.each([401, 403, 500])('surfaces a %i response instead of displaying zero analytics', async (status) => {
    const authenticatedFetch = vi.fn().mockResolvedValue(jsonResponse({ message: 'Unavailable' }, status))

    await expect(fetchUserScenes(authenticatedFetch, 8)).rejects.toThrow('Unable to load scenes.')
    expect(authenticatedFetch).toHaveBeenCalledTimes(1)
  })

  it('surfaces invalid JSON instead of displaying an empty library', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(new Response('not JSON'))

    await expect(fetchUserScenes(authenticatedFetch, 8)).rejects.toThrow()
  })
})

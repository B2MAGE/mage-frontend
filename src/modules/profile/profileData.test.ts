import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedFetch } from '@auth'
import type { SceneListResponse } from '@shared/lib'
import {
  buildProfileViewModel,
  fetchPublicProfile,
  filterProfileScenes,
  normalizeProfileHandle,
  PublicProfileRequestError,
} from './profileData'

function scene(
  sceneId: number,
  name: string,
  createdAt: string,
  views: number,
  upvotes: number,
  saves: number,
): SceneListResponse {
  return {
    createdAt,
    creatorDisplayName: 'Ari Rivera',
    creatorHandle: 'aririvera',
    description: null,
    engagement: {
      currentUserSaved: false,
      currentUserVote: null,
      downvotes: 0,
      saves,
      upvotes,
      views,
    },
    name,
    ownerUserId: 1,
    sceneData: {},
    sceneId,
    thumbnailRef: null,
  }
}

function profilePayload(scenes: SceneListResponse[] = []) {
  return {
    createdAt: '2026-01-01T12:00:00Z',
    description: 'Slow visual spaces built for late-night listening.',
    displayName: 'Ari Rivera',
    handle: 'aririvera',
    scenes,
    userId: 1,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('profile data', () => {
  it('normalizes route handles to the bare lowercase API value', () => {
    expect(normalizeProfileHandle('@Ari_Rivera')).toBe('ari_rivera')
    expect(normalizeProfileHandle('mira')).toBe('mira')
    expect(normalizeProfileHandle('@2short')).toBeNull()
    expect(normalizeProfileHandle('@ab')).toBeNull()
    expect(normalizeProfileHandle('@spaces are invalid')).toBeNull()
  })

  it('loads and normalizes a public profile for a signed-out visitor', async () => {
    const publicFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(profilePayload([
          {
            ...scene(4, 'Copper Reef', '2026-09-20T12:00:00Z', 1200, 20, 8),
            creatorDisplayName: '  ',
          },
          { sceneId: 'invalid' },
        ] as SceneListResponse[])),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', publicFetch)
    const authenticatedFetch = vi.fn() as AuthenticatedFetch

    await expect(fetchPublicProfile(authenticatedFetch, false, 'aririvera')).resolves.toEqual(
      expect.objectContaining({
        description: 'Slow visual spaces built for late-night listening.',
        displayName: 'Ari Rivera',
        handle: 'aririvera',
        scenes: [
          expect.objectContaining({
            creatorDisplayName: 'Unknown creator',
            name: 'Copper Reef',
            sceneId: 4,
          }),
        ],
      }),
    )
    expect(publicFetch).toHaveBeenCalledWith('/api/profiles/aririvera')
    expect(authenticatedFetch).not.toHaveBeenCalled()
  })

  it('uses the authenticated request path when a session is available', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(profilePayload()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await fetchPublicProfile(authenticatedFetch, true, 'aririvera')

    expect(authenticatedFetch).toHaveBeenCalledWith('/profiles/aririvera')
  })

  it('distinguishes a missing profile from other request failures', async () => {
    const notFoundFetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    const unavailableFetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))

    await expect(fetchPublicProfile(notFoundFetch, true, 'missing')).rejects.toMatchObject({
      code: 'not-found',
    } satisfies Partial<PublicProfileRequestError>)
    await expect(fetchPublicProfile(unavailableFetch, true, 'offline')).rejects.toMatchObject({
      code: 'unavailable',
    } satisfies Partial<PublicProfileRequestError>)
  })

  it('rejects a successful response that is missing required public fields', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ displayName: 'Ari Rivera' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(fetchPublicProfile(authenticatedFetch, true, 'aririvera')).rejects.toMatchObject({
      code: 'invalid-payload',
    } satisfies Partial<PublicProfileRequestError>)
  })

  it('builds public identity, newest-first scenes, and aggregate stats without email', () => {
    const viewModel = buildProfileViewModel(profilePayload([
      scene(1, 'Older Scene', '2026-01-01T12:00:00Z', 1200, 20, 8),
      scene(2, 'Newer Scene', '2026-09-20T12:00:00Z', 3400, 45, 12),
    ]))

    expect(viewModel.displayName).toBe('Ari Rivera')
    expect(viewModel.handle).toBe('aririvera')
    expect(viewModel.description).toBe('Slow visual spaces built for late-night listening.')
    expect(viewModel).not.toHaveProperty('email')
    expect(viewModel.initials).toBe('AR')
    expect(viewModel.scenes.map((item) => item.name)).toEqual(['Newer Scene', 'Older Scene'])
    expect(viewModel.stats).toEqual({ likes: 65, saves: 20, scenes: 2, views: 4600 })
  })

  it('filters scene titles without changing the source order', () => {
    const scenes = [
      scene(1, 'Mercury in Bloom', '2026-09-20T12:00:00Z', 0, 0, 0),
      scene(2, 'Copper Reef', '2026-09-19T12:00:00Z', 0, 0, 0),
    ]

    expect(filterProfileScenes(scenes, '  MERCURY ')).toEqual([scenes[0]])
    expect(filterProfileScenes(scenes, '')).toBe(scenes)
  })
})

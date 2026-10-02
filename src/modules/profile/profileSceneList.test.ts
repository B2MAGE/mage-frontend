import { describe, expect, it } from 'vitest'
import type { SceneListResponse } from '@shared/lib'
import {
  buildProfileScenePage,
  DEFAULT_PROFILE_PAGE_SIZE,
  PROFILE_PAGE_SIZE_OPTIONS,
  PROFILE_SCENE_SORT_OPTIONS,
} from './profileSceneList'

function scene(sceneId: number, overrides: Partial<SceneListResponse> = {}): SceneListResponse {
  return {
    sceneId,
    name: `Scene ${sceneId}`,
    createdAt: new Date(Date.UTC(2026, 0, sceneId)).toISOString(),
    creatorDisplayName: 'Ari Rivera',
    creatorHandle: 'aririvera',
    ownerUserId: 1,
    description: null,
    sceneData: {},
    thumbnailRef: null,
    engagement: {
      currentUserSaved: false,
      currentUserVote: null,
      downvotes: 0,
      saves: 0,
      upvotes: sceneId,
      views: sceneId * 10,
    },
    ...overrides,
  }
}

const scenes = Array.from({ length: 30 }, (_, index) => scene(index + 1))
const defaults = { scenes, query: '', sort: 'descending' as const, pageIndex: 0, pageSize: 12 }

describe('profile scene browsing', () => {
  it('offers the mockup sort choices and responsive-grid page sizes', () => {
    expect(PROFILE_SCENE_SORT_OPTIONS).toEqual([
      { label: 'Newest first', value: 'descending' },
      { label: 'Oldest first', value: 'ascending' },
      { label: 'Most viewed', value: 'most-viewed' },
      { label: 'Most liked', value: 'most-liked' },
    ])
    expect(PROFILE_PAGE_SIZE_OPTIONS).toEqual([12, 24, 48])
    expect(DEFAULT_PROFILE_PAGE_SIZE).toBe(12)
  })

  it('sorts the entire collection before selecting a page without changing its source', () => {
    const before = structuredClone(scenes)
    const first = buildProfileScenePage(defaults)
    const second = buildProfileScenePage({ ...defaults, pageIndex: 1 })
    const last = buildProfileScenePage({ ...defaults, pageIndex: 2 })

    expect(first.scenes.map((item) => item.sceneId)).toEqual([30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19])
    expect(second.scenes.map((item) => item.sceneId)).toEqual([18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7])
    expect(last.scenes.map((item) => item.sceneId)).toEqual([6, 5, 4, 3, 2, 1])
    expect(last).toMatchObject({ totalScenes: 30, pageCount: 3, currentPageIndex: 2, pageStart: 24, pageEnd: 30, pageSize: 12 })
    expect(scenes).toEqual(before)
  })

  it('searches every page using a trimmed, case-insensitive title query', () => {
    const result = buildProfileScenePage({ ...defaults, query: '  SCENE 1 ', pageIndex: 2 })

    expect(result.scenes.map((item) => item.sceneId)).toEqual([19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 1])
    expect(result).toMatchObject({ totalScenes: 11, pageCount: 1, currentPageIndex: 0, pageStart: 0, pageEnd: 11 })
  })

  it('supports oldest first, most viewed, and most liked across page boundaries', () => {
    const older = scene(1)
    const mostViewed = scene(2, { engagement: { ...older.engagement, views: 100_000 } })
    const mostLiked = scene(3, { engagement: { ...older.engagement, upvotes: 10_000 } })
    const input = [older, mostViewed, mostLiked, ...scenes.slice(3)]

    expect(buildProfileScenePage({ ...defaults, scenes: input, sort: 'ascending' }).scenes[0].sceneId).toBe(1)
    expect(buildProfileScenePage({ ...defaults, scenes: input, sort: 'most-viewed' }).scenes[0].sceneId).toBe(2)
    expect(buildProfileScenePage({ ...defaults, scenes: input, sort: 'most-liked' }).scenes[0].sceneId).toBe(3)
  })

  it.each(['descending', 'most-viewed', 'most-liked'] as const)('breaks %s ties by newest date and then ID, with invalid dates last', (sort) => {
    const sameScore = scene(1).engagement
    const input = [
      scene(5, { createdAt: 'not a date', engagement: sameScore }),
      scene(2, { createdAt: '2026-01-02T00:00:00Z', engagement: sameScore }),
      scene(1, { createdAt: '2026-01-01T00:00:00Z', engagement: sameScore }),
      scene(3, { createdAt: '2026-01-02T00:00:00Z', engagement: sameScore }),
      scene(4, { createdAt: '', engagement: sameScore }),
    ]

    expect(buildProfileScenePage({ ...defaults, scenes: input, sort }).scenes.map((item) => item.sceneId)).toEqual([3, 2, 1, 5, 4])
  })

  it('keeps invalid dates last for oldest-first sorting and orders equal dates deterministically', () => {
    const input = [scene(4, { createdAt: '' }), scene(2), scene(3, { createdAt: scene(2).createdAt }), scene(1), scene(5, { createdAt: 'invalid' })]
    expect(buildProfileScenePage({ ...defaults, scenes: input, sort: 'ascending' }).scenes.map((item) => item.sceneId)).toEqual([1, 2, 3, 4, 5])
  })

  it.each([
    { pageIndex: -3, expected: 0 },
    { pageIndex: Number.NaN, expected: 0 },
    { pageIndex: Number.POSITIVE_INFINITY, expected: 0 },
    { pageIndex: Number.NEGATIVE_INFINITY, expected: 0 },
    { pageIndex: 1.9, expected: 1 },
    { pageIndex: 999, expected: 2 },
  ])('clamps invalid or out-of-range page index $pageIndex to $expected', ({ pageIndex, expected }) => {
    expect(buildProfileScenePage({ ...defaults, pageIndex }).currentPageIndex).toBe(expected)
  })

  it.each([0, -1, 5, Number.NaN, Number.POSITIVE_INFINITY])('falls back to the default for unsupported page size %s', (pageSize) => {
    const result = buildProfileScenePage({ ...defaults, pageSize })
    expect(result.pageSize).toBe(12)
    expect(result.scenes).toHaveLength(12)
  })

  it('uses supported larger page sizes and clamps after their page count shrinks', () => {
    expect(buildProfileScenePage({ ...defaults, pageSize: 24, pageIndex: 2 })).toMatchObject({ currentPageIndex: 1, pageCount: 2, pageStart: 24, pageEnd: 30 })
    expect(buildProfileScenePage({ ...defaults, pageSize: 48, pageIndex: 2 })).toMatchObject({ currentPageIndex: 0, pageCount: 1, pageStart: 0, pageEnd: 30 })
  })

  it.each([{ scenes: [], query: '' }, { scenes, query: 'No matching title' }])('returns a bounded, empty first page when nothing matches', (input) => {
    expect(buildProfileScenePage({ ...defaults, ...input, pageIndex: 12 })).toEqual({
      scenes: [], totalScenes: 0, pageCount: 1, currentPageIndex: 0, pageStart: 0, pageEnd: 0, pageSize: 12,
    })
  })
})

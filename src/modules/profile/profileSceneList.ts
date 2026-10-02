import { sortDiscoveryScenes, type DiscoverySort } from '@modules/discovery'
import type { SceneListResponse } from '@shared/lib'
import { filterProfileScenes } from './profileData'

export const PROFILE_SCENE_SORT_OPTIONS = [
  { label: 'Newest first', value: 'descending' },
  { label: 'Oldest first', value: 'ascending' },
  { label: 'Most viewed', value: 'most-viewed' },
  { label: 'Most liked', value: 'most-liked' },
] as const satisfies ReadonlyArray<{ label: string; value: DiscoverySort }>

export const PROFILE_PAGE_SIZE_OPTIONS = [12, 24, 48] as const
export const DEFAULT_PROFILE_PAGE_SIZE = PROFILE_PAGE_SIZE_OPTIONS[0]

type ProfileScenePageOptions = {
  scenes: SceneListResponse[]
  query: string
  sort: DiscoverySort
  pageIndex: number
  pageSize: number
}

export function buildProfileScenePage({ scenes, query, sort, pageIndex, pageSize }: ProfileScenePageOptions) {
  const resolvedPageSize = PROFILE_PAGE_SIZE_OPTIONS.find((size) => size === pageSize) ?? DEFAULT_PROFILE_PAGE_SIZE
  const sortedScenes = sortDiscoveryScenes(filterProfileScenes(scenes, query), sort)
  const totalScenes = sortedScenes.length
  const pageCount = Math.max(1, Math.ceil(totalScenes / resolvedPageSize))
  const requestedPageIndex = Number.isFinite(pageIndex) ? Math.max(0, Math.floor(pageIndex)) : 0
  const currentPageIndex = Math.min(requestedPageIndex, pageCount - 1)
  const pageStart = currentPageIndex * resolvedPageSize
  const pageEnd = Math.min(pageStart + resolvedPageSize, totalScenes)

  return {
    scenes: sortedScenes.slice(pageStart, pageEnd),
    totalScenes,
    pageCount,
    currentPageIndex,
    pageStart,
    pageEnd,
    pageSize: resolvedPageSize,
  }
}

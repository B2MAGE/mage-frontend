import type { DiscoveryScene, DiscoverySort, DiscoveryTag } from './types'

export const DEFAULT_DISCOVERY_SORT: DiscoverySort = 'descending'

const DISCOVERY_SORT_VALUES = new Set<DiscoverySort>([
  'ascending',
  'descending',
  'most-viewed',
  'most-liked',
  'featured',
  'recommended',
])

export function readActiveDiscoveryTag(searchParams: URLSearchParams) {
  const currentTag = searchParams.get('tag')?.trim()
  return currentTag ? currentTag : null
}

export function readActiveDiscoverySort(searchParams: URLSearchParams): DiscoverySort {
  const sort = searchParams.get('sort')?.trim()
  return DISCOVERY_SORT_VALUES.has(sort as DiscoverySort)
    ? sort as DiscoverySort
    : DEFAULT_DISCOVERY_SORT
}

function sceneCreationTime(scene: DiscoveryScene) {
  const timestamp = Date.parse(scene.createdAt)
  return Number.isNaN(timestamp) ? null : timestamp
}

function compareByPublishedDate(
  left: DiscoveryScene,
  right: DiscoveryScene,
  direction: 'ascending' | 'descending',
) {
  const leftTime = sceneCreationTime(left)
  const rightTime = sceneCreationTime(right)

  if (leftTime === null && rightTime === null) {
    return direction === 'ascending'
      ? left.sceneId - right.sceneId
      : right.sceneId - left.sceneId
  }
  if (leftTime === null) return 1
  if (rightTime === null) return -1

  const dateDifference = direction === 'ascending'
    ? leftTime - rightTime
    : rightTime - leftTime

  if (dateDifference !== 0) return dateDifference
  return direction === 'ascending'
    ? left.sceneId - right.sceneId
    : right.sceneId - left.sceneId
}

export function sortDiscoveryScenes(scenes: DiscoveryScene[], sort: DiscoverySort) {
  const publishedDateDirection = sort === 'ascending' ? 'ascending' : 'descending'

  return [...scenes].sort((left, right) => {
    if (sort === 'most-viewed') {
      const viewDifference = right.engagement.views - left.engagement.views
      if (viewDifference !== 0) return viewDifference
    }

    if (sort === 'most-liked') {
      const likeDifference = right.engagement.upvotes - left.engagement.upvotes
      if (likeDifference !== 0) return likeDifference
    }

    return compareByPublishedDate(left, right, publishedDateDirection)
  })
}

export function buildAvailableDiscoveryTags(tags: DiscoveryTag[], activeTag: string | null) {
  if (!activeTag || tags.some((tag) => tag.name === activeTag)) {
    return tags
  }

  return [
    ...tags,
    {
      tagId: -1,
      name: activeTag,
      sceneCount: 0,
    },
  ]
}

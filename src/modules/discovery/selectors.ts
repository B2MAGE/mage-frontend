import type { DiscoveryPageQuery, DiscoveryScene, DiscoverySort, DiscoveryTag } from './types'

export const DEFAULT_DISCOVERY_SORT: DiscoverySort = 'descending'
export const DISCOVERY_PAGE_SIZE_OPTIONS = [12, 24, 48] as const
export const DEFAULT_DISCOVERY_PAGE_SIZE = DISCOVERY_PAGE_SIZE_OPTIONS[0]

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

export function readDiscoveryQuery(searchParams: URLSearchParams): DiscoveryPageQuery {
  const rawPage = searchParams.get('page') ?? '1'
  const parsedPage = /^\d+$/.test(rawPage) ? Number(rawPage) : 0
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 && parsedPage <= 2147483647 ? parsedPage : 1
  const parsedSize = Number(searchParams.get('size'))
  const size = DISCOVERY_PAGE_SIZE_OPTIONS.find(value => value === parsedSize) ?? DEFAULT_DISCOVERY_PAGE_SIZE
  return { page: page - 1, size, sort: readActiveDiscoverySort(searchParams), tag: readActiveDiscoveryTag(searchParams) }
}

export function normalizeDiscoverySearchParams(searchParams: URLSearchParams) {
  const query = readDiscoveryQuery(searchParams)
  const normalized = new URLSearchParams(searchParams)
  for (const [key, value] of [['page', String(query.page + 1)], ['size', String(query.size)], ['sort', query.sort]] as const) {
    if (searchParams.has(key) && (searchParams.getAll(key).length !== 1 || searchParams.get(key) !== value)) {
      normalized.set(key, value)
    }
  }
  if (searchParams.has('tag')) {
    if (query.tag) normalized.set('tag', query.tag)
    else normalized.delete('tag')
  }
  return normalized
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

export function sortDiscoveryScenes<T extends DiscoveryScene>(scenes: T[], sort: DiscoverySort): T[] {
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

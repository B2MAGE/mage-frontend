import type { DiscoveryTag } from './types'

export function readActiveDiscoveryTag(searchParams: URLSearchParams) {
  const currentTag = searchParams.get('tag')?.trim()
  return currentTag ? currentTag : null
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
    },
  ]
}

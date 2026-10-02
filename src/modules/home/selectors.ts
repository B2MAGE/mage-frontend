import type { TagResponse } from '@shared/lib'

/** Home has room for four tags; discovery still exposes the whole collection. */
export function selectPopularHomeTags(tags: TagResponse[]) {
  return tags
    .filter(tag => Number.isFinite(tag.sceneCount) && tag.sceneCount > 0)
    .sort((left, right) =>
      right.sceneCount - left.sceneCount ||
      left.name.localeCompare(right.name, 'en') ||
      left.tagId - right.tagId,
    )
    .slice(0, 4)
}

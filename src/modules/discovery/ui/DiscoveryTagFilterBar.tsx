import { LoadingRegion, ScrollableTagBar, SelectableChip, Skeleton } from '@shared/ui'
import type { DiscoveryTag } from '../types'

type DiscoveryTagFilterBarProps = {
  activeTag: string | null
  isLoading: boolean
  tags: DiscoveryTag[]
  onTagSelect: (tag: string | null) => void
}

export function DiscoveryTagFilterBar({
  activeTag,
  isLoading,
  tags,
  onTagSelect,
}: DiscoveryTagFilterBarProps) {
  if (isLoading) {
    return (
      <LoadingRegion
        className="tag-filter-loading-region"
        label="Loading scene filters"
        visualClassName="tag-filter-bar tag-filter-bar--loading"
      >
        <Skeleton shape="block" className="tag-filter-bar__loading-placeholder" />
      </LoadingRegion>
    )
  }

  return (
    <ScrollableTagBar ariaLabel="Filter scenes by tag" role="toolbar">
      <SelectableChip
        active={activeTag === null}
        activeClassName="tag-pill--active"
        aria-pressed={activeTag === null}
        className="tag-pill"
        onClick={() => onTagSelect(null)}
      >
        All
      </SelectableChip>
      {tags.map((tag) => (
        <SelectableChip
          active={activeTag === tag.name}
          activeClassName="tag-pill--active"
          aria-pressed={activeTag === tag.name}
          className="tag-pill"
          key={tag.tagId}
          onClick={() => onTagSelect(tag.name)}
        >
          {tag.name}
        </SelectableChip>
      ))}
    </ScrollableTagBar>
  )
}

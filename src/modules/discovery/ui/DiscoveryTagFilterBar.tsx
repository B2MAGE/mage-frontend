import { ScrollableTagBar, SelectableChip } from '@shared/ui'
import type { DiscoveryTag } from '../types'

type DiscoveryTagFilterBarProps = {
  activeTag: string | null
  isLoading: boolean
  tags: DiscoveryTag[]
  onTagSelect: (tag: string | null) => void
}

const skeletonCount = 5

export function DiscoveryTagFilterBar({
  activeTag,
  isLoading,
  tags,
  onTagSelect,
}: DiscoveryTagFilterBarProps) {
  if (isLoading) {
    return (
      <div className="tag-filter-bar" aria-label="Tag filters loading">
        {Array.from({ length: skeletonCount }, (_, index) => (
          <span key={index} className="tag-pill tag-pill--skeleton" aria-hidden="true" />
        ))}
      </div>
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

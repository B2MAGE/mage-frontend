import type { TagResponse } from '@lib/api'
import { SelectableChip } from '@shared/ui'
import { ScrollableTagBar } from './ScrollableTagBar'

type TagFilterBarProps = {
  tags: TagResponse[]
  activeTag: string | null
  onTagSelect: (tag: string | null) => void
  isLoading: boolean
}

const skeletonCount = 5

export function TagFilterBar({ tags, activeTag, onTagSelect, isLoading }: TagFilterBarProps) {
  if (isLoading) {
    return (
      <div className="tag-filter-bar" aria-label="Tag filters loading">
        {Array.from({ length: skeletonCount }, (_, i) => (
          <span key={i} className="tag-pill tag-pill--skeleton" aria-hidden="true" />
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

import type { TagResponse } from '@lib/api'
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
      <button
        className={`tag-pill${activeTag === null ? ' tag-pill--active' : ''}`}
        aria-pressed={activeTag === null}
        onClick={() => onTagSelect(null)}
        type="button"
      >
        All
      </button>
      {tags.map((tag) => (
        <button
          key={tag.tagId}
          className={`tag-pill${activeTag === tag.name ? ' tag-pill--active' : ''}`}
          aria-pressed={activeTag === tag.name}
          onClick={() => onTagSelect(tag.name)}
          type="button"
        >
          {tag.name}
        </button>
      ))}
    </ScrollableTagBar>
  )
}

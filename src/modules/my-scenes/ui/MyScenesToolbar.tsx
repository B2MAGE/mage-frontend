import { SelectableChip } from '@shared/ui'
import type { SceneVisibility, SortDirection, SortKey, StatusFilter } from '../types'

type MyScenesToolbarProps = {
  availableStatuses: SceneVisibility[]
  selectedSceneCount: number
  sortSummary: string
  sortDirection: SortDirection
  sortKey: SortKey
  statusFilter: StatusFilter
  totalScenes: number
  onSelectSort: (sortKey: SortKey, sortDirection: SortDirection) => void
  onSelectStatus: (status: StatusFilter) => void
}

export function MyScenesToolbar({
  availableStatuses, selectedSceneCount, sortDirection, sortKey, sortSummary, statusFilter,
  totalScenes, onSelectSort, onSelectStatus,
}: MyScenesToolbarProps) {
  const statuses: SceneVisibility[] = ['Public', 'Draft', ...availableStatuses.filter((status) => status !== 'Public' && status !== 'Draft')]

  return (
    <div className="my-scenes-board__toolbar">
      <div aria-label="Scene status filters" className="my-scenes-board__filters" role="group">
        <SelectableChip active={statusFilter === 'All'} aria-label="All scenes" aria-pressed={statusFilter === 'All'} className="my-scenes-board__chip" onClick={() => onSelectStatus('All')}>All</SelectableChip>
        {statuses.map((status) => (
          <SelectableChip active={statusFilter === status} aria-pressed={statusFilter === status} className="my-scenes-board__chip" key={status} onClick={() => onSelectStatus(status)}>
            {status === 'Public' ? 'Published' : status === 'Draft' ? 'Drafts' : status}
          </SelectableChip>
        ))}
      </div>
      <span aria-hidden="true" className="my-scenes-board__toolbar-divider" />
      <span aria-live="polite" className="my-scenes-board__selected-copy">{selectedSceneCount} selected</span>
      <label className="my-scenes-board__compact-sort">
        <span className="my-scenes-sort-announcement">Sort scenes</span>
        <select
          aria-label="Sort scenes"
          onChange={(event) => {
            const [nextSortKey, nextSortDirection] = event.target.value.split(':') as [SortKey, SortDirection]
            onSelectSort(nextSortKey, nextSortDirection)
          }}
          value={sortKey + ':' + sortDirection}
        >
          <option value="updated:desc">Recently updated</option>
          <option value="updated:asc">Oldest updated</option>
          <option value="views:desc">Most viewed</option>
          <option value="comments:desc">Most commented</option>
          <option value="likes:desc">Highest rated</option>
          <option value="name:asc">Name A–Z</option>
        </select>
      </label>
      <span className="my-scenes-sort-announcement" aria-live="polite">{totalScenes} scenes. {sortSummary}</span>
    </div>
  )
}

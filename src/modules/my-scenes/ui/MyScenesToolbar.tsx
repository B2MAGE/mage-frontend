import { SelectableChip } from '@shared/ui'
import type { SceneVisibility, StatusFilter } from '../types'

type MyScenesToolbarProps = {
  availableStatuses: SceneVisibility[]
  selectedSceneCount: number
  sortSummary: string
  statusFilter: StatusFilter
  totalScenes: number
  onSelectStatus: (status: StatusFilter) => void
}

export function MyScenesToolbar({
  availableStatuses, selectedSceneCount, sortSummary, statusFilter, totalScenes, onSelectStatus,
}: MyScenesToolbarProps) {
  const statuses: SceneVisibility[] = ['Public', 'Draft', ...availableStatuses.filter((status) => status !== 'Public' && status !== 'Draft')]

  return (
    <div className="my-scenes-board__toolbar">
      <div aria-label="Scene status filters" className="my-scenes-board__filters" role="group">
        <SelectableChip active={statusFilter === 'All'} aria-pressed={statusFilter === 'All'} className="my-scenes-board__chip" onClick={() => onSelectStatus('All')}>All scenes</SelectableChip>
        {statuses.map((status) => (
          <SelectableChip active={statusFilter === status} aria-pressed={statusFilter === status} className="my-scenes-board__chip" key={status} onClick={() => onSelectStatus(status)}>
            {status === 'Public' ? 'Published' : status === 'Draft' ? 'Drafts' : status}
          </SelectableChip>
        ))}
      </div>
      <span aria-hidden="true" className="my-scenes-board__toolbar-divider" />
      <span aria-live="polite" className="my-scenes-board__selected-copy">{selectedSceneCount} selected</span>
      <span className="my-scenes-sort-announcement" aria-live="polite">{totalScenes} scenes. {sortSummary}</span>
    </div>
  )
}

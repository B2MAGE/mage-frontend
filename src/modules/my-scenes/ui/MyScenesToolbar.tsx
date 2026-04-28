import { SelectableChip } from '@shared/ui'
import type { SceneVisibility, StatusFilter } from '../types'

type MyScenesToolbarProps = {
  availableStatuses: SceneVisibility[]
  sortSummary: string
  statusFilter: StatusFilter
  totalScenes: number
  onSelectStatus: (status: StatusFilter) => void
}

export function MyScenesToolbar({
  availableStatuses,
  sortSummary,
  statusFilter,
  totalScenes,
  onSelectStatus,
}: MyScenesToolbarProps) {
  return (
    <div className="my-scenes-board__toolbar">
      <div className="my-scenes-board__summary">
        <strong>
          {totalScenes} scene{totalScenes === 1 ? '' : 's'}
        </strong>
        <span>{sortSummary}</span>
      </div>
      <div className="my-scenes-board__filters">
        <SelectableChip
          active={statusFilter === 'All'}
          className="my-scenes-board__chip"
          onClick={() => {
            onSelectStatus('All')
          }}
        >
          All
        </SelectableChip>
        {availableStatuses.map((status) => (
          <SelectableChip
            active={statusFilter === status}
            className="my-scenes-board__chip"
            key={status}
            onClick={() => {
              onSelectStatus(status)
            }}
          >
            {status}
          </SelectableChip>
        ))}
      </div>
    </div>
  )
}

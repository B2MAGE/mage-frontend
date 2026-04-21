import type { SceneVisibility, StatusFilter } from '@lib/myScenes'
import { SelectableChip } from '@shared/ui'

type MyScenesToolbarProps = {
  availableStatuses: SceneVisibility[]
  sortSummary: string
  totalScenes: number
  statusFilter: StatusFilter
  onSelectStatus: (status: StatusFilter) => void
}

export function MyScenesToolbar({
  availableStatuses,
  sortSummary,
  totalScenes,
  statusFilter,
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

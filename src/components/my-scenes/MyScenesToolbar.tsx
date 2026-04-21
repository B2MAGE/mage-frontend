import type { SceneVisibility, StatusFilter } from '@lib/myScenes'

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
        <button
          className="my-scenes-board__chip"
          data-active={statusFilter === 'All'}
          onClick={() => {
            onSelectStatus('All')
          }}
          type="button"
        >
          All
        </button>
        {availableStatuses.map((status) => (
          <button
            key={status}
            className="my-scenes-board__chip"
            data-active={statusFilter === status}
            onClick={() => {
              onSelectStatus(status)
            }}
            type="button"
          >
            {status}
          </button>
        ))}
      </div>
    </div>
  )
}

import type { PresetVisibility, StatusFilter } from '../../lib/myPresets'

type MyPresetsToolbarProps = {
  availableStatuses: PresetVisibility[]
  sortSummary: string
  totalPresets: number
  statusFilter: StatusFilter
  onSelectStatus: (status: StatusFilter) => void
}

export function MyPresetsToolbar({
  availableStatuses,
  sortSummary,
  totalPresets,
  statusFilter,
  onSelectStatus,
}: MyPresetsToolbarProps) {
  return (
    <div className="my-presets-board__toolbar">
      <div className="my-presets-board__summary">
        <strong>
          {totalPresets} preset{totalPresets === 1 ? '' : 's'}
        </strong>
        <span>{sortSummary}</span>
      </div>
      <div className="my-presets-board__filters">
        <button
          className="my-presets-board__chip"
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
            className="my-presets-board__chip"
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

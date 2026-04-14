import type { RefObject } from 'react'
import { Link } from 'react-router-dom'
import {
  buildSortAriaLabel,
  formatCompactCount,
  formatPresetDate,
  type SortDirection,
  type SortKey,
  type UserPreset,
} from '../../lib/myPresets'

type MyPresetsTableProps = {
  allPagePresetsSelected: boolean
  pagedPresets: UserPreset[]
  selectAllCheckboxRef: RefObject<HTMLInputElement | null>
  selectedPresetIdSet: Set<number>
  sortDirection: SortDirection
  sortKey: SortKey
  onSort: (sortKey: SortKey) => void
  onTogglePresetSelection: (presetId: number) => void
  onToggleSelectAll: () => void
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean
  direction: SortDirection
}) {
  return (
    <span className="my-presets-table__sort-indicator" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none">
        <path
          d="M8 3.5 5.25 6.25h5.5L8 3.5Z"
          fill="currentColor"
          opacity={active && direction === 'asc' ? '1' : '0.45'}
        />
        <path
          d="m8 12.5 2.75-2.75h-5.5L8 12.5Z"
          fill="currentColor"
          opacity={active && direction === 'desc' ? '1' : '0.45'}
        />
      </svg>
    </span>
  )
}

function SortButton({
  activeSortKey,
  label,
  sortDirection,
  sortKey,
  onSort,
}: {
  activeSortKey: SortKey
  label: string
  sortDirection: SortDirection
  sortKey: SortKey
  onSort: (sortKey: SortKey) => void
}) {
  return (
    <button
      className="my-presets-table__sort-button"
      aria-label={buildSortAriaLabel(label, sortKey, activeSortKey, sortDirection)}
      data-active={activeSortKey === sortKey}
      onClick={() => {
        onSort(sortKey)
      }}
      type="button"
    >
      {label}
      <SortIndicator active={activeSortKey === sortKey} direction={sortDirection} />
    </button>
  )
}

export function MyPresetsTable({
  allPagePresetsSelected,
  pagedPresets,
  selectAllCheckboxRef,
  selectedPresetIdSet,
  sortDirection,
  sortKey,
  onSort,
  onTogglePresetSelection,
  onToggleSelectAll,
}: MyPresetsTableProps) {
  return (
    <div className="my-presets-scroll">
      <div className="my-presets-table" aria-label="My presets" role="list">
        <div className="my-presets-table__head">
          <div className="my-presets-table__primary-heading">
            <input
              ref={selectAllCheckboxRef}
              checked={allPagePresetsSelected}
              className="my-presets-table__checkbox"
              onChange={onToggleSelectAll}
              type="checkbox"
              aria-label="Select all presets on this page"
            />
            <span>Preset</span>
          </div>
          <span className="my-presets-table__status-heading">Status</span>
          <SortButton
            activeSortKey={sortKey}
            label="Updated"
            sortDirection={sortDirection}
            sortKey="updated"
            onSort={onSort}
          />
          <SortButton
            activeSortKey={sortKey}
            label="Views"
            sortDirection={sortDirection}
            sortKey="views"
            onSort={onSort}
          />
          <span>Comments</span>
          <SortButton
            activeSortKey={sortKey}
            label="Likes (vs dislikes)"
            sortDirection={sortDirection}
            sortKey="likes"
            onSort={onSort}
          />
        </div>

        {pagedPresets.map((preset) => (
          <article key={preset.id} className="my-presets-row" role="listitem">
            <div className="my-presets-row__primary">
              <label className="my-presets-row__selection">
                <input
                  checked={selectedPresetIdSet.has(preset.id)}
                  className="my-presets-table__checkbox"
                  onChange={() => {
                    onTogglePresetSelection(preset.id)
                  }}
                  type="checkbox"
                  aria-label={`Select ${preset.name}`}
                />
              </label>
              <Link
                aria-label="Open preset preview"
                className="my-presets-row__thumb-link"
                to={`/presets/${preset.id}`}
              >
                {preset.thumbnailRef ? (
                  <img
                    className="my-presets-row__thumb"
                    src={preset.thumbnailRef}
                    alt={`${preset.name} thumbnail`}
                  />
                ) : (
                  <div
                    className="my-presets-row__thumb-fallback"
                    aria-label={`${preset.name} thumbnail unavailable`}
                  >
                    No thumbnail available
                  </div>
                )}
              </Link>
              <div className="my-presets-row__copy">
                <Link className="my-presets-row__title-link" to={`/presets/${preset.id}`}>
                  <strong>{preset.name}</strong>
                </Link>
                <button className="my-presets-row__description" type="button">
                  {preset.description ?? 'Add description'}
                </button>
              </div>
            </div>

            <div className="my-presets-row__cell my-presets-row__cell--status">
              <span className="my-presets-row__pill" data-status={preset.statusLabel}>
                {preset.statusLabel}
              </span>
            </div>

            <div className="my-presets-row__cell">
              <strong>{formatPresetDate(preset.createdAt)}</strong>
            </div>

            <div className="my-presets-row__metric">
              <strong>{formatCompactCount(preset.viewsCount)}</strong>
            </div>

            <div className="my-presets-row__metric">
              <strong>{formatCompactCount(preset.commentsCount)}</strong>
            </div>

            <div className="my-presets-row__metric">
              <strong>{preset.likesRatio}%</strong>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

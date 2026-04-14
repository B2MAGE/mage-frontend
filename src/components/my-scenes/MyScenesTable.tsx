import type { RefObject } from 'react'
import { Link } from 'react-router-dom'
import {
  buildSortAriaLabel,
  formatCompactCount,
  formatSceneDate,
  type SortDirection,
  type SortKey,
  type UserScene,
} from '../../lib/myScenes'

type MyScenesTableProps = {
  allPageScenesSelected: boolean
  pagedScenes: UserScene[]
  selectAllCheckboxRef: RefObject<HTMLInputElement | null>
  selectedSceneIdSet: Set<number>
  sortDirection: SortDirection
  sortKey: SortKey
  onSort: (sortKey: SortKey) => void
  onToggleSceneSelection: (sceneId: number) => void
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
    <span className="my-scenes-table__sort-indicator" aria-hidden="true">
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
      className="my-scenes-table__sort-button"
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

export function MyScenesTable({
  allPageScenesSelected,
  pagedScenes,
  selectAllCheckboxRef,
  selectedSceneIdSet,
  sortDirection,
  sortKey,
  onSort,
  onToggleSceneSelection,
  onToggleSelectAll,
}: MyScenesTableProps) {
  return (
    <div className="my-scenes-scroll">
      <div className="my-scenes-table" aria-label="My scenes" role="list">
        <div className="my-scenes-table__head">
          <div className="my-scenes-table__primary-heading">
            <input
              ref={selectAllCheckboxRef}
              checked={allPageScenesSelected}
              className="my-scenes-table__checkbox"
              onChange={onToggleSelectAll}
              type="checkbox"
              aria-label="Select all scenes on this page"
            />
            <span>Scene</span>
          </div>
          <span className="my-scenes-table__status-heading">Status</span>
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

        {pagedScenes.map((scene) => (
          <article key={scene.id} className="my-scenes-row" role="listitem">
            <div className="my-scenes-row__primary">
              <label className="my-scenes-row__selection">
                <input
                  checked={selectedSceneIdSet.has(scene.id)}
                  className="my-scenes-table__checkbox"
                  onChange={() => {
                    onToggleSceneSelection(scene.id)
                  }}
                  type="checkbox"
                  aria-label={`Select ${scene.name}`}
                />
              </label>
              <Link
                aria-label="Open scene preview"
                className="my-scenes-row__thumb-link"
                to={`/scenes/${scene.id}`}
              >
                {scene.thumbnailRef ? (
                  <img
                    className="my-scenes-row__thumb"
                    src={scene.thumbnailRef}
                    alt={`${scene.name} thumbnail`}
                  />
                ) : (
                  <div
                    className="my-scenes-row__thumb-fallback"
                    aria-label={`${scene.name} thumbnail unavailable`}
                  >
                    No thumbnail available
                  </div>
                )}
              </Link>
              <div className="my-scenes-row__copy">
                <Link className="my-scenes-row__title-link" to={`/scenes/${scene.id}`}>
                  <strong>{scene.name}</strong>
                </Link>
                <button className="my-scenes-row__description" type="button">
                  {scene.description ?? 'Add description'}
                </button>
              </div>
            </div>

            <div className="my-scenes-row__cell my-scenes-row__cell--status">
              <span className="my-scenes-row__pill" data-status={scene.statusLabel}>
                {scene.statusLabel}
              </span>
            </div>

            <div className="my-scenes-row__cell">
              <strong>{formatSceneDate(scene.createdAt)}</strong>
            </div>

            <div className="my-scenes-row__metric">
              <strong>{formatCompactCount(scene.viewsCount)}</strong>
            </div>

            <div className="my-scenes-row__metric">
              <strong>{formatCompactCount(scene.commentsCount)}</strong>
            </div>

            <div className="my-scenes-row__metric">
              <strong>{scene.likesRatio}%</strong>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

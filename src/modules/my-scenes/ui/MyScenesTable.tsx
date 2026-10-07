import type { RefObject } from 'react'
import { Link } from 'react-router-dom'
import { formatCalendarDate, formatCompactCount } from '@shared/lib'
import { TableSortButton } from '@shared/ui'
import { buildSortAriaLabel } from '../selectors'
import type { SortDirection, SortKey, UserScene } from '../types'

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

export function MyScenesTable({
  allPageScenesSelected, pagedScenes, selectAllCheckboxRef, selectedSceneIdSet, sortDirection, sortKey,
  onSort, onToggleSceneSelection, onToggleSelectAll,
}: MyScenesTableProps) {
  const columns: {key: SortKey; label: string; numeric?: boolean}[] = [
    {key: 'name', label: 'Scene'}, {key: 'status', label: 'Status'}, {key: 'updated', label: 'Updated'},
    {key: 'views', label: 'Views', numeric: true}, {key: 'comments', label: 'Comments', numeric: true},
    {key: 'likes', label: 'Like ratio', numeric: true},
  ]

  return (
    <div className="my-scenes-scroll" tabIndex={0} role="region" aria-label="Scene library table">
      <table className="my-scenes-table" aria-label="My scenes">
        <thead>
          <tr>
            <th className="my-scenes-check-cell" scope="col">
              <input ref={selectAllCheckboxRef} checked={allPageScenesSelected} className="my-scenes-table__checkbox" onChange={onToggleSelectAll} type="checkbox" aria-label="Select all scenes on this page" />
            </th>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.numeric ? 'my-scenes-numeric' : undefined} aria-sort={sortKey === column.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}>
                <TableSortButton active={sortKey === column.key} aria-label={buildSortAriaLabel(column.label, column.key, sortKey, sortDirection)} className="my-scenes-table__sort-button" direction={sortDirection} label={column.label} onClick={() => onSort(column.key)} />
              </th>
            ))}
            <th className="my-scenes-action-cell" scope="col"><span className="my-scenes-sort-announcement">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {pagedScenes.map((scene, sceneIndex) => (
            <tr key={scene.id} className="my-scenes-row" data-selected={selectedSceneIdSet.has(scene.id)}>
              <td className="my-scenes-check-cell"><input checked={selectedSceneIdSet.has(scene.id)} className="my-scenes-table__checkbox" onChange={() => onToggleSceneSelection(scene.id)} type="checkbox" aria-label={'Select ' + scene.name} /></td>
              <td className="my-scenes-row__scene-cell">
                <div className="my-scenes-row__primary">
                  <Link aria-label="Open scene preview" className="my-scenes-row__thumb-link" to={'/scenes/' + scene.id}>
                    {scene.thumbnailRef ? <img className="my-scenes-row__thumb" src={scene.thumbnailRef} alt={scene.name + ' thumbnail'} /> : <div className="my-scenes-row__thumb-fallback" aria-label={scene.name + ' thumbnail unavailable'} role="img" />}
                  </Link>
                  <div className="my-scenes-row__copy">
                    {sceneIndex === 0 ? <span className="my-scenes-row__continue-label">Continue editing</span> : null}
                    <Link className="my-scenes-row__title-link" to={'/scenes/' + scene.id}><strong>{scene.name}</strong></Link>
                    <span className="my-scenes-row__description">{scene.description ?? 'Add description'}</span>
                    <span aria-hidden="true" className="my-scenes-row__responsive-meta">
                      <span>{formatCompactCount(scene.viewsCount)} views</span>
                      <span>{scene.likesRatio}% likes</span>
                      <span>Updated {formatCalendarDate(scene.createdAt)}</span>
                    </span>
                  </div>
                </div>
              </td>
              <td className="my-scenes-row__status-cell"><span className="my-scenes-row__pill" data-status={scene.statusLabel}>{scene.statusLabel === 'Public' ? 'Published' : scene.statusLabel}</span></td>
              <td className="my-scenes-row__updated-cell">{formatCalendarDate(scene.createdAt)}</td>
              <td className="my-scenes-numeric my-scenes-row__views-cell">{formatCompactCount(scene.viewsCount)}</td>
              <td className="my-scenes-numeric my-scenes-row__comments-cell">{formatCompactCount(scene.commentsCount)}</td>
              <td className="my-scenes-numeric my-scenes-row__likes-cell"><span className="my-scenes-ratio">{scene.likesRatio}%<span className="my-scenes-ratio__track" aria-hidden="true"><span style={{ width: scene.likesRatio + '%' }} /></span></span></td>
              <td className="my-scenes-action-cell my-scenes-row__actions-cell"><div role="group" aria-label={'Actions for ' + scene.name}><Link aria-label="Open scene preview" className="my-scenes-open-button" to={'/scenes/' + scene.id}>Open</Link><Link aria-label="Edit scene" className="my-scenes-edit-button" to={'/scenes/' + scene.id + '/edit'}>Edit</Link></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

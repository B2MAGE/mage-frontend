import { PaginationIconButton } from './PaginationIconButton'
import './scenePagination.css'

export type ScenePaginationProps = {
  label: string
  currentPageIndex: number
  onPageChange: (pageIndex: number) => void
  onPageSizeChange: (pageSize: number) => void
  pageCount: number
  pageEnd: number
  pageSize: number
  pageSizeOptions: readonly number[]
  pageStart: number
  totalScenes: number
}

export function ScenePagination({
  label, currentPageIndex, onPageChange, onPageSizeChange, pageCount,
  pageEnd, pageSize, pageSizeOptions, pageStart, totalScenes,
}: ScenePaginationProps) {
  return (
    <nav className="scene-pagination" aria-label={label}>
      <label className="scene-pagination__size">
        <span>Per page</span>
        <select aria-label="Scenes per page" className="mage-select"
          onChange={(event) => onPageSizeChange(Number(event.target.value))} value={pageSize}>
          {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <span className="scene-pagination__range" aria-live="polite">
        {totalScenes === 0 ? '0 of 0 scenes' : `${pageStart + 1}\u2013${pageEnd} of ${totalScenes} scenes`}
      </span>
      <div className="scene-pagination__controls">
        <PaginationIconButton className="scene-pagination__button" direction="left"
          disabled={currentPageIndex === 0} label="Go to previous page"
          onClick={() => onPageChange(currentPageIndex - 1)} />
        <span className="scene-pagination__page">Page {currentPageIndex + 1} of {Math.max(1, pageCount)}</span>
        <PaginationIconButton className="scene-pagination__button" direction="right"
          disabled={currentPageIndex >= pageCount - 1} label="Go to next page"
          onClick={() => onPageChange(currentPageIndex + 1)} />
      </div>
    </nav>
  )
}

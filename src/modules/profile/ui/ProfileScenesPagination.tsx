import { PaginationIconButton } from '@shared/ui'
import { PROFILE_PAGE_SIZE_OPTIONS } from '../profileSceneList'

type ProfileScenesPaginationProps = {
  currentPageIndex: number
  onPageChange: (pageIndex: number) => void
  onPageSizeChange: (pageSize: number) => void
  pageCount: number
  pageEnd: number
  pageSize: number
  pageStart: number
  totalScenes: number
}

export function ProfileScenesPagination({
  currentPageIndex,
  onPageChange,
  onPageSizeChange,
  pageCount,
  pageEnd,
  pageSize,
  pageStart,
  totalScenes,
}: ProfileScenesPaginationProps) {
  return (
    <nav className="profile-scenes-pagination" aria-label="Profile scene pagination">
      <label className="profile-scenes-pagination__size">
        <span>Scenes per page</span>
        <select
          className="mage-select"
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          value={pageSize}
        >
          {PROFILE_PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <span className="profile-scenes-pagination__range" aria-live="polite">
        {totalScenes === 0 ? '0 of 0 scenes' : `${pageStart + 1}\u2013${pageEnd} of ${totalScenes} scenes`}
      </span>
      <div className="profile-scenes-pagination__controls">
        <PaginationIconButton
          className="profile-scenes-pagination__button"
          direction="left"
          disabled={currentPageIndex === 0}
          label="Go to previous page"
          onClick={() => onPageChange(currentPageIndex - 1)}
        />
        <span className="profile-scenes-pagination__page">Page {currentPageIndex + 1} of {pageCount}</span>
        <PaginationIconButton
          className="profile-scenes-pagination__button"
          direction="right"
          disabled={currentPageIndex >= pageCount - 1}
          label="Go to next page"
          onClick={() => onPageChange(currentPageIndex + 1)}
        />
      </div>
    </nav>
  )
}

import { MY_SCENES_ROWS_PER_PAGE_OPTIONS } from '../selectors'

type MyScenesPaginationProps = {
  currentPageIndex: number
  pageCount: number
  pageEnd: number
  pageStart: number
  rowsPerPage: number
  totalScenes: number
  onGoToNextPage: () => void
  onGoToPreviousPage: () => void
  onSelectRowsPerPage: (value: number) => void
}

export function MyScenesPagination({
  currentPageIndex, pageCount, pageEnd, pageStart, rowsPerPage, totalScenes,
  onGoToNextPage, onGoToPreviousPage, onSelectRowsPerPage,
}: MyScenesPaginationProps) {
  return (
    <div className="my-scenes-pagination" aria-label="Scene pagination" role="navigation">
      <label className="my-scenes-pagination__rows">Rows per page
        <select value={rowsPerPage} onChange={(event) => onSelectRowsPerPage(Number(event.target.value))}>
          {MY_SCENES_ROWS_PER_PAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <span className="my-scenes-pagination__range">{totalScenes === 0 ? '0-0 of 0' : (pageStart + 1) + '-' + pageEnd + ' of ' + totalScenes}</span>
      <div className="my-scenes-pagination__controls">
        <button type="button" className="my-scenes-page-button" disabled={currentPageIndex === 0} aria-label="Go to previous page" onClick={onGoToPreviousPage}>Previous</button>
        <span className="my-scenes-page-number" aria-current="page" aria-label={'Page ' + (currentPageIndex + 1)}>{currentPageIndex + 1}</span>
        <button type="button" className="my-scenes-page-button" disabled={currentPageIndex >= pageCount - 1} aria-label="Go to next page" onClick={onGoToNextPage}>Next</button>
      </div>
    </div>
  )
}

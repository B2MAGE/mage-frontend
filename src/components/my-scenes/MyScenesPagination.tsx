import type { RefObject } from 'react'
import { MY_SCENES_ROWS_PER_PAGE_OPTIONS } from '../../lib/myScenes'

type MyScenesPaginationProps = {
  currentPageIndex: number
  isRowsPerPageMenuOpen: boolean
  pageCount: number
  pageEnd: number
  pageStart: number
  rowsPerPage: number
  rowsPerPageMenuRef: RefObject<HTMLDivElement | null>
  totalScenes: number
  onGoToFirstPage: () => void
  onGoToLastPage: () => void
  onGoToNextPage: () => void
  onGoToPreviousPage: () => void
  onSelectRowsPerPage: (value: number) => void
  onToggleRowsPerPageMenu: () => void
}

export function MyScenesPagination({
  currentPageIndex,
  isRowsPerPageMenuOpen,
  pageCount,
  pageEnd,
  pageStart,
  rowsPerPage,
  rowsPerPageMenuRef,
  totalScenes,
  onGoToFirstPage,
  onGoToLastPage,
  onGoToNextPage,
  onGoToPreviousPage,
  onSelectRowsPerPage,
  onToggleRowsPerPageMenu,
}: MyScenesPaginationProps) {
  return (
    <div className="my-scenes-pagination" aria-label="Scene pagination">
      <div className="my-scenes-pagination__rows" ref={rowsPerPageMenuRef}>
        <span>Rows per page:</span>
        <div className="my-scenes-pagination__menu-shell">
          <button
            aria-expanded={isRowsPerPageMenuOpen}
            aria-haspopup="listbox"
            className="my-scenes-pagination__menu-button"
            onClick={onToggleRowsPerPageMenu}
            type="button"
          >
            <span>{rowsPerPage}</span>
            <span className="my-scenes-pagination__menu-caret" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 6.5 8 10.5l4-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>

          {isRowsPerPageMenuOpen ? (
            <div className="my-scenes-pagination__menu" role="listbox" aria-label="Rows per page">
              {MY_SCENES_ROWS_PER_PAGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  aria-selected={rowsPerPage === option}
                  className="my-scenes-pagination__menu-option"
                  data-active={rowsPerPage === option}
                  onClick={() => {
                    onSelectRowsPerPage(option)
                  }}
                  role="option"
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <span className="my-scenes-pagination__range">
        {totalScenes === 0 ? '0-0 of 0' : `${pageStart + 1}-${pageEnd} of ${totalScenes}`}
      </span>

      <div className="my-scenes-pagination__controls">
        <button
          aria-label="Go to first page"
          className="my-scenes-pagination__button"
          disabled={currentPageIndex === 0}
          onClick={onGoToFirstPage}
          type="button"
        >
          {'<<'}
        </button>
        <button
          aria-label="Go to previous page"
          className="my-scenes-pagination__button"
          disabled={currentPageIndex === 0}
          onClick={onGoToPreviousPage}
          type="button"
        >
          {'<'}
        </button>
        <button
          aria-label="Go to next page"
          className="my-scenes-pagination__button"
          disabled={currentPageIndex >= pageCount - 1}
          onClick={onGoToNextPage}
          type="button"
        >
          {'>'}
        </button>
        <button
          aria-label="Go to last page"
          className="my-scenes-pagination__button"
          disabled={currentPageIndex >= pageCount - 1}
          onClick={onGoToLastPage}
          type="button"
        >
          {'>>'}
        </button>
      </div>
    </div>
  )
}

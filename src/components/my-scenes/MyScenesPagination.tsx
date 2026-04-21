import type { RefObject } from 'react'
import { MY_SCENES_ROWS_PER_PAGE_OPTIONS } from '@lib/myScenes'

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

function PaginationChevronIcon({
  direction,
  double = false,
}: {
  direction: 'left' | 'right'
  double?: boolean
}) {
  const isLeft = direction === 'left'

  return (
    <span className="my-scenes-pagination__icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none">
        {double ? (
          <>
            <path
              d={isLeft ? 'M9.5 4.5 6 8l3.5 3.5' : 'M6.5 4.5 10 8l-3.5 3.5'}
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={isLeft ? 'M13 4.5 9.5 8 13 11.5' : 'M3 4.5 6.5 8 3 11.5'}
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : (
          <path
            d={isLeft ? 'M10.5 4.5 7 8l3.5 3.5' : 'M5.5 4.5 9 8l-3.5 3.5'}
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </span>
  )
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
          <PaginationChevronIcon direction="left" double />
        </button>
        <button
          aria-label="Go to previous page"
          className="my-scenes-pagination__button"
          disabled={currentPageIndex === 0}
          onClick={onGoToPreviousPage}
          type="button"
        >
          <PaginationChevronIcon direction="left" />
        </button>
        <button
          aria-label="Go to next page"
          className="my-scenes-pagination__button"
          disabled={currentPageIndex >= pageCount - 1}
          onClick={onGoToNextPage}
          type="button"
        >
          <PaginationChevronIcon direction="right" />
        </button>
        <button
          aria-label="Go to last page"
          className="my-scenes-pagination__button"
          disabled={currentPageIndex >= pageCount - 1}
          onClick={onGoToLastPage}
          type="button"
        >
          <PaginationChevronIcon direction="right" double />
        </button>
      </div>
    </div>
  )
}

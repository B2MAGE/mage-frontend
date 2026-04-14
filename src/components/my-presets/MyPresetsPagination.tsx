import type { RefObject } from 'react'
import { MY_PRESETS_ROWS_PER_PAGE_OPTIONS } from '../../lib/myPresets'

type MyPresetsPaginationProps = {
  currentPageIndex: number
  isRowsPerPageMenuOpen: boolean
  pageCount: number
  pageEnd: number
  pageStart: number
  rowsPerPage: number
  rowsPerPageMenuRef: RefObject<HTMLDivElement | null>
  totalPresets: number
  onGoToFirstPage: () => void
  onGoToLastPage: () => void
  onGoToNextPage: () => void
  onGoToPreviousPage: () => void
  onSelectRowsPerPage: (value: number) => void
  onToggleRowsPerPageMenu: () => void
}

export function MyPresetsPagination({
  currentPageIndex,
  isRowsPerPageMenuOpen,
  pageCount,
  pageEnd,
  pageStart,
  rowsPerPage,
  rowsPerPageMenuRef,
  totalPresets,
  onGoToFirstPage,
  onGoToLastPage,
  onGoToNextPage,
  onGoToPreviousPage,
  onSelectRowsPerPage,
  onToggleRowsPerPageMenu,
}: MyPresetsPaginationProps) {
  return (
    <div className="my-presets-pagination" aria-label="Preset pagination">
      <div className="my-presets-pagination__rows" ref={rowsPerPageMenuRef}>
        <span>Rows per page:</span>
        <div className="my-presets-pagination__menu-shell">
          <button
            aria-expanded={isRowsPerPageMenuOpen}
            aria-haspopup="listbox"
            className="my-presets-pagination__menu-button"
            onClick={onToggleRowsPerPageMenu}
            type="button"
          >
            <span>{rowsPerPage}</span>
            <span className="my-presets-pagination__menu-caret" aria-hidden="true">
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
            <div className="my-presets-pagination__menu" role="listbox" aria-label="Rows per page">
              {MY_PRESETS_ROWS_PER_PAGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  aria-selected={rowsPerPage === option}
                  className="my-presets-pagination__menu-option"
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

      <span className="my-presets-pagination__range">
        {totalPresets === 0 ? '0-0 of 0' : `${pageStart + 1}-${pageEnd} of ${totalPresets}`}
      </span>

      <div className="my-presets-pagination__controls">
        <button
          aria-label="Go to first page"
          className="my-presets-pagination__button"
          disabled={currentPageIndex === 0}
          onClick={onGoToFirstPage}
          type="button"
        >
          {'<<'}
        </button>
        <button
          aria-label="Go to previous page"
          className="my-presets-pagination__button"
          disabled={currentPageIndex === 0}
          onClick={onGoToPreviousPage}
          type="button"
        >
          {'<'}
        </button>
        <button
          aria-label="Go to next page"
          className="my-presets-pagination__button"
          disabled={currentPageIndex >= pageCount - 1}
          onClick={onGoToNextPage}
          type="button"
        >
          {'>'}
        </button>
        <button
          aria-label="Go to last page"
          className="my-presets-pagination__button"
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

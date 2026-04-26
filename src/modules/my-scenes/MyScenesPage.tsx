import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@auth'
import { fetchUserScenes } from './loaders'
import { buildMyScenesBoardModel, pruneSelectedSceneIds } from './selectors'
import type { SortDirection, SortKey, StatusFilter, UserScene } from './types'
import { MyScenesPagination, MyScenesTable, MyScenesToolbar } from './ui'

export function MyScenesPage() {
  const { authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  const [scenes, setScenes] = useState<UserScene[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [selectedSceneIds, setSelectedSceneIds] = useState<number[]>([])
  const [rowsPerPage, setRowsPerPage] = useState(30)
  const [pageIndex, setPageIndex] = useState(0)
  const [isRowsPerPageMenuOpen, setIsRowsPerPageMenuOpen] = useState(false)
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null)
  const rowsPerPageMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (isRestoringSession || !isAuthenticated || typeof user?.userId !== 'number') {
      return
    }

    const userId = user.userId
    let isCurrent = true

    async function loadScenes() {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const nextScenes = await fetchUserScenes(authenticatedFetch, userId)
        if (!isCurrent) {
          return
        }

        setScenes(nextScenes)
      } catch {
        if (!isCurrent) {
          return
        }

        setScenes([])
        setErrorMessage('Unable to load scenes right now. Please try again in a moment.')
      } finally {
        if (isCurrent) {
          setIsLoading(false)
        }
      }
    }

    void loadScenes()

    return () => {
      isCurrent = false
    }
  }, [authenticatedFetch, isAuthenticated, isRestoringSession, user?.userId])

  useEffect(() => {
    setSelectedSceneIds((currentIds) => pruneSelectedSceneIds(currentIds, scenes))
  }, [scenes])

  useEffect(() => {
    if (!isRowsPerPageMenuOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rowsPerPageMenuRef.current?.contains(event.target as Node)) {
        setIsRowsPerPageMenuOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsRowsPerPageMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isRowsPerPageMenuOpen])

  const boardModel = useMemo(
    () =>
      buildMyScenesBoardModel({
        pageIndex,
        rowsPerPage,
        scenes,
        selectedSceneIds,
        sortDirection,
        sortKey,
        statusFilter,
      }),
    [pageIndex, rowsPerPage, scenes, selectedSceneIds, sortDirection, sortKey, statusFilter],
  )

  const {
    allPageScenesSelected,
    availableStatuses,
    currentPageIndex,
    currentPageSceneIds,
    pageCount,
    pageEnd,
    pageStart,
    pagedScenes,
    selectedSceneIdSet,
    somePageScenesSelected,
    sortSummary,
    sortedScenes,
    totalScenes,
  } = boardModel

  useEffect(() => {
    if (!selectAllCheckboxRef.current) {
      return
    }

    selectAllCheckboxRef.current.indeterminate = somePageScenesSelected
  }, [somePageScenesSelected])

  useEffect(() => {
    setPageIndex((currentIndex) => Math.min(currentIndex, pageCount - 1))
  }, [pageCount])

  if (isRestoringSession) {
    return (
      <main className="surface surface--hero">
        <div className="eyebrow">My Scenes</div>
        <h1>Loading scenes...</h1>
        <p className="page-lead">MAGE is restoring your session and loading your saved scenes.</p>
      </main>
    )
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />
  }

  if (typeof user?.userId !== 'number') {
    return (
      <main className="surface surface--hero">
        <div className="eyebrow">My Scenes</div>
        <h1>Unable to load scenes</h1>
        <p className="page-lead">Your session is missing the user information needed to load scenes.</p>
      </main>
    )
  }

  function handleSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((currentDirection) => (currentDirection === 'desc' ? 'asc' : 'desc'))
      setPageIndex(0)
      return
    }

    setSortKey(nextSortKey)
    setSortDirection('desc')
    setPageIndex(0)
  }

  function handleSelectAllVisibleScenes() {
    if (allPageScenesSelected) {
      setSelectedSceneIds((currentIds) =>
        currentIds.filter((sceneId) => !currentPageSceneIds.includes(sceneId)),
      )
      return
    }

    setSelectedSceneIds((currentIds) => {
      const nextIds = new Set(currentIds)
      currentPageSceneIds.forEach((sceneId) => {
        nextIds.add(sceneId)
      })
      return [...nextIds]
    })
  }

  function handleToggleSceneSelection(sceneId: number) {
    setSelectedSceneIds((currentIds) => {
      if (currentIds.includes(sceneId)) {
        return currentIds.filter((currentId) => currentId !== sceneId)
      }

      return [...currentIds, sceneId]
    })
  }

  return (
    <main className="page-stack my-scenes-page">
      <section className="surface surface--page-panel my-scenes-panel" aria-live="polite">
        <header className="my-scenes-panel__header">
          <div className="eyebrow">My Scenes</div>
          <h1 className="my-scenes-panel__title">Scene library</h1>
          <p className="my-scenes-panel__lead">
            Review the scenes created by your account and stage edits, organization, or cleanup from one place.
          </p>
        </header>

        {isLoading ? (
          <p className="scene-status">Loading scenes...</p>
        ) : errorMessage ? (
          <p className="scene-status scene-status-error">{errorMessage}</p>
        ) : scenes.length === 0 ? (
          <div className="scene-empty-state">
            <p className="scene-status">No scenes yet</p>
            <p className="scene-status">
              Create your first scene to start building your library.
            </p>
            <div className="scene-actions">
              <Link
                className="scene-secondary-button scene-editor-nav-button my-scenes-empty-action"
                to="/create-scene"
              >
                Create Scene
              </Link>
            </div>
          </div>
        ) : (
          <div className="my-scenes-board">
            <MyScenesToolbar
              availableStatuses={availableStatuses}
              sortSummary={sortSummary}
              totalScenes={sortedScenes.length}
              statusFilter={statusFilter}
              onSelectStatus={(status) => {
                setStatusFilter(status)
                setPageIndex(0)
              }}
            />

            <MyScenesTable
              allPageScenesSelected={allPageScenesSelected}
              pagedScenes={pagedScenes}
              selectAllCheckboxRef={selectAllCheckboxRef}
              selectedSceneIdSet={selectedSceneIdSet}
              sortDirection={sortDirection}
              sortKey={sortKey}
              onSort={handleSort}
              onToggleSceneSelection={handleToggleSceneSelection}
              onToggleSelectAll={handleSelectAllVisibleScenes}
            />

            <MyScenesPagination
              currentPageIndex={currentPageIndex}
              isRowsPerPageMenuOpen={isRowsPerPageMenuOpen}
              pageCount={pageCount}
              pageEnd={pageEnd}
              pageStart={pageStart}
              rowsPerPage={rowsPerPage}
              rowsPerPageMenuRef={rowsPerPageMenuRef}
              totalScenes={totalScenes}
              onGoToFirstPage={() => {
                setPageIndex(0)
              }}
              onGoToLastPage={() => {
                setPageIndex(pageCount - 1)
              }}
              onGoToNextPage={() => {
                setPageIndex((currentIndex) => Math.min(pageCount - 1, currentIndex + 1))
              }}
              onGoToPreviousPage={() => {
                setPageIndex((currentIndex) => Math.max(0, currentIndex - 1))
              }}
              onSelectRowsPerPage={(option) => {
                setRowsPerPage(option)
                setPageIndex(0)
                setIsRowsPerPageMenuOpen(false)
              }}
              onToggleRowsPerPageMenu={() => {
                setIsRowsPerPageMenuOpen((isOpen) => !isOpen)
              }}
            />
          </div>
        )}
      </section>
    </main>
  )
}

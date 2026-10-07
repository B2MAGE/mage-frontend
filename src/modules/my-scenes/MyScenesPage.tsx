import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@auth'
import { fetchUserScenes } from './loaders'
import { buildMyScenesBoardModel, pruneSelectedSceneIds } from './selectors'
import type { SortDirection, SortKey, StatusFilter, UserScene } from './types'
import { MyScenesLoadingState, MyScenesPagination, MyScenesTable, MyScenesToolbar } from './ui'
import './my-scenes.css'

export function MyScenesPage() {
  const { authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  const [scenes, setScenes] = useState<UserScene[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [selectedSceneIds, setSelectedSceneIds] = useState<number[]>([])
  const [rowsPerPage, setRowsPerPage] = useState(5)
  const [pageIndex, setPageIndex] = useState(0)
  const [reloadVersion, setReloadVersion] = useState(0)
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null)

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
  }, [authenticatedFetch, isAuthenticated, isRestoringSession, user?.userId, reloadVersion])

  useEffect(() => {
    setSelectedSceneIds((currentIds) => pruneSelectedSceneIds(currentIds, scenes))
  }, [scenes])

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

  if (!isRestoringSession && !isAuthenticated) {
    return <Navigate replace to="/login" />
  }

  if (!isRestoringSession && typeof user?.userId !== 'number') {
    return (
      <main className="my-scenes-page"><div className="my-scenes-library-shell"><div className="my-scenes-state"><h1>Unable to load scenes</h1><p>Your session is missing the user information needed to load scenes.</p></div></div></main>
    )
  }

  if (isRestoringSession || isLoading) {
    return <MyScenesLoadingState />
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
      <header className="my-scenes-page__header">
        <div>
          <h1 className="my-scenes-panel__title">My scenes</h1>
          <p className="my-scenes-panel__lead">Manage the scenes you’re building and the work you’ve already published.</p>
        </div>
        <span className="my-scenes-page__summary">
          {errorMessage
            ? 'Scenes unavailable'
            : `${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'}`}
        </span>
      </header>
      <MyScenesToolbar availableStatuses={availableStatuses} selectedSceneCount={selectedSceneIds.length} sortDirection={sortDirection} sortKey={sortKey} sortSummary={sortSummary} totalScenes={sortedScenes.length} statusFilter={statusFilter} onSelectSort={(nextSortKey, nextSortDirection) => { setSortKey(nextSortKey); setSortDirection(nextSortDirection); setPageIndex(0) }} onSelectStatus={(status) => { setStatusFilter(status); setPageIndex(0) }} />
      <section className="my-scenes-library-shell" aria-live="polite">
        {errorMessage ? (
          <div className="my-scenes-state"><h2>Couldn’t load your scenes</h2><p>{errorMessage}</p><button className="my-scenes-state-action" type="button" onClick={() => setReloadVersion((version) => version + 1)}>Retry</button></div>
        ) : scenes.length === 0 ? (
          <div className="my-scenes-state"><h2>No scenes yet</h2><p>Create your first scene to start building your library.</p><Link className="my-scenes-state-action" to="/create-scene">Create scene</Link></div>
        ) : sortedScenes.length === 0 ? (
          <div className="my-scenes-state"><h2>No matching scenes</h2><p>No scenes in your library match this status.</p><button className="my-scenes-state-action" type="button" onClick={() => setStatusFilter('All')}>Show all scenes</button></div>
        ) : (
          <>
            <MyScenesTable allPageScenesSelected={allPageScenesSelected} pagedScenes={pagedScenes} selectAllCheckboxRef={selectAllCheckboxRef} selectedSceneIdSet={selectedSceneIdSet} sortDirection={sortDirection} sortKey={sortKey} onSort={handleSort} onToggleSceneSelection={handleToggleSceneSelection} onToggleSelectAll={handleSelectAllVisibleScenes} />
            <MyScenesPagination currentPageIndex={currentPageIndex} pageCount={pageCount} pageEnd={pageEnd} pageStart={pageStart} rowsPerPage={rowsPerPage} totalScenes={totalScenes} onGoToNextPage={() => setPageIndex((currentIndex) => Math.min(pageCount - 1, currentIndex + 1))} onGoToPreviousPage={() => setPageIndex((currentIndex) => Math.max(0, currentIndex - 1))} onSelectRowsPerPage={(option) => { setRowsPerPage(option); setPageIndex(0) }} />
          </>
        )}
      </section>
    </main>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@auth'
import { ActionButton, PageFrame, PageState } from '@shared/ui'
import { fetchUserScenes } from './loaders'
import { buildMyScenesBoardModel, pruneSelectedSceneIds } from './selectors'
import type { SortDirection, SortKey, StatusFilter, UserScene } from './types'
import { MyScenesLoadingState, MyScenesPagination, MyScenesTable, MyScenesToolbar } from './ui'
import './my-scenes.css'

export function MyScenesPage() {
  const { authenticatedFetch, user: authenticatedUser } = useAuth()
  const user = authenticatedUser!
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
    if (typeof user.userId !== 'number') {
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
  }, [authenticatedFetch, user.userId, reloadVersion])

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

  if (typeof user.userId !== 'number') {
    return (
      <PageFrame className="my-scenes-page"><PageState kind="error" title="Unable to load scenes" description="Your session is missing the user information needed to load scenes." /></PageFrame>
    )
  }

  if (isLoading) {
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
    <PageFrame className="page-stack my-scenes-page">
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
          <PageState kind="error" title="Couldn’t load your scenes" description={errorMessage} actions={<ActionButton tone="primary" onClick={() => setReloadVersion((version) => version + 1)}>Retry</ActionButton>} />
        ) : scenes.length === 0 ? (
          <PageState title="No scenes yet" description="Create your first scene to start building your library." actions={<Link className="ui-button ui-button--primary ui-button--normal" to="/create-scene">Create scene</Link>} />
        ) : sortedScenes.length === 0 ? (
          <PageState title="No matching scenes" description="No scenes in your library match this status." actions={<ActionButton onClick={() => setStatusFilter('All')}>Show all scenes</ActionButton>} />
        ) : (
          <>
            <MyScenesTable allPageScenesSelected={allPageScenesSelected} pagedScenes={pagedScenes} selectAllCheckboxRef={selectAllCheckboxRef} selectedSceneIdSet={selectedSceneIdSet} sortDirection={sortDirection} sortKey={sortKey} onSort={handleSort} onToggleSceneSelection={handleToggleSceneSelection} onToggleSelectAll={handleSelectAllVisibleScenes} />
            <MyScenesPagination currentPageIndex={currentPageIndex} pageCount={pageCount} pageEnd={pageEnd} pageStart={pageStart} rowsPerPage={rowsPerPage} totalScenes={totalScenes} onGoToNextPage={() => setPageIndex((currentIndex) => Math.min(pageCount - 1, currentIndex + 1))} onGoToPreviousPage={() => setPageIndex((currentIndex) => Math.max(0, currentIndex - 1))} onSelectRowsPerPage={(option) => { setRowsPerPage(option); setPageIndex(0) }} />
          </>
        )}
      </section>
    </PageFrame>
  )
}

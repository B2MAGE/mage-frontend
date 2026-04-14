import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { MyPresetsPagination } from '../components/my-presets/MyPresetsPagination'
import { MyPresetsTable } from '../components/my-presets/MyPresetsTable'
import { MyPresetsToolbar } from '../components/my-presets/MyPresetsToolbar'
import {
  buildSortSummary,
  createDemoPresets,
  fetchUserPresets,
  sortPresets,
  type SortDirection,
  type SortKey,
  type StatusFilter,
  type UserPreset,
} from '../lib/myPresets'

export function MyPresetsPage() {
  const { authenticatedFetch, isAuthenticated, isRestoringSession, user } = useAuth()
  const [presets, setPresets] = useState<UserPreset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSeedingPresets, setIsSeedingPresets] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [seedErrorMessage, setSeedErrorMessage] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>('updated')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [selectedPresetIds, setSelectedPresetIds] = useState<number[]>([])
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

    async function loadPresets() {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const nextPresets = await fetchUserPresets(authenticatedFetch, userId)
        if (!isCurrent) {
          return
        }

        setPresets(nextPresets)
      } catch {
        if (!isCurrent) {
          return
        }

        setPresets([])
        setErrorMessage('Unable to load presets right now. Please try again in a moment.')
      } finally {
        if (isCurrent) {
          setIsLoading(false)
        }
      }
    }

    void loadPresets()

    return () => {
      isCurrent = false
    }
  }, [authenticatedFetch, isAuthenticated, isRestoringSession, reloadKey, user?.userId])

  useEffect(() => {
    setSelectedPresetIds((currentIds) =>
      currentIds.filter((presetId) => presets.some((preset) => preset.id === presetId)),
    )
  }, [presets])

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

  const availableStatuses = [...new Set(presets.map((preset) => preset.statusLabel))].sort()
  const visiblePresets =
    statusFilter === 'All'
      ? presets
      : presets.filter((preset) => preset.statusLabel === statusFilter)
  const sortedPresets = sortPresets(visiblePresets, sortKey, sortDirection)
  const sortSummary = buildSortSummary(sortKey, sortDirection)
  const totalPresets = sortedPresets.length
  const pageCount = Math.max(1, Math.ceil(Math.max(totalPresets, 1) / rowsPerPage))
  const currentPageIndex = Math.min(pageIndex, pageCount - 1)
  const pageStart = totalPresets === 0 ? 0 : currentPageIndex * rowsPerPage
  const pageEnd = Math.min(pageStart + rowsPerPage, totalPresets)
  const pagedPresets = sortedPresets.slice(pageStart, pageEnd)
  const selectedPresetIdSet = new Set(selectedPresetIds)
  const currentPagePresetIds = pagedPresets.map((preset) => preset.id)
  const allPagePresetsSelected =
    currentPagePresetIds.length > 0 &&
    currentPagePresetIds.every((presetId) => selectedPresetIdSet.has(presetId))
  const somePagePresetsSelected =
    !allPagePresetsSelected &&
    currentPagePresetIds.some((presetId) => selectedPresetIdSet.has(presetId))

  useEffect(() => {
    if (!selectAllCheckboxRef.current) {
      return
    }

    selectAllCheckboxRef.current.indeterminate = somePagePresetsSelected
  }, [somePagePresetsSelected])

  useEffect(() => {
    setPageIndex((currentIndex) => Math.min(currentIndex, pageCount - 1))
  }, [pageCount])

  if (isRestoringSession) {
    return (
      <main className="surface surface--hero">
        <div className="eyebrow">My Presets</div>
        <h1>Loading presets...</h1>
        <p className="page-lead">MAGE is restoring your session and loading your saved presets.</p>
      </main>
    )
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />
  }

  if (typeof user?.userId !== 'number') {
    return (
      <main className="surface surface--hero">
        <div className="eyebrow">My Presets</div>
        <h1>Unable to load presets</h1>
        <p className="page-lead">Your session is missing the user information needed to load presets.</p>
      </main>
    )
  }

  async function handleSeedPresets() {
    setIsSeedingPresets(true)
    setSeedErrorMessage('')

    try {
      await createDemoPresets(authenticatedFetch)
      setReloadKey((currentKey) => currentKey + 1)
    } catch (error) {
      setSeedErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Unable to add sample presets right now. Please try again in a moment.',
      )
    } finally {
      setIsSeedingPresets(false)
    }
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

  function handleSelectAllVisiblePresets() {
    if (allPagePresetsSelected) {
      setSelectedPresetIds((currentIds) =>
        currentIds.filter((presetId) => !currentPagePresetIds.includes(presetId)),
      )
      return
    }

    setSelectedPresetIds((currentIds) => {
      const nextIds = new Set(currentIds)
      currentPagePresetIds.forEach((presetId) => {
        nextIds.add(presetId)
      })
      return [...nextIds]
    })
  }

  function handleTogglePresetSelection(presetId: number) {
    setSelectedPresetIds((currentIds) => {
      if (currentIds.includes(presetId)) {
        return currentIds.filter((currentId) => currentId !== presetId)
      }

      return [...currentIds, presetId]
    })
  }

  return (
    <main className="page-stack my-presets-page">
      <section className="surface surface--page-panel my-presets-panel" aria-live="polite">
        <header className="my-presets-panel__header">
          <div className="eyebrow">My Presets</div>
          <h1 className="my-presets-panel__title">Preset library</h1>
          <p className="my-presets-panel__lead">
            Review the presets created by your account and stage edits, organization, or cleanup from one place.
          </p>
        </header>

        {isLoading ? (
          <p className="preset-status">Loading presets...</p>
        ) : errorMessage ? (
          <p className="preset-status preset-status-error">{errorMessage}</p>
        ) : presets.length === 0 ? (
          <div className="preset-empty-state">
            <p className="preset-status">No presets yet</p>
            <p className="preset-status">
              Temporary helper: add sample presets to this account so you can preview the list UI.
            </p>
            <div className="preset-actions">
              <button
                type="button"
                className="preset-action"
                onClick={() => {
                  void handleSeedPresets()
                }}
                disabled={isSeedingPresets}
              >
                {isSeedingPresets ? 'Adding sample presets...' : 'Add sample presets'}
              </button>
            </div>
            {seedErrorMessage ? (
              <p className="preset-status preset-status-error">{seedErrorMessage}</p>
            ) : null}
          </div>
        ) : (
          <div className="my-presets-board">
            <MyPresetsToolbar
              availableStatuses={availableStatuses}
              sortSummary={sortSummary}
              totalPresets={sortedPresets.length}
              statusFilter={statusFilter}
              onSelectStatus={(status) => {
                setStatusFilter(status)
                setPageIndex(0)
              }}
            />

            <MyPresetsTable
              allPagePresetsSelected={allPagePresetsSelected}
              pagedPresets={pagedPresets}
              selectAllCheckboxRef={selectAllCheckboxRef}
              selectedPresetIdSet={selectedPresetIdSet}
              sortDirection={sortDirection}
              sortKey={sortKey}
              onSort={handleSort}
              onTogglePresetSelection={handleTogglePresetSelection}
              onToggleSelectAll={handleSelectAllVisiblePresets}
            />

            <MyPresetsPagination
              currentPageIndex={currentPageIndex}
              isRowsPerPageMenuOpen={isRowsPerPageMenuOpen}
              pageCount={pageCount}
              pageEnd={pageEnd}
              pageStart={pageStart}
              rowsPerPage={rowsPerPage}
              rowsPerPageMenuRef={rowsPerPageMenuRef}
              totalPresets={totalPresets}
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

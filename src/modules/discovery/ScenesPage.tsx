import './discovery.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageFrame, PagePanel, ScenePagination } from '@shared/ui'
import { fetchDiscoveryScenes, fetchDiscoveryTags } from './loaders'
import {
  buildAvailableDiscoveryTags,
  DISCOVERY_PAGE_SIZE_OPTIONS,
  normalizeDiscoverySearchParams,
  readDiscoveryQuery,
} from './selectors'
import type { DiscoveryPage, DiscoveryPageState, DiscoverySort, DiscoveryTag } from './types'
import {
  DiscoveryEmptyState,
  DiscoveryErrorState,
  DiscoveryLoadingGrid,
  DiscoverySceneCard,
  DiscoverySortSelect,
  DiscoveryTagFilterBar,
} from './ui'

type PageResult = { key: string; state: DiscoveryPageState; data: DiscoveryPage | null }

export function ScenesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tags, setTags] = useState<DiscoveryTag[]>([])
  const [result, setResult] = useState<PageResult>({ key: '', state: 'loading', data: null })
  const [tagsLoading, setTagsLoading] = useState(true)
  const [reloadVersion, setReloadVersion] = useState(0)
  const correctionTarget = useRef<string | null>(null)
  const focusAfterNavigation = useRef<string | null>(null)
  const resultsRef = useRef<HTMLElement | null>(null)
  const { page, size, sort, tag } = readDiscoveryQuery(searchParams)
  const activeTag = tag ?? null
  const requestKey = JSON.stringify([page, size, sort, activeTag, reloadVersion])
  const rawSearch = searchParams.toString()
  const normalizedSearch = normalizeDiscoverySearchParams(searchParams).toString()
  const needsNormalization = rawSearch !== normalizedSearch
  const pageState = result.key === requestKey ? result.state : 'loading'
  const pageData = pageState === 'ready' ? result.data : null
  const availableTags = useMemo(() => buildAvailableDiscoveryTags(tags, activeTag), [activeTag, tags])

  useEffect(() => {
    if (rawSearch !== normalizedSearch) setSearchParams(normalizedSearch, { replace: true })
  }, [normalizedSearch, rawSearch, setSearchParams])

  useEffect(() => {
    let cancelled = false
    fetchDiscoveryTags({ attachedOnly: true })
      .then((data) => {
        if (!cancelled) {
          setTags(data)
          setTagsLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTags([])
          setTagsLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (needsNormalization) return
    const controller = new AbortController()
    let cancelled = false
    if (correctionTarget.current !== requestKey) correctionTarget.current = null
    if (focusAfterNavigation.current !== requestKey) focusAfterNavigation.current = null

    async function loadScenes() {
      try {
        const data = await fetchDiscoveryScenes({ page, size, sort, tag: activeTag }, controller.signal)
        if (cancelled) return
        const lastPage = Math.max(0, data.totalPages - 1)
        if (page > lastPage) {
          // A deleted last page gets one correction; repeated inconsistent results use Retry.
          if (correctionTarget.current === requestKey) throw new Error('Scene collection changed again')
          correctionTarget.current = JSON.stringify([lastPage, size, sort, activeTag, reloadVersion])
          if (focusAfterNavigation.current === requestKey) focusAfterNavigation.current = correctionTarget.current
          setSearchParams((currentParams) => {
            const nextParams = new URLSearchParams(currentParams)
            nextParams.set('page', String(lastPage + 1))
            return nextParams
          }, { replace: true })
          return
        }
        correctionTarget.current = null
        setResult({ key: requestKey, state: 'ready', data })
      } catch {
        if (!cancelled) setResult({ key: requestKey, state: 'error', data: null })
      }
    }
    void loadScenes()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [activeTag, needsNormalization, page, reloadVersion, requestKey, setSearchParams, size, sort])

  useEffect(() => {
    if (pageState === 'loading' || focusAfterNavigation.current !== requestKey) return
    focusAfterNavigation.current = null
    resultsRef.current?.focus({ preventScroll: true })
    resultsRef.current?.scrollIntoView({ block: 'start' })
  }, [pageState, requestKey])

  function updateFilter(key: 'tag' | 'sort' | 'size', value: string | null) {
    focusAfterNavigation.current = key === 'size' ? JSON.stringify([0, Number(value), sort, activeTag, reloadVersion]) : null
    const nextParams = new URLSearchParams(searchParams)
    if (value) nextParams.set(key, value)
    else nextParams.delete(key)
    nextParams.set('page', '1')
    if (nextParams.toString() === searchParams.toString()) {
      setReloadVersion(version => version + 1)
    } else {
      setSearchParams(nextParams)
    }
  }

  function updateActiveTag(nextTag: string | null) { updateFilter('tag', nextTag?.trim() || null) }
  function updateActiveSort(nextSort: DiscoverySort) { updateFilter('sort', nextSort) }
  function updatePage(pageIndex: number) {
    focusAfterNavigation.current = JSON.stringify([pageIndex, size, sort, activeTag, reloadVersion])
    setSearchParams(currentParams => {
      const nextParams = new URLSearchParams(currentParams)
      nextParams.set('page', String(pageIndex + 1))
      return nextParams
    })
  }
  function handleRetry() {
    correctionTarget.current = null
    setReloadVersion(version => version + 1)
  }

  return (
    <PageFrame className="scenes-page">
      <PagePanel aria-label="Scene filters" as="section" className="scenes-filter-panel" padding="compact" tone="nested">
        <div className="scenes-filter-rail">
          <DiscoveryTagFilterBar tags={availableTags} activeTag={activeTag} onTagSelect={updateActiveTag} isLoading={tagsLoading} />
          <DiscoverySortSelect value={sort} onChange={updateActiveSort} />
        </div>
      </PagePanel>
      <section ref={resultsRef} className="scenes-results" aria-label="Scene results" aria-busy={pageState === 'loading'} tabIndex={-1}>
        {pageState === 'loading' ? <DiscoveryLoadingGrid /> : null}
        {pageData?.items.length === 0 ? <DiscoveryEmptyState activeTag={activeTag} onClearFilter={() => updateActiveTag(null)} /> : null}
        {pageData && pageData.items.length > 0 ? (
          <div className="scene-grid" aria-label="Scene list">
            {pageData.items.map(scene => <DiscoverySceneCard key={scene.sceneId} scene={scene} />)}
          </div>
        ) : null}
        {pageState === 'error' ? <DiscoveryErrorState onRetry={handleRetry} /> : null}
        {pageData ? (
          <ScenePagination label="Explore scene pagination" currentPageIndex={page} pageSize={size}
            pageSizeOptions={DISCOVERY_PAGE_SIZE_OPTIONS} totalScenes={pageData.totalElements} pageCount={pageData.totalPages}
            pageStart={page * size} pageEnd={Math.min(page * size + pageData.items.length, pageData.totalElements)}
            onPageChange={updatePage} onPageSizeChange={nextSize => updateFilter('size', String(nextSize))} />
        ) : null}
      </section>
    </PageFrame>
  )
}

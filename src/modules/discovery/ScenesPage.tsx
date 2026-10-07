import './discovery.css'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageFrame, PagePanel } from '@shared/ui'
import { fetchDiscoveryScenes, fetchDiscoveryTags } from './loaders'
import {
  buildAvailableDiscoveryTags,
  readActiveDiscoverySort,
  readActiveDiscoveryTag,
  sortDiscoveryScenes,
} from './selectors'
import type { DiscoveryPageState, DiscoveryScene, DiscoverySort, DiscoveryTag } from './types'
import {
  DiscoveryEmptyState,
  DiscoveryErrorState,
  DiscoveryLoadingGrid,
  DiscoverySceneCard,
  DiscoverySortSelect,
  DiscoveryTagFilterBar,
} from './ui'

export function ScenesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tags, setTags] = useState<DiscoveryTag[]>([])
  const [scenes, setScenes] = useState<DiscoveryScene[]>([])
  const [pageState, setPageState] = useState<DiscoveryPageState>('loading')
  const [tagsLoading, setTagsLoading] = useState(true)
  const [reloadVersion, setReloadVersion] = useState(0)
  const activeTag = useMemo(() => readActiveDiscoveryTag(searchParams), [searchParams])
  const activeSort = useMemo(() => readActiveDiscoverySort(searchParams), [searchParams])
  const availableTags = useMemo(
    () => buildAvailableDiscoveryTags(tags, activeTag),
    [activeTag, tags],
  )
  const sortedScenes = useMemo(
    () => sortDiscoveryScenes(scenes, activeSort),
    [activeSort, scenes],
  )
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

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadScenes() {
      try {
        const data = await fetchDiscoveryScenes(activeTag)

        if (cancelled) {
          return
        }

        setScenes(data)
        setPageState('ready')
      } catch {
        if (!cancelled) {
          setPageState('error')
        }
      }
    }

    void loadScenes()

    return () => {
      cancelled = true
    }
  }, [activeTag, reloadVersion])

  function updateActiveTag(tag: string | null) {
    const trimmedTag = tag?.trim() ?? ''
    const currentTag = activeTag ?? ''

    setPageState('loading')

    if (!trimmedTag) {
      if (!currentTag) {
        setReloadVersion((currentVersion) => currentVersion + 1)
        return
      }

      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams)
        nextParams.delete('tag')
        return nextParams
      })
      return
    }

    if (trimmedTag === currentTag) {
      setReloadVersion((currentVersion) => currentVersion + 1)
      return
    }

    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams)
      nextParams.set('tag', trimmedTag)
      return nextParams
    })
  }

  function updateActiveSort(sort: DiscoverySort) {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams)
      nextParams.set('sort', sort)
      return nextParams
    })
  }

  function handleRetry() {
    setPageState('loading')
    setReloadVersion((currentVersion) => currentVersion + 1)
  }

  return (
    <PageFrame className="scenes-page">
      <PagePanel
        aria-label="Scene filters"
        as="section"
        className="scenes-filter-panel"
        padding="compact"
        tone="nested"
      >
        <div className="scenes-filter-rail">
          <DiscoveryTagFilterBar
            tags={availableTags}
            activeTag={activeTag}
            onTagSelect={updateActiveTag}
            isLoading={tagsLoading}
          />
          <DiscoverySortSelect value={activeSort} onChange={updateActiveSort} />
        </div>
      </PagePanel>

      <section className="scenes-results" aria-label="Scene results">
        {pageState === 'loading' ? <DiscoveryLoadingGrid /> : null}
        {pageState === 'ready' && sortedScenes.length === 0 ? (
          <DiscoveryEmptyState activeTag={activeTag} onClearFilter={() => updateActiveTag(null)} />
        ) : null}
        {pageState === 'ready' && sortedScenes.length > 0 ? (
          <div className="scene-grid" aria-label="Scene list">
            {sortedScenes.map((scene) => (
              <DiscoverySceneCard key={scene.sceneId} scene={scene} />
            ))}
          </div>
        ) : null}
        {pageState === 'error' ? <DiscoveryErrorState onRetry={handleRetry} /> : null}
      </section>
    </PageFrame>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchDiscoveryScenes, fetchDiscoveryTags } from './loaders'
import { buildAvailableDiscoveryTags, readActiveDiscoveryTag } from './selectors'
import type { DiscoveryPageState, DiscoveryScene, DiscoveryTag } from './types'
import {
  DiscoveryEmptyState,
  DiscoveryErrorState,
  DiscoveryLoadingGrid,
  DiscoverySceneCard,
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
  const availableTags = useMemo(
    () => buildAvailableDiscoveryTags(tags, activeTag),
    [activeTag, tags],
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

      setSearchParams({})
      return
    }

    if (trimmedTag === currentTag) {
      setReloadVersion((currentVersion) => currentVersion + 1)
      return
    }

    setSearchParams({ tag: trimmedTag })
  }

  function handleRetry() {
    setPageState('loading')
    setReloadVersion((currentVersion) => currentVersion + 1)
  }

  return (
    <main className="scenes-page">
      <div className="scenes-filter-rail">
        <DiscoveryTagFilterBar
          tags={availableTags}
          activeTag={activeTag}
          onTagSelect={updateActiveTag}
          isLoading={tagsLoading}
        />
      </div>

      {pageState === 'loading' ? <DiscoveryLoadingGrid /> : null}
      {pageState === 'ready' && scenes.length === 0 ? <DiscoveryEmptyState activeTag={activeTag} /> : null}
      {pageState === 'ready' && scenes.length > 0 ? (
        <div className="scene-grid" aria-label="Scene list">
          {scenes.map((scene) => (
            <DiscoverySceneCard key={scene.sceneId} scene={scene} />
          ))}
        </div>
      ) : null}
      {pageState === 'error' ? <DiscoveryErrorState onRetry={handleRetry} /> : null}
    </main>
  )
}

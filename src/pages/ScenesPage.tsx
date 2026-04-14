import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { SceneListResponse, TagResponse } from '../lib/api'
import { fetchScenes, fetchTags } from '../lib/api'
import { SceneCard } from '../components/SceneCard'
import { TagFilterBar } from '../components/TagFilterBar'

type PageState = 'loading' | 'ready' | 'error'

export function ScenesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tags, setTags] = useState<TagResponse[]>([])
  const [scenes, setScenes] = useState<SceneListResponse[]>([])
  const [pageState, setPageState] = useState<PageState>('loading')
  const [tagsLoading, setTagsLoading] = useState(true)
  const [reloadVersion, setReloadVersion] = useState(0)
  const activeTag = useMemo(() => {
    const currentTag = searchParams.get('tag')?.trim()
    return currentTag ? currentTag : null
  }, [searchParams])

  const availableTags = useMemo(() => {
    if (!activeTag || tags.some((tag) => tag.name === activeTag)) {
      return tags
    }

    return [
      ...tags,
      {
        tagId: -1,
        name: activeTag,
      },
    ]
  }, [activeTag, tags])

  useEffect(() => {
    let cancelled = false

    fetchTags({ attachedOnly: true })
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
        const data = await fetchScenes(activeTag)

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
        <TagFilterBar
          tags={availableTags}
          activeTag={activeTag}
          onTagSelect={updateActiveTag}
          isLoading={tagsLoading}
        />
      </div>

      {pageState === 'loading' && (
        <div className="scene-grid" aria-label="Loading scenes">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="scene-card scene-card--skeleton" aria-hidden="true">
              <div className="scene-card__thumbnail scene-card__thumbnail--skeleton" />
              <div className="scene-card__body">
                <span className="scene-card__avatar scene-card__avatar--skeleton" />
                <div className="scene-card__meta">
                  <span className="skeleton-text skeleton-text--title" />
                  <span className="skeleton-text skeleton-text--sub" />
                  <span className="skeleton-text skeleton-text--meta" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pageState === 'ready' && scenes.length === 0 && (
        <div className="scenes-empty" role="status">
          <p>No scenes found{activeTag ? ` for "${activeTag}"` : ''}.</p>
          <p className="scenes-empty__hint">
            {activeTag
              ? 'Try selecting a different tag or browse all scenes.'
              : 'Scenes will appear here once they are created.'}
          </p>
        </div>
      )}

      {pageState === 'ready' && scenes.length > 0 && (
        <div className="scene-grid" aria-label="Scene list">
          {scenes.map((scene) => (
            <SceneCard key={scene.sceneId} scene={scene} />
          ))}
        </div>
      )}

      {pageState === 'error' && (
        <div className="scenes-error" role="alert">
          <p>Something went wrong loading scenes.</p>
          <button className="demo-link" onClick={handleRetry} type="button">
            Try again
          </button>
        </div>
      )}
    </main>
  )
}

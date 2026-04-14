import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { PresetListResponse, TagResponse } from '../lib/api'
import { fetchPresets, fetchTags } from '../lib/api'
import { PresetCard } from '../components/PresetCard'
import { TagFilterBar } from '../components/TagFilterBar'

type PageState = 'loading' | 'ready' | 'error'

export function PresetsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tags, setTags] = useState<TagResponse[]>([])
  const [presets, setPresets] = useState<PresetListResponse[]>([])
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

    async function loadPresets() {
      try {
        const data = await fetchPresets(activeTag)

        if (cancelled) {
          return
        }

        setPresets(data)
        setPageState('ready')
      } catch {
        if (!cancelled) {
          setPageState('error')
        }
      }
    }

    void loadPresets()

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
    <main className="presets-page">
      <div className="presets-filter-rail">
        <TagFilterBar
          tags={availableTags}
          activeTag={activeTag}
          onTagSelect={updateActiveTag}
          isLoading={tagsLoading}
        />
      </div>

      {pageState === 'loading' && (
        <div className="preset-grid" aria-label="Loading presets">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="preset-card preset-card--skeleton" aria-hidden="true">
              <div className="preset-card__thumbnail preset-card__thumbnail--skeleton" />
              <div className="preset-card__body">
                <span className="preset-card__avatar preset-card__avatar--skeleton" />
                <div className="preset-card__meta">
                  <span className="skeleton-text skeleton-text--title" />
                  <span className="skeleton-text skeleton-text--sub" />
                  <span className="skeleton-text skeleton-text--meta" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {pageState === 'ready' && presets.length === 0 && (
        <div className="presets-empty" role="status">
          <p>No presets found{activeTag ? ` for "${activeTag}"` : ''}.</p>
          <p className="presets-empty__hint">
            {activeTag
              ? 'Try selecting a different tag or browse all presets.'
              : 'Presets will appear here once they are created.'}
          </p>
        </div>
      )}

      {pageState === 'ready' && presets.length > 0 && (
        <div className="preset-grid" aria-label="Preset list">
          {presets.map((preset) => (
            <PresetCard key={preset.presetId} preset={preset} />
          ))}
        </div>
      )}

      {pageState === 'error' && (
        <div className="presets-error" role="alert">
          <p>Something went wrong loading presets.</p>
          <button className="demo-link" onClick={handleRetry} type="button">
            Try again
          </button>
        </div>
      )}
    </main>
  )
}

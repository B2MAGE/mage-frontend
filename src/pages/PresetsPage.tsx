import { useEffect, useState } from 'react'
import type { PresetResponse, TagResponse } from '../api'
import { fetchPresets, fetchTags } from '../api'
import { PresetCard } from '../components/PresetCard'
import { TagFilterBar } from '../components/TagFilterBar'

type PageState = 'loading' | 'ready' | 'error'

export function PresetsPage() {
  const [tags, setTags] = useState<TagResponse[]>([])
  const [presets, setPresets] = useState<PresetResponse[]>([])
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [pageState, setPageState] = useState<PageState>('loading')
  const [tagsLoading, setTagsLoading] = useState(true)

  async function loadPresets(tag: string | null) {
    setPageState('loading')
    try {
      const data = await fetchPresets(tag)
      setPresets(data)
      setPageState('ready')
    } catch {
      setPageState('error')
    }
  }

  useEffect(() => {
    let cancelled = false

    fetchTags().then((data) => {
      if (!cancelled) {
        setTags(data)
        setTagsLoading(false)
      }
    })

    fetchPresets(null)
      .then((data) => {
        if (!cancelled) {
          setPresets(data)
          setPageState('ready')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPageState('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  function handleTagSelect(tag: string | null) {
    setActiveTag(tag)
    loadPresets(tag)
  }

  function handleRetry() {
    loadPresets(activeTag)
  }

  return (
    <main className="presets-page">
      <header className="presets-header">
        <span className="eyebrow">Browse</span>
        <h1>Presets</h1>
        <p className="sub">Explore community presets or filter by tag to find what you need.</p>
      </header>

      <TagFilterBar
        tags={tags}
        activeTag={activeTag}
        onTagSelect={handleTagSelect}
        isLoading={tagsLoading}
      />

      {pageState === 'loading' && (
        <div className="preset-grid" aria-label="Loading presets">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="preset-card preset-card--skeleton" aria-hidden="true">
              <div className="preset-card__thumbnail preset-card__thumbnail--skeleton" />
              <div className="preset-card__body">
                <span className="skeleton-text skeleton-text--title" />
                <span className="skeleton-text skeleton-text--sub" />
              </div>
            </div>
          ))}
        </div>
      )}

      {pageState === 'ready' && presets.length === 0 && (
        <div className="presets-empty" role="status">
          <p>No presets found{activeTag ? ` for "${activeTag}"` : ''}.</p>
          <p className="presets-empty__hint">
            {activeTag ? 'Try selecting a different tag or browse all presets.' : 'Presets will appear here once they are created.'}
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
          <button className="demo-link" onClick={handleRetry}>
            Try again
          </button>
        </div>
      )}
    </main>
  )
}

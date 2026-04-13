import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
  const [tagInput, setTagInput] = useState(searchParams.get('tag') ?? '')
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

    fetchTags()
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

    setTagInput(trimmedTag)
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

  function handleApplyTagFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateActiveTag(tagInput)
  }

  return (
    <main className="presets-page">
      <header className="presets-header">
        <span className="eyebrow">Browse</span>
        <h1>Presets</h1>
        <p className="sub">
          Explore community presets or filter by tag to find what you need.
        </p>
      </header>

      <form className="preset-filter-form" onSubmit={handleApplyTagFilter}>
        <label className="preset-filter-form__label" htmlFor="preset-tag-filter">
          Filter presets by tag
        </label>
        <div className="preset-filter-form__controls">
          <input
            id="preset-tag-filter"
            className="preset-filter-form__input"
            type="text"
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            placeholder="Try ambient, water, neon..."
          />
          <button className="demo-link preset-filter-form__submit" type="submit">
            Apply
          </button>
          {activeTag ? (
            <button
              className="preset-secondary-button preset-filter-form__clear"
              type="button"
              onClick={() => updateActiveTag(null)}
            >
              Clear
            </button>
          ) : null}
        </div>
        <p className="preset-filter-form__hint">
          Backend tag filtering is live. Suggested tags appear below when available.
        </p>
      </form>

      <TagFilterBar
        tags={availableTags}
        activeTag={activeTag}
        onTagSelect={updateActiveTag}
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

import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import {
  buildTagRecommendationFilter,
  readRecommendationFilterTag,
  type RecommendedPresetCard,
  type RecommendationFilter,
} from '../../lib/presetDetail'
import { ScrollableTagBar } from '../ScrollableTagBar'

type PresetRecommendationRailProps = {
  creatorDisplayName: string
  currentPresetTags: string[]
  isLoading: boolean
  recommendedPresets: RecommendedPresetCard[]
  recommendationFilter: RecommendationFilter
  onSelectFilter: (filter: RecommendationFilter) => void
}

export function PresetRecommendationRail({
  creatorDisplayName,
  currentPresetTags,
  isLoading,
  recommendedPresets,
  recommendationFilter,
  onSelectFilter,
}: PresetRecommendationRailProps) {
  const activeRecommendationTag = readRecommendationFilterTag(recommendationFilter)

  const loadingCopy =
    activeRecommendationTag !== null
      ? `Loading presets tagged "${activeRecommendationTag}"...`
      : recommendationFilter === 'creator'
        ? `Loading presets from ${creatorDisplayName}...`
        : 'Loading related presets...'

  const emptyCopy =
    activeRecommendationTag !== null
      ? `No other presets tagged "${activeRecommendationTag}" yet.`
      : recommendationFilter === 'creator'
        ? `No other presets from ${creatorDisplayName} yet.`
        : `No related presets from ${creatorDisplayName} or this preset's tags yet.`

  return (
    <aside className="mage-watch__rail">
      <ScrollableTagBar
        ariaLabel="Filter recommended presets"
        barClassName="preset-detail-recommendation-filters"
        role="toolbar"
      >
        <button
          className={`tag-pill${recommendationFilter === 'all' ? ' tag-pill--active' : ''}`}
          aria-pressed={recommendationFilter === 'all'}
          onClick={() => {
            onSelectFilter('all')
          }}
          type="button"
        >
          All
        </button>
        <button
          className={`tag-pill${recommendationFilter === 'creator' ? ' tag-pill--active' : ''}`}
          aria-pressed={recommendationFilter === 'creator'}
          onClick={() => {
            onSelectFilter('creator')
          }}
          type="button"
        >
          From {creatorDisplayName}
        </button>
        {currentPresetTags.map((tag) => {
          const tagFilter = buildTagRecommendationFilter(tag)

          return (
            <button
              key={tag}
              className={`tag-pill${recommendationFilter === tagFilter ? ' tag-pill--active' : ''}`}
              aria-pressed={recommendationFilter === tagFilter}
              onClick={() => {
                onSelectFilter(tagFilter)
              }}
              type="button"
            >
              {tag}
            </button>
          )
        })}
      </ScrollableTagBar>

      {isLoading ? (
        <p className="mage-watch__rail-empty">{loadingCopy}</p>
      ) : recommendedPresets.length === 0 ? (
        <p className="mage-watch__rail-empty">{emptyCopy}</p>
      ) : (
        <div className="mage-watch__rail-list">
          {recommendedPresets.map((recommendedPreset) => (
            <Link
              key={recommendedPreset.id}
              className="mage-preset-card"
              to={`/presets/${recommendedPreset.id}`}
            >
              {recommendedPreset.thumbnailRef ? (
                <img
                  className="mage-preset-card__thumb mage-preset-card__thumb-image"
                  src={recommendedPreset.thumbnailRef}
                  alt={`${recommendedPreset.title} thumbnail`}
                />
              ) : (
                <div
                  className="mage-preset-card__thumb"
                  style={{ '--preset-accent': recommendedPreset.accent } as CSSProperties}
                  aria-hidden="true"
                />
              )}
              <div className="mage-preset-card__body">
                <strong>{recommendedPreset.title}</strong>
                <span>{recommendedPreset.creator}</span>
                <span>{recommendedPreset.meta}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </aside>
  )
}

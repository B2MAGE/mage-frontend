import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type {
  RecommendedPresetCard,
  RecommendationFilter,
} from '../../lib/presetDetail'

type PresetRecommendationRailProps = {
  creatorDisplayName: string
  isLoading: boolean
  recommendedPresets: RecommendedPresetCard[]
  recommendationFilter: RecommendationFilter
  onSelectFilter: (filter: RecommendationFilter) => void
}

export function PresetRecommendationRail({
  creatorDisplayName,
  isLoading,
  recommendedPresets,
  recommendationFilter,
  onSelectFilter,
}: PresetRecommendationRailProps) {
  return (
    <aside className="mage-watch__rail">
      <div className="tag-filter-bar preset-detail-recommendation-filters" role="toolbar" aria-label="Filter recommended presets">
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
      </div>

      {isLoading ? (
        <p className="mage-watch__rail-empty">Loading presets from {creatorDisplayName}...</p>
      ) : recommendedPresets.length === 0 ? (
        <p className="mage-watch__rail-empty">No other presets from {creatorDisplayName} yet.</p>
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

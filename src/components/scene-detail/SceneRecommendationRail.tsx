import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import {
  buildTagRecommendationFilter,
  readRecommendationFilterTag,
  type RecommendedSceneCard,
  type RecommendationFilter,
} from '../../lib/sceneDetail'
import { ScrollableTagBar } from '../ScrollableTagBar'

type SceneRecommendationRailProps = {
  creatorDisplayName: string
  currentSceneTags: string[]
  isLoading: boolean
  recommendedScenes: RecommendedSceneCard[]
  recommendationFilter: RecommendationFilter
  onSelectFilter: (filter: RecommendationFilter) => void
}

export function SceneRecommendationRail({
  creatorDisplayName,
  currentSceneTags,
  isLoading,
  recommendedScenes,
  recommendationFilter,
  onSelectFilter,
}: SceneRecommendationRailProps) {
  const activeRecommendationTag = readRecommendationFilterTag(recommendationFilter)

  const loadingCopy =
    activeRecommendationTag !== null
      ? `Loading scenes tagged "${activeRecommendationTag}"...`
      : recommendationFilter === 'creator'
        ? `Loading scenes from ${creatorDisplayName}...`
        : 'Loading related scenes...'

  const emptyCopy =
    activeRecommendationTag !== null
      ? `No other scenes tagged "${activeRecommendationTag}" yet.`
      : recommendationFilter === 'creator'
        ? `No other scenes from ${creatorDisplayName} yet.`
        : `No related scenes from ${creatorDisplayName} or this scene's tags yet.`

  return (
    <aside className="mage-watch__rail">
      <ScrollableTagBar
        ariaLabel="Filter recommended scenes"
        barClassName="scene-detail-recommendation-filters"
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
        {currentSceneTags.map((tag) => {
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
      ) : recommendedScenes.length === 0 ? (
        <p className="mage-watch__rail-empty">{emptyCopy}</p>
      ) : (
        <div className="mage-watch__rail-list">
          {recommendedScenes.map((recommendedScene) => (
            <Link
              key={recommendedScene.id}
              className="mage-scene-card"
              to={`/scenes/${recommendedScene.id}`}
            >
              {recommendedScene.thumbnailRef ? (
                <img
                  className="mage-scene-card__thumb mage-scene-card__thumb-image"
                  src={recommendedScene.thumbnailRef}
                  alt={`${recommendedScene.title} thumbnail`}
                />
              ) : (
                <div
                  className="mage-scene-card__thumb"
                  style={{ '--scene-accent': recommendedScene.accent } as CSSProperties}
                  aria-hidden="true"
                />
              )}
              <div className="mage-scene-card__body">
                <strong>{recommendedScene.title}</strong>
                <span>{recommendedScene.creator}</span>
                <span>{recommendedScene.meta}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </aside>
  )
}

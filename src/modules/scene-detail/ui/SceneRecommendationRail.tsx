import { type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { CreatorProfileLink, LoadingRegion, ScrollableTagBar } from '@shared/ui'
import type { MagePlayerPlaylistTrack } from '@modules/player'
import { buildTagRecommendationFilter, readRecommendationFilterTag } from '../recommendations'
import type { RecommendedSceneCard, RecommendationFilter } from '../types'
import { PlaylistPanel } from './PlaylistPanel'
import { SceneRecommendationSkeletonList } from './SceneLoadingSkeletons'

type SceneRecommendationRailProps = {
  creatorDisplayName: string
  currentSceneTags: string[]
  isLoading: boolean
  isPlaylistOpen: boolean
  onClosePlaylist: () => void
  onPlaylistNameChange: (name: string) => void
  onReorderTracks: (tracks: MagePlayerPlaylistTrack[]) => void
  onRemoveTrack: (trackId: string) => void
  onSelectFilter: (filter: RecommendationFilter) => void
  onSelectTrack: (trackId: string | null) => void
  onToggleRepeat: () => void
  onToggleShuffle: () => void
  onUpdateTrack: (
    trackId: string,
    nextDetails: Partial<Pick<MagePlayerPlaylistTrack, 'album' | 'artist' | 'title'>>,
  ) => void
  playlistName: string
  playlistTracks: MagePlayerPlaylistTrack[]
  recommendedScenes: RecommendedSceneCard[]
  recommendationFilter: RecommendationFilter
  repeatEnabled: boolean
  selectedTrackId: string | null
  shuffleEnabled: boolean
}

function buildLoadingCopy(
  activeRecommendationTag: string | null,
  creatorDisplayName: string,
  recommendationFilter: RecommendationFilter,
) {
  if (activeRecommendationTag !== null) {
    return `Loading scenes tagged "${activeRecommendationTag}"...`
  }

  if (recommendationFilter === 'creator') {
    return `Loading scenes from ${creatorDisplayName}...`
  }

  return 'Loading related scenes...'
}

function buildEmptyCopy(
  activeRecommendationTag: string | null,
  creatorDisplayName: string,
  recommendationFilter: RecommendationFilter,
) {
  if (activeRecommendationTag !== null) {
    return `No other scenes tagged "${activeRecommendationTag}" yet.`
  }

  if (recommendationFilter === 'creator') {
    return `No other scenes from ${creatorDisplayName} yet.`
  }

  return `No related scenes from ${creatorDisplayName} or this scene's tags yet.`
}

export function SceneRecommendationRail({
  creatorDisplayName,
  currentSceneTags,
  isLoading,
  isPlaylistOpen,
  onClosePlaylist,
  onPlaylistNameChange,
  onReorderTracks,
  onRemoveTrack,
  onSelectFilter,
  onSelectTrack,
  onToggleRepeat,
  onToggleShuffle,
  onUpdateTrack,
  playlistName,
  playlistTracks,
  recommendedScenes,
  recommendationFilter,
  repeatEnabled,
  selectedTrackId,
  shuffleEnabled,
}: SceneRecommendationRailProps) {
  const activeRecommendationTag = readRecommendationFilterTag(recommendationFilter)
  const loadingCopy = buildLoadingCopy(
    activeRecommendationTag,
    creatorDisplayName,
    recommendationFilter,
  )
  const emptyCopy = buildEmptyCopy(activeRecommendationTag, creatorDisplayName, recommendationFilter)

  return (
    <aside className="mage-watch__rail">
      <PlaylistPanel
        isOpen={isPlaylistOpen}
        onClose={onClosePlaylist}
        onPlaylistNameChange={onPlaylistNameChange}
        onRemoveTrack={onRemoveTrack}
        onReorderTracks={onReorderTracks}
        onSelectTrack={onSelectTrack}
        onToggleRepeat={onToggleRepeat}
        onToggleShuffle={onToggleShuffle}
        onUpdateTrack={onUpdateTrack}
        playlistName={playlistName}
        playlistTracks={playlistTracks}
        repeatEnabled={repeatEnabled}
        selectedTrackId={selectedTrackId}
        shuffleEnabled={shuffleEnabled}
      />
      <section className="scene-detail-recommendations" aria-label="Recommended scenes">
      <ScrollableTagBar
        ariaLabel="Filter recommended scenes"
        barClassName="scene-detail-recommendation-filters"
        role="toolbar"
      >
        <button
          aria-pressed={recommendationFilter === 'all'}
          className={`tag-pill${recommendationFilter === 'all' ? ' tag-pill--active' : ''}`}
          onClick={() => {
            onSelectFilter('all')
          }}
          type="button"
        >
          All
        </button>
        <button
          aria-label={`From ${creatorDisplayName}`}
          aria-pressed={recommendationFilter === 'creator'}
          className={`tag-pill${recommendationFilter === 'creator' ? ' tag-pill--active' : ''}`}
          onClick={() => {
            onSelectFilter('creator')
          }}
          type="button"
        >
          From {creatorDisplayName.split(' ')[0]}
        </button>
        {currentSceneTags.map((tag) => {
          const tagFilter = buildTagRecommendationFilter(tag)

          return (
            <button
              key={tag}
              aria-pressed={recommendationFilter === tagFilter}
              className={`tag-pill${recommendationFilter === tagFilter ? ' tag-pill--active' : ''}`}
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
        <LoadingRegion className="scene-detail-recommendations-loading" label={loadingCopy}>
          <SceneRecommendationSkeletonList />
        </LoadingRegion>
      ) : recommendedScenes.length === 0 ? (
        <p className="mage-watch__rail-empty">{emptyCopy}</p>
      ) : (
        <div className="mage-watch__rail-list">
          {recommendedScenes.slice(0, 4).map((recommendedScene) => (
            <article className="mage-scene-card" key={recommendedScene.id}>
              {recommendedScene.thumbnailRef ? (
                <img
                  alt={`${recommendedScene.title} thumbnail`}
                  className="mage-scene-card__thumb mage-scene-card__thumb-image"
                  src={recommendedScene.thumbnailRef}
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="mage-scene-card__thumb mage-scene-card__thumb--fallback"
                  style={{ '--scene-accent': recommendedScene.accent } as CSSProperties}
                />
              )}
              <div className="mage-scene-card__body">
                <Link className="mage-scene-card__open-link" to={`/scenes/${recommendedScene.id}`}>
                  <strong>{recommendedScene.title}</strong>
                </Link>
                <span>
                  <CreatorProfileLink handle={recommendedScene.creatorHandle}>
                    {recommendedScene.creator}
                  </CreatorProfileLink>
                </span>
                <span>{recommendedScene.meta}</span>
              </div>
            </article>
          ))}
        </div>
      )}
      </section>
    </aside>
  )
}

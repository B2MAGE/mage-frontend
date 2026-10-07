import { LoadingRegion, Skeleton } from '@shared/ui'
import { SceneCommentSkeletonList, SceneRecommendationSkeletonList } from './SceneLoadingSkeletons'

export function SceneDetailLoadingState() {
  return (
    <LoadingRegion
      as="main"
      className="ui-page-frame ui-page-frame--wide scene-detail-page scene-detail-page--loading"
      label="Loading scene"
    >
      <section className="mage-watch scene-detail-watch" aria-hidden="true">
        <div className="mage-watch__main">
          <div className="mage-player-shell scene-detail-skeleton__player-shell">
            <Skeleton className="scene-detail-skeleton__player" shape="block" />
            <div className="scene-detail-skeleton__player-controls">
              <Skeleton className="scene-detail-skeleton__control scene-detail-skeleton__control--play" shape="circle" />
              <Skeleton className="scene-detail-skeleton__timeline" shape="line" />
              <Skeleton className="scene-detail-skeleton__control" shape="block" />
            </div>
          </div>

          <div className="scene-detail-header scene-detail-skeleton__header">
            <Skeleton className="scene-detail-skeleton__title" shape="line" />
          </div>

          <section className="scene-detail-social-row scene-detail-skeleton__social-row">
            <div className="scene-detail-social-row__creator scene-detail-skeleton__creator">
              <Skeleton className="scene-detail-skeleton__avatar" shape="circle" />
              <div className="scene-detail-skeleton__creator-copy">
                <Skeleton className="scene-detail-skeleton__creator-name" shape="line" />
                <Skeleton className="scene-detail-skeleton__creator-handle" shape="line" />
              </div>
              <Skeleton className="scene-detail-skeleton__follow" shape="block" />
            </div>

            <div className="scene-detail-action-row scene-detail-skeleton__actions">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton className="scene-detail-skeleton__action" key={index} shape="block" />
              ))}
            </div>
          </section>

          <section className="scene-detail-description-card scene-detail-skeleton__description">
            <div className="scene-detail-skeleton__description-meta">
              <Skeleton shape="line" />
              <Skeleton shape="line" />
            </div>
            <Skeleton className="scene-detail-skeleton__description-copy" shape="line" />
            <Skeleton className="scene-detail-skeleton__description-copy scene-detail-skeleton__description-copy--short" shape="line" />
          </section>

          <section className="scene-detail-comments-panel scene-detail-skeleton__comments">
            <div className="scene-detail-comments-toolbar">
              <Skeleton className="scene-detail-skeleton__comments-heading" shape="line" />
              <Skeleton className="scene-detail-skeleton__comments-sort" shape="block" />
            </div>
            <div className="scene-detail-comment-composer scene-detail-skeleton__composer">
              <Skeleton className="scene-detail-skeleton__composer-avatar" shape="circle" />
              <Skeleton className="scene-detail-skeleton__composer-field" shape="block" />
            </div>
            <SceneCommentSkeletonList />
          </section>
        </div>

        <aside className="mage-watch__rail scene-detail-skeleton__rail">
          <section className="scene-detail-recommendations">
            <div className="scene-detail-recommendation-filters scene-detail-skeleton__filter-slot">
              <Skeleton className="scene-detail-skeleton__filter" shape="block" />
            </div>
            <SceneRecommendationSkeletonList />
          </section>
        </aside>
      </section>
    </LoadingRegion>
  )
}

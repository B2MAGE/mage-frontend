import { Skeleton } from '@shared/ui'

export function SceneCommentSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      className="mage-comments__list scene-detail-comment-skeleton-list"
      data-testid="scene-comment-skeleton-list"
    >
      {Array.from({ length: count }, (_, index) => (
        <article className="mage-comment scene-detail-comment-skeleton" key={index}>
          <Skeleton className="scene-detail-comment-skeleton__avatar" shape="circle" />
          <div className="mage-comment__body scene-detail-comment-skeleton__body">
            <div className="scene-detail-comment-skeleton__meta">
              <Skeleton className="scene-detail-comment-skeleton__author" shape="line" />
              <Skeleton className="scene-detail-comment-skeleton__timestamp" shape="line" />
            </div>
            <Skeleton className="scene-detail-comment-skeleton__copy" shape="line" />
            <Skeleton className="scene-detail-comment-skeleton__copy scene-detail-comment-skeleton__copy--short" shape="line" />
            <Skeleton className="scene-detail-comment-skeleton__actions" shape="line" />
          </div>
        </article>
      ))}
    </div>
  )
}

export function SceneRecommendationSkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      className="mage-watch__rail-list scene-detail-recommendation-skeleton-list"
      data-testid="scene-recommendation-skeleton-list"
    >
      {Array.from({ length: count }, (_, index) => (
        <div className="mage-scene-card scene-detail-recommendation-skeleton" key={index}>
          <Skeleton className="mage-scene-card__thumb scene-detail-recommendation-skeleton__thumb" shape="block" />
          <div className="mage-scene-card__body scene-detail-recommendation-skeleton__body">
            <Skeleton className="scene-detail-recommendation-skeleton__title" shape="line" />
            <Skeleton className="scene-detail-recommendation-skeleton__creator" shape="line" />
            <Skeleton className="scene-detail-recommendation-skeleton__meta" shape="line" />
          </div>
        </div>
      ))}
    </div>
  )
}

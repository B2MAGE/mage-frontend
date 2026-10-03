import { Link } from 'react-router-dom'
import { formatMetricLabel, formatRelativeTime } from '@shared/lib'
import { AppIcon, CreatorProfileLink, UserAvatar } from '@shared/ui'
import type { DiscoveryScene } from '../types'
import { useSceneHoverPreview } from './useSceneHoverPreview'

type DiscoverySceneCardProps = {
  scene: DiscoveryScene
}

function buildCreatorInitials(name: string) {
  const words = name.split(/\s+/).filter(Boolean)
  const initials = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')

  return initials || 'MG'
}

export function DiscoverySceneCard({ scene }: DiscoverySceneCardProps) {
  const creatorName = scene.creatorDisplayName
  const creatorInitials = buildCreatorInitials(creatorName)
  const relativeTime = formatRelativeTime(scene.createdAt)
  const viewLabel = formatMetricLabel(scene.engagement.views, 'view')
  const {
    onBlur,
    onFocus,
    onPointerEnter,
    onPointerLeave,
    recoveryPaused,
    thumbnailRef,
  } = useSceneHoverPreview({ sceneBlob: scene.sceneData, sceneId: scene.sceneId, seed: scene.sceneId })

  return (
    <div
      className="scene-card-link"
      onBlur={onBlur}
      onFocus={onFocus}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <article className="scene-card" id={`scene-${scene.sceneId}`}>
        <div className="scene-card__thumbnail" ref={thumbnailRef}>
          {scene.thumbnailRef ? (
            <img
              src={scene.thumbnailRef}
              alt={`Thumbnail for ${scene.name}`}
              className="scene-card__thumbnail-img"
            />
          ) : (
            <div className="scene-card__thumbnail-placeholder" aria-hidden="true" />
          )}
          {recoveryPaused ? (
            <span className="scene-card__preview-paused">Preview paused. Open scene to retry.</span>
          ) : <span className="scene-card__play" aria-hidden="true"><AppIcon name="play" size={16} /></span>}
        </div>
        <div className="scene-card__body">
          <UserAvatar className="scene-card__avatar" initials={creatorInitials} gradientStart={scene.creatorAvatarGradientStart} gradientEnd={scene.creatorAvatarGradientEnd} />
          <div className="scene-card__meta">
            <h3 className="scene-card__name">
              <Link className="scene-card__open-link" to={`/scenes/${scene.sceneId}`}>{scene.name}</Link>
            </h3>
            <p className="scene-card__creator">
              <CreatorProfileLink handle={scene.creatorHandle}>{creatorName}</CreatorProfileLink>
            </p>
            <div className="scene-card__stats">
              <span>{viewLabel}</span>
              <span className="scene-card__stats-separator" aria-hidden="true">
                &bull;
              </span>
              <time className="scene-card__time" dateTime={scene.createdAt}>
                {relativeTime}
              </time>
            </div>
          </div>
        </div>
      </article>
    </div>
  )
}

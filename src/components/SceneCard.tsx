import { Link } from 'react-router-dom'
import type { SceneListResponse } from '@lib/api'

type SceneCardProps = {
  scene: SceneListResponse
}

function formatRelativeTime(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const diffMs = now - then

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)

  if (months > 0) return `${months} month${months === 1 ? '' : 's'} ago`
  if (weeks > 0) return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  if (seconds > 20) return `${seconds} seconds ago`
  return 'Just now'
}

function formatViewLabel(sceneId: number) {
  const syntheticViews = 1200 + sceneId * 183

  if (syntheticViews >= 1000000) {
    return `${(syntheticViews / 1000000).toFixed(1)}M views`
  }

  if (syntheticViews >= 1000) {
    return `${(syntheticViews / 1000).toFixed(1)}K views`
  }

  return `${syntheticViews} views`
}

function buildCreatorInitials(name: string) {
  const words = name.split(/\s+/).filter(Boolean)
  const initials = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')

  return initials || 'MG'
}

export function SceneCard({ scene }: SceneCardProps) {
  const creatorName = scene.creatorDisplayName
  const creatorInitials = buildCreatorInitials(creatorName)
  const relativeTime = formatRelativeTime(scene.createdAt)
  const viewLabel = formatViewLabel(scene.sceneId)

  return (
    <Link className="scene-card-link" to={`/scenes/${scene.sceneId}`}>
      <article className="scene-card" id={`scene-${scene.sceneId}`}>
        <div className="scene-card__thumbnail">
          {scene.thumbnailRef ? (
            <img
              src={scene.thumbnailRef}
              alt={`Thumbnail for ${scene.name}`}
              className="scene-card__thumbnail-img"
            />
          ) : (
            <div className="scene-card__thumbnail-placeholder" aria-hidden="true" />
          )}
        </div>
        <div className="scene-card__body">
          <div className="scene-card__avatar" aria-hidden="true">
            {creatorInitials}
          </div>
          <div className="scene-card__meta">
            <h3 className="scene-card__name">{scene.name}</h3>
            <p className="scene-card__creator">{creatorName}</p>
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
    </Link>
  )
}

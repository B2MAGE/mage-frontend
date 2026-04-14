import { Link } from 'react-router-dom'
import type { PresetListResponse } from '../lib/api'

type PresetCardProps = {
  preset: PresetListResponse
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

function formatViewLabel(presetId: number) {
  const syntheticViews = 1200 + presetId * 183

  if (syntheticViews >= 1000000) {
    return `${(syntheticViews / 1000000).toFixed(1)}M renders`
  }

  if (syntheticViews >= 1000) {
    return `${(syntheticViews / 1000).toFixed(1)}K renders`
  }

  return `${syntheticViews} renders`
}

function buildCreatorInitials(name: string) {
  const words = name.split(/\s+/).filter(Boolean)
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('')
  return initials || 'MG'
}

export function PresetCard({ preset }: PresetCardProps) {
  const creatorName = preset.creatorDisplayName
  const creatorInitials = buildCreatorInitials(creatorName)
  const relativeTime = formatRelativeTime(preset.createdAt)
  const viewLabel = formatViewLabel(preset.presetId)

  return (
    <Link className="preset-card-link" to={`/presets/${preset.presetId}`}>
      <article className="preset-card" id={`preset-${preset.presetId}`}>
        <div className="preset-card__thumbnail">
          {preset.thumbnailRef ? (
            <img
              src={preset.thumbnailRef}
              alt={`Thumbnail for ${preset.name}`}
              className="preset-card__thumbnail-img"
            />
          ) : (
            <div className="preset-card__thumbnail-placeholder" aria-hidden="true" />
          )}
        </div>
        <div className="preset-card__body">
          <div className="preset-card__avatar" aria-hidden="true">
            {creatorInitials}
          </div>
          <div className="preset-card__meta">
            <h3 className="preset-card__name">{preset.name}</h3>
            <p className="preset-card__creator">{creatorName}</p>
            <div className="preset-card__stats">
              <span>{viewLabel}</span>
              <span className="preset-card__stats-separator" aria-hidden="true">
                •
              </span>
              <time className="preset-card__time" dateTime={preset.createdAt}>
                {relativeTime}
              </time>
            </div>
          </div>
        </div>
      </article>
    </Link>
  )
}

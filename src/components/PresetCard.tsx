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

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}

export function PresetCard({ preset }: PresetCardProps) {
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
          <h3 className="preset-card__name">{preset.name}</h3>
          <time className="preset-card__time" dateTime={preset.createdAt}>
            {formatRelativeTime(preset.createdAt)}
          </time>
        </div>
      </article>
    </Link>
  )
}

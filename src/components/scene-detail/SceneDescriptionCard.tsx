import { Link } from 'react-router-dom'
import type { CreatorProfile, SceneDescription, SceneEngagement } from '../../lib/sceneDetail'

type SceneDescriptionCardProps = {
  creatorProfile: CreatorProfile
  engagement: SceneEngagement
  isDescriptionExpanded: boolean
  sceneDescription: SceneDescription
  onToggleDescription: () => void
}

export function SceneDescriptionCard({
  creatorProfile,
  engagement,
  isDescriptionExpanded,
  sceneDescription,
  onToggleDescription,
}: SceneDescriptionCardProps) {
  const descriptionToggle = (
    <button
      className="scene-detail-description-toggle"
      type="button"
      aria-expanded={isDescriptionExpanded}
      onClick={onToggleDescription}
    >
      <span>{isDescriptionExpanded ? 'Hide' : 'Show'}</span>
      <span
        className={`scene-detail-description-toggle__chevron${
          isDescriptionExpanded ? ' is-expanded' : ''
        }`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 16 16" fill="none">
          <path
            d="M3.5 6 8 10.5 12.5 6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  )

  return (
    <section className="scene-detail-description-card">
      <div className="scene-detail-description-card__meta">
        <strong>{engagement.viewsLabel}</strong>
        <span>{engagement.publishedLabel}</span>
      </div>
      <div className="scene-detail-description-copy" data-expanded={isDescriptionExpanded}>
        <p>{sceneDescription.opening}</p>
        <p>{sceneDescription.middle}</p>
        <p>{sceneDescription.closing}</p>
      </div>

      {isDescriptionExpanded ? (
        <>
          <div className="scene-detail-note-grid">
            <div className="scene-detail-note-grid__item">
              <span>Studio note</span>
              <strong>{creatorProfile.studioNote}</strong>
            </div>
            <div className="scene-detail-note-grid__item">
              <span>Best for</span>
              <strong>{sceneDescription.bestFor}</strong>
            </div>
            <div className="scene-detail-note-grid__item">
              <span>Built with</span>
              <strong>{sceneDescription.builtWith}</strong>
            </div>
            <div className="scene-detail-note-grid__item">
              <span>Saves</span>
              <strong>{engagement.savesLabel}</strong>
            </div>
          </div>

          {sceneDescription.tags.length > 0 ? (
            <div className="tag-filter-bar scene-detail-description-tags" role="toolbar" aria-label="Scene tags">
              {sceneDescription.tags.map((tag) => (
                <Link key={tag} className="tag-pill" to={`/scenes?tag=${encodeURIComponent(tag)}`}>
                  {tag}
                </Link>
              ))}
            </div>
          ) : null}

          {descriptionToggle}
        </>
      ) : (
        descriptionToggle
      )}
    </section>
  )
}

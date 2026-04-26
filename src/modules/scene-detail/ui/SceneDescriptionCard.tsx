import { Link } from 'react-router-dom'
import type { SceneDescription, SceneEngagement } from '../types'

type SceneDescriptionCardProps = {
  engagement: SceneEngagement
  isDescriptionExpanded: boolean
  sceneDescription: SceneDescription
  onToggleDescription: () => void
}

export function SceneDescriptionCard({
  engagement,
  isDescriptionExpanded,
  sceneDescription,
  onToggleDescription,
}: SceneDescriptionCardProps) {
  const hasDescription = sceneDescription.paragraphs.length > 0
  const hasTags = sceneDescription.tags.length > 0
  const shouldShowToggle = hasDescription || hasTags
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
        {hasDescription ? (
          sceneDescription.paragraphs.map((paragraph, index) => (
            <p key={`${index}-${paragraph}`}>{paragraph}</p>
          ))
        ) : (
          <p>No description provided.</p>
        )}
      </div>

      {isDescriptionExpanded ? (
        <>
          {hasTags ? (
            <div className="tag-filter-bar scene-detail-description-tags" role="toolbar" aria-label="Scene tags">
              {sceneDescription.tags.map((tag) => (
                <Link key={tag} className="tag-pill" to={`/scenes?tag=${encodeURIComponent(tag)}`}>
                  {tag}
                </Link>
              ))}
            </div>
          ) : null}

          {shouldShowToggle ? descriptionToggle : null}
        </>
      ) : (
        shouldShowToggle ? descriptionToggle : null
      )}
    </section>
  )
}

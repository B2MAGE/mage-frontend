import type { CreatorProfile, PresetDescription, PresetEngagement } from '../../lib/presetDetail'

type PresetDescriptionCardProps = {
  creatorProfile: CreatorProfile
  engagement: PresetEngagement
  isDescriptionExpanded: boolean
  presetDescription: PresetDescription
  onToggleDescription: () => void
}

export function PresetDescriptionCard({
  creatorProfile,
  engagement,
  isDescriptionExpanded,
  presetDescription,
  onToggleDescription,
}: PresetDescriptionCardProps) {
  const descriptionToggle = (
    <button
      className="preset-detail-description-toggle"
      type="button"
      aria-expanded={isDescriptionExpanded}
      onClick={onToggleDescription}
    >
      <span>{isDescriptionExpanded ? 'Hide' : 'Show'}</span>
      <span
        className={`preset-detail-description-toggle__chevron${
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
    <section className="preset-detail-description-card">
      <div className="preset-detail-description-card__meta">
        <strong>{engagement.playsLabel}</strong>
        <span>{engagement.publishedLabel}</span>
      </div>
      <div className="preset-detail-description-copy" data-expanded={isDescriptionExpanded}>
        <p>{presetDescription.opening}</p>
        <p>{presetDescription.middle}</p>
        <p>{presetDescription.closing}</p>
      </div>

      {isDescriptionExpanded ? (
        <>
          <div className="preset-detail-note-grid">
            <div className="preset-detail-note-grid__item">
              <span>Studio note</span>
              <strong>{creatorProfile.studioNote}</strong>
            </div>
            <div className="preset-detail-note-grid__item">
              <span>Best for</span>
              <strong>{presetDescription.bestFor}</strong>
            </div>
            <div className="preset-detail-note-grid__item">
              <span>Built with</span>
              <strong>{presetDescription.builtWith}</strong>
            </div>
            <div className="preset-detail-note-grid__item">
              <span>Saves</span>
              <strong>{engagement.savesLabel}</strong>
            </div>
          </div>

          <div className="tag-filter-bar preset-detail-description-tags" role="toolbar" aria-label="Preset tags">
            {presetDescription.tags.map((tag) => (
              <button key={tag} className="tag-pill" type="button">
                {tag}
              </button>
            ))}
          </div>

          {descriptionToggle}
        </>
      ) : (
        descriptionToggle
      )}
    </section>
  )
}

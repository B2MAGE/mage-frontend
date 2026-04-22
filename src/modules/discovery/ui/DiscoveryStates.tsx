type DiscoveryEmptyStateProps = {
  activeTag: string | null
}

type DiscoveryErrorStateProps = {
  onRetry: () => void
}

export function DiscoveryLoadingGrid() {
  return (
    <div className="scene-grid" aria-label="Loading scenes">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="scene-card scene-card--skeleton" aria-hidden="true">
          <div className="scene-card__thumbnail scene-card__thumbnail--skeleton" />
          <div className="scene-card__body">
            <span className="scene-card__avatar scene-card__avatar--skeleton" />
            <div className="scene-card__meta">
              <span className="skeleton-text skeleton-text--title" />
              <span className="skeleton-text skeleton-text--sub" />
              <span className="skeleton-text skeleton-text--meta" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function DiscoveryEmptyState({ activeTag }: DiscoveryEmptyStateProps) {
  return (
    <div className="scenes-empty" role="status">
      <p>No scenes found{activeTag ? ` for "${activeTag}"` : ''}.</p>
      <p className="scenes-empty__hint">
        {activeTag
          ? 'Try selecting a different tag or browse all scenes.'
          : 'Scenes will appear here once they are created.'}
      </p>
    </div>
  )
}

export function DiscoveryErrorState({ onRetry }: DiscoveryErrorStateProps) {
  return (
    <div className="scenes-error" role="alert">
      <p>Something went wrong loading scenes.</p>
      <button className="demo-link" onClick={onRetry} type="button">
        Try again
      </button>
    </div>
  )
}

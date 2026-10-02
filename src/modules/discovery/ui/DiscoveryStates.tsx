import { Link } from 'react-router-dom'
import { LoadingRegion, Skeleton } from '@shared/ui'
import { useTheme } from '@theme'
import { SceneCollectionState } from './SceneCollectionState'

type DiscoveryEmptyStateProps = {
  activeTag: string | null
  onClearFilter: () => void
  headingLevel?: 2 | 3
}

type DiscoveryErrorStateProps = {
  onRetry: () => void
  headingLevel?: 2 | 3
}

type SceneGridSkeletonProps = {
  count?: number
  label?: string
}

export function SceneGridSkeleton({ count = 6, label = 'Loading scenes' }: SceneGridSkeletonProps) {
  return (
    <LoadingRegion
      className="scene-grid-loading-region"
      label={label}
      visualClassName="scene-grid scene-grid--loading"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="scene-card scene-card--loading" aria-hidden="true">
          <Skeleton shape="block" className="scene-card__thumbnail scene-card__thumbnail--loading" />
          <div className="scene-card__body">
            <Skeleton shape="circle" className="scene-card__avatar scene-card__avatar--loading" />
            <div className="scene-card__meta">
              <Skeleton shape="line" className="scene-card-loading__line scene-card-loading__line--title" />
              <Skeleton shape="line" className="scene-card-loading__line scene-card-loading__line--creator" />
              <Skeleton shape="line" className="scene-card-loading__line scene-card-loading__line--stats" />
            </div>
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}

export function DiscoveryLoadingGrid() {
  return <SceneGridSkeleton />
}

export function DiscoveryEmptyState({ activeTag, onClearFilter, headingLevel = 2 }: DiscoveryEmptyStateProps) {
  const { themeId } = useTheme()
  if (themeId === 'mage-pulse') {
    return (
      <SceneCollectionState
        headingLevel={headingLevel}
        title={activeTag ? 'No scenes match this tag' : 'No scenes here yet'}
        description={activeTag
          ? `Nothing has been published with “${activeTag}” yet. Try another tag or explore the full collection.`
          : 'Every scene starts with an idea. Create the first one and give it a little motion.'}
        action={activeTag
          ? <button className="scene-collection-state__button" type="button" onClick={onClearFilter}>Show all scenes</button>
          : <Link className="scene-collection-state__button" to="/create-scene">Create a scene</Link>}
      />
    )
  }
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

export function DiscoveryErrorState({ onRetry, headingLevel = 2 }: DiscoveryErrorStateProps) {
  const { themeId } = useTheme()
  if (themeId === 'mage-pulse') {
    return (
      <SceneCollectionState
        kind="error"
        headingLevel={headingLevel}
        title="Scenes couldn’t be loaded"
        description="Please try again in a moment."
        action={<button className="scene-collection-state__button" onClick={onRetry} type="button">Try again</button>}
      />
    )
  }
  return (
    <div className="scenes-error" role="alert">
      <p>Something went wrong loading scenes.</p>
      <button className="demo-link" onClick={onRetry} type="button">
        Try again
      </button>
    </div>
  )
}

import { useId, type ReactNode } from 'react'
import { AppIcon } from '@shared/ui'
import './scene-collection-state.css'

type SceneCollectionStateProps = {
  title: string
  description: string
  action: ReactNode
  kind?: 'empty' | 'error'
  headingLevel?: 2 | 3
}

/** A collection-level message; the owning page supplies its meaning and actions. */
export function SceneCollectionState({
  title,
  description,
  action,
  kind = 'empty',
  headingLevel = 2,
}: SceneCollectionStateProps) {
  const titleId = useId()
  const Heading = headingLevel === 2 ? 'h2' : 'h3'

  return (
    <div
      className={`scene-collection-state scene-collection-state--${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-labelledby={titleId}
    >
      <div className="scene-collection-state__illustration" aria-hidden="true">
        <AppIcon name={kind === 'error' ? 'rotate-ccw' : 'layers'} size={40} />
      </div>
      <div className="scene-collection-state__copy">
        <Heading id={titleId} className="scene-collection-state__title">{title}</Heading>
        <p className="scene-collection-state__description">{description}</p>
      </div>
      <div className="scene-collection-state__actions">{action}</div>
    </div>
  )
}

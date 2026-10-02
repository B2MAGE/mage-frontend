import { useId, type ReactNode } from 'react'
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
        <svg viewBox="0 0 56 56" fill="none" focusable="false">
          {kind === 'error' ? (
            <>
              <rect x="8" y="12" width="40" height="32" rx="8" stroke="currentColor" opacity=".35" />
              <path d="M36 25a9 9 0 1 0 .3 6M36 19v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : (
            <>
              <path d="M14 9h25a8 8 0 0 1 8 8v24" stroke="currentColor" opacity=".35" strokeWidth="1.5" strokeLinecap="round" />
              <rect x="7" y="15" width="34" height="32" rx="8" stroke="currentColor" opacity=".7" strokeWidth="1.5" />
              <ellipse cx="24" cy="31" rx="10" ry="6" transform="rotate(-35 24 31)" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="24" cy="31" r="2.5" fill="currentColor" />
            </>
          )}
        </svg>
      </div>
      <div className="scene-collection-state__copy">
        <Heading id={titleId} className="scene-collection-state__title">{title}</Heading>
        <p className="scene-collection-state__description">{description}</p>
      </div>
      <div className="scene-collection-state__actions">{action}</div>
    </div>
  )
}

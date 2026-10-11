import { type ReactNode, useId, useState } from 'react'
import { useSceneEditorFieldErrors } from './sceneEditorFieldErrors'

export function BuilderControlStage({ children, description, fieldPrefix, index, onRemove, onToggle, open, removeLabel, summary, title, titleAddon, toggleLabel }: {
  children: ReactNode
  description: string
  fieldPrefix: string
  index?: number
  onRemove?: () => void
  onToggle: () => void
  open: boolean
  removeLabel?: string
  summary: string[]
  title: string
  titleAddon?: ReactNode
  toggleLabel: string
}) {
  const headingId = useId()
  const contentId = useId()
  const issues = useSceneEditorFieldErrors()
  const hasError = Object.keys(issues).some(id => id.startsWith(fieldPrefix))
  const [revealedError, setRevealedError] = useState(false)
  if (hasError && !revealedError) setRevealedError(true)
  const expanded = open || revealedError
  return <section aria-label={`${title} controls`} className={`builder-control-stage${index === undefined ? ' builder-control-stage--unnumbered' : ''}${expanded ? ' is-open' : ''}`}>
    <header className="builder-control-stage__header">
      {index === undefined ? null : <span className="builder-control-stage__number">{index + 1}</span>}
      <span className="builder-control-stage__identity">
        <span className="builder-control-stage__title-line"><strong id={headingId}>{title}</strong>{titleAddon}</span>
        <span className="builder-control-stage__description">{description}</span>
      </span>
      <span className="builder-control-stage__summary" aria-label={`${title} summary`}>
        {summary.map(item => <span key={item}>{item}</span>)}
      </span>
      <button aria-controls={contentId} aria-expanded={expanded} aria-label={toggleLabel.replace(/^(Expand|Collapse)/, expanded ? 'Collapse' : 'Expand')}
        className="builder-control-stage__toggle" disabled={hasError} type="button" onClick={() => {
          setRevealedError(false)
          if (open || !revealedError) onToggle()
        }}>
        <span className="builder-control-stage__chevron" aria-hidden="true" />
      </button>
    </header>
    {expanded ? <div className="builder-control-stage__content" id={contentId}>
      {children}
      {onRemove ? <button aria-label={removeLabel} className="builder-control-stage__remove" type="button" onClick={onRemove}>Remove</button> : null}
    </div> : null}
  </section>
}

export function InspectorSection({ children, description, fieldPrefixes, status, title }: {
  children: ReactNode
  description: string
  fieldPrefixes: string[]
  status: string
  title: string
}) {
  const issues = useSceneEditorFieldErrors()
  const hasError = Object.keys(issues).some(id => fieldPrefixes.some(prefix => id.startsWith(prefix)))
  const [open, setOpen] = useState(false)
  return <details className="builder-inspector-section" open={open || hasError}
    onToggle={event => {
      if (hasError && !event.currentTarget.open) event.currentTarget.open = true
      setOpen(event.currentTarget.open)
    }}>
    <summary>
      <span className="builder-inspector-section__title">
        <h4 className="builder-object-editor__subheading">{title}</h4>
        <span>{description}</span>
      </span>
      <span className="builder-inspector-section__status">{status}</span>
      <span className="builder-inspector-section__chevron" aria-hidden="true" />
    </summary>
    <div className="builder-inspector-section__content">{children}</div>
  </details>
}


import type { PropsWithChildren, ReactNode } from 'react'
import { useSceneEditorFieldErrors } from './sceneEditorFieldErrors'

export function FieldGroupLabel({
  description,
  htmlFor,
  label,
  meta,
  metaLive,
}: {
  description?: string
  htmlFor?: string
  label: string
  meta?: ReactNode
  metaLive?: 'assertive' | 'polite'
}) {
  return (
    <div className="scene-field__copy">
      <div className="scene-field__label-row">
        {htmlFor ? (
          <label className="scene-field__label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="scene-field__label">{label}</span>
        )}
        {meta ? <span aria-live={metaLive} className="scene-field__meta">{meta}</span> : null}
      </div>
      {description ? <p className="scene-field__description">{description}</p> : null}
    </div>
  )
}

export function CollapsibleEditorGroup({
  children,
  className,
  hideLabel,
  id,
  isOpen,
  onToggle,
  showLabel,
}: PropsWithChildren<{
  className?: string
  hideLabel?: string
  id: string
  isOpen: boolean
  onToggle: () => void
  showLabel?: string
}>) {
  const errors = useSceneEditorFieldErrors()
  const errorControlIds: Record<string, string[]> = {
    'camera-advanced-options': ['camera-orientation-mode', 'camera-orientation-speed'],
    'animation-advanced-options': ['state-time'],
  }
  const showContent = isOpen || errorControlIds[id]?.some(controlId => Boolean(errors[controlId]))
  return (
    <section className={`scene-editor-collapsible${className ? ` ${className}` : ''}`}>
      <button
        aria-controls={id}
        aria-expanded={Boolean(showContent)}
        className="scene-editor-collapsible__toggle"
        onClick={onToggle}
        type="button"
      >
        {showContent ? hideLabel ?? 'Hide Advanced' : showLabel ?? 'Show Advanced'}
      </button>

      {showContent ? (
        <div className="scene-editor-collapsible__content" id={id}>
          {children}
        </div>
      ) : null}
    </section>
  )
}

export function ConfirmSummarySection({
  children,
  id,
  isOpen,
  issue,
  onEdit,
  onToggle,
  stepNumber,
  summary,
  title,
}: PropsWithChildren<{
  id: string
  isOpen: boolean
  issue?: string | null
  onEdit: () => void
  onToggle: () => void
  stepNumber: number
  summary: string
  title: string
}>) {
  const bodyId = `confirm-review-${id}`
  return (
    <section
      className="scene-confirm-section"
      data-issue={Boolean(issue)}
      data-open={isOpen}
    >
      <button
        aria-controls={bodyId}
        aria-expanded={isOpen}
        className="scene-confirm-section__head"
        onClick={onToggle}
        type="button"
      >
        <span className="scene-confirm-section__step">{stepNumber}</span>
        <span className="scene-confirm-section__copy">
          <strong>{title}</strong>
          <span>{summary}</span>
        </span>
        <span aria-hidden="true" className="scene-confirm-section__chevron" />
      </button>
      <div className="scene-confirm-section__body" hidden={!isOpen} id={bodyId}>
        {isOpen ? <>
          <div className="scene-confirm-section__toolbar">
            <button className="scene-confirm-section__edit" onClick={onEdit} type="button">
              Edit {title}
            </button>
          </div>
          {issue ? <p className="scene-confirm-section__issue" role="status">{issue}</p> : null}
          <dl className="scene-confirm-section__list">{children}</dl>
        </> : null}
      </div>
    </section>
  )
}

export function ConfirmSummaryItem({
  label,
  note,
  value,
  warning = false,
}: {
  label: string
  note?: string
  value: ReactNode
  warning?: boolean
}) {
  return (
    <div className="scene-confirm-section__item">
      <dt className="scene-confirm-section__term">{label}</dt>
      <dd className={`scene-confirm-section__value${warning ? ' scene-confirm-section__value--warning' : ''}`}>
        {value}
        {note ? <span className="scene-confirm-section__note">{note}</span> : null}
      </dd>
    </div>
  )
}

export function ConfirmSummaryPills({
  emptyLabel,
  values,
}: {
  emptyLabel: string
  values: string[]
}) {
  if (values.length === 0) {
    return <span>{emptyLabel}</span>
  }

  return (
    <span className="scene-confirm-pills">
      {values.map((value) => (
        <span className="scene-confirm-pill" key={value}>
          {value}
        </span>
      ))}
    </span>
  )
}

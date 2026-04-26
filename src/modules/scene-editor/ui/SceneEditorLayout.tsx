import type { PropsWithChildren, ReactNode } from 'react'

export function FieldGroupLabel({
  description,
  htmlFor,
  label,
}: {
  description?: string
  htmlFor?: string
  label: string
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
      </div>
      {description ? <p className="scene-field__description">{description}</p> : null}
    </div>
  )
}

export function CollapsibleEditorGroup({
  children,
  hideLabel,
  id,
  isOpen,
  onToggle,
  showLabel,
}: PropsWithChildren<{
  hideLabel?: string
  id: string
  isOpen: boolean
  onToggle: () => void
  showLabel?: string
}>) {
  return (
    <section className="scene-editor-collapsible">
      <button
        aria-controls={id}
        aria-expanded={isOpen}
        className="scene-editor-collapsible__toggle"
        onClick={onToggle}
        type="button"
      >
        {isOpen ? hideLabel ?? 'Hide Advanced' : showLabel ?? 'Show Advanced'}
      </button>

      {isOpen ? (
        <div className="scene-editor-collapsible__content" id={id}>
          {children}
        </div>
      ) : null}
    </section>
  )
}

export function ConfirmSummarySection({
  children,
  title,
}: PropsWithChildren<{
  title: string
}>) {
  return (
    <section className="scene-confirm-section">
      <h3 className="scene-confirm-section__title">{title}</h3>
      <dl className="scene-confirm-section__list">{children}</dl>
    </section>
  )
}

export function ConfirmSummaryItem({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="scene-confirm-section__item">
      <dt className="scene-confirm-section__term">{label}</dt>
      <dd className="scene-confirm-section__value">{value}</dd>
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

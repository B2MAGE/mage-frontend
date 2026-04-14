import type { ReactNode } from 'react'

export function PresetDetailState({
  title,
  description,
  actions,
}: {
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <main className="surface surface--hero">
      <div className="eyebrow">Preset Detail</div>
      <h1>{title}</h1>
      <p className="page-lead">{description}</p>
      {actions ? (
        <>
          <div className="divider" />
          {actions}
        </>
      ) : null}
      <p className="page-footnote">Preset detail routes now resolve through the live player flow.</p>
      <div className="page-mark">MAGE</div>
    </main>
  )
}

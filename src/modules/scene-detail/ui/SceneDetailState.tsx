import type { ReactNode } from 'react'

export function SceneDetailState({
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
      <div className="eyebrow">Scene Detail</div>
      <h1>{title}</h1>
      <p className="page-lead">{description}</p>
      {actions ? (
        <>
          <div className="divider" />
          {actions}
        </>
      ) : null}
      <p className="page-footnote">Scene detail routes now resolve through the live player flow.</p>
      <div className="page-mark">MAGE</div>
    </main>
  )
}

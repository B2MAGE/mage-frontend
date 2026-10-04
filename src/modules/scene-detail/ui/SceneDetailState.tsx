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
    <main className="scene-detail-page scene-detail-state">
      <div className="scene-detail-state__copy" role="alert">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions}
    </main>
  )
}

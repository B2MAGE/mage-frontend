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
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
    </main>
  )
}

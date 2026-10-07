import type { ReactNode } from 'react'
import { PageFrame } from '@shared/ui'

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
    <PageFrame className="scene-detail-page scene-detail-state">
      <div className="scene-detail-state__copy" role="alert">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions}
    </PageFrame>
  )
}

import type { HTMLAttributes, PropsWithChildren } from 'react'
import { joinClassNames } from '@shared/lib'

type SurfaceTone = 'hero' | 'nested' | 'page-panel' | 'soft'

type SurfaceCardProps = PropsWithChildren<
  HTMLAttributes<HTMLElement> & {
    as?: 'article' | 'div' | 'main' | 'section'
    tone: SurfaceTone
  }
>

const SURFACE_TONE_CLASS_NAME: Record<SurfaceTone, string> = {
  hero: 'surface--hero',
  nested: 'surface--nested',
  'page-panel': 'surface--page-panel',
  soft: 'surface--soft',
}

export function SurfaceCard({
  as = 'div',
  children,
  className,
  tone,
  ...props
}: SurfaceCardProps) {
  const Component = as

  return (
    <Component
      {...props}
      className={joinClassNames('surface', SURFACE_TONE_CLASS_NAME[tone], className)}
    >
      {children}
    </Component>
  )
}

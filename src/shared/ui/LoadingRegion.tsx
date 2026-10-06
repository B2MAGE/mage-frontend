import type { ReactNode } from 'react'
import { joinClassNames } from '@shared/lib'

type LoadingRegionElement = 'article' | 'aside' | 'div' | 'main' | 'section'

type LoadingRegionProps = {
  as?: LoadingRegionElement
  children: ReactNode
  className?: string
  label: string
  visualClassName?: string
}

export function LoadingRegion({
  as: Component = 'div',
  children,
  className,
  label,
  visualClassName,
}: LoadingRegionProps) {
  return (
    <Component
      aria-busy="true"
      className={joinClassNames('loading-region', 'ui-loading-region', className)}
    >
      <span
        aria-atomic="true"
        aria-live="polite"
        className="loading-region__status"
        role="status"
      >
        {label}
      </span>
      <div
        aria-hidden="true"
        className={joinClassNames('loading-region__visual', 'ui-loading-region__visual', visualClassName)}
      >
        {children}
      </div>
    </Component>
  )
}

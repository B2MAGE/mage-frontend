import type { ReactNode } from 'react'

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
      className={['loading-region', className].filter(Boolean).join(' ')}
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
        className={['loading-region__visual', visualClassName].filter(Boolean).join(' ')}
      >
        {children}
      </div>
    </Component>
  )
}

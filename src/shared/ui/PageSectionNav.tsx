import type { HTMLAttributes, PropsWithChildren } from 'react'
import { joinClassNames } from '@shared/lib'

type PageSectionNavProps = PropsWithChildren<
  HTMLAttributes<HTMLElement> & {
    ariaLabel: string
    listClassName?: string
  }
>

export function PageSectionNav({
  ariaLabel,
  children,
  className,
  listClassName,
  ...props
}: PageSectionNavProps) {
  return (
    <aside {...props} className={joinClassNames('ui-section-nav', className)}>
      <nav
        aria-label={ariaLabel}
        className={joinClassNames('ui-section-nav__list', listClassName)}
      >
        {children}
      </nav>
    </aside>
  )
}

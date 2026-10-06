import type { HTMLAttributes, PropsWithChildren } from 'react'
import { joinClassNames } from '@shared/lib'

type PageFrameWidth = 'wide' | 'readable' | 'form'

type PageFrameProps = PropsWithChildren<
  HTMLAttributes<HTMLElement> & {
    as?: 'div' | 'main' | 'section'
    width?: PageFrameWidth
  }
>

export function PageFrame({
  as: Component = 'main',
  children,
  className,
  width = 'wide',
  ...props
}: PageFrameProps) {
  return (
    <Component
      {...props}
      className={joinClassNames('ui-page-frame', `ui-page-frame--${width}`, className)}
    >
      {children}
    </Component>
  )
}

import type { HTMLAttributes, PropsWithChildren } from 'react'
import { joinClassNames } from '@shared/lib'

type PagePanelTone = 'primary' | 'nested' | 'quiet'

type PagePanelProps = PropsWithChildren<
  HTMLAttributes<HTMLElement> & {
    as?: 'article' | 'aside' | 'div' | 'section'
    interactive?: boolean
    padding?: 'normal' | 'compact' | 'none'
    tone?: PagePanelTone
  }
>

export function PagePanel({
  as: Component = 'section',
  children,
  className,
  interactive = false,
  padding = 'normal',
  tone = 'primary',
  ...props
}: PagePanelProps) {
  return (
    <Component
      {...props}
      className={joinClassNames(
        'ui-panel',
        `ui-panel--${tone}`,
        `ui-panel--padding-${padding}`,
        className,
      )}
      data-interactive={interactive || undefined}
    >
      {children}
    </Component>
  )
}

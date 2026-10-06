import type { HTMLAttributes } from 'react'
import { joinClassNames } from '@shared/lib'

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}

export function StatusBadge({ className, tone = 'neutral', ...props }: StatusBadgeProps) {
  return (
    <span
      {...props}
      className={joinClassNames('ui-status', `ui-status--${tone}`, className)}
    />
  )
}

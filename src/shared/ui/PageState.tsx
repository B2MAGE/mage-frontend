import type { HTMLAttributes, ReactNode } from 'react'
import { joinClassNames } from '@shared/lib'

type PageStateProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  actions?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  kind?: 'empty' | 'error'
  title: ReactNode
}

export function PageState({
  actions,
  className,
  description,
  icon,
  kind = 'empty',
  title,
  ...props
}: PageStateProps) {
  return (
    <div
      {...props}
      className={joinClassNames('ui-page-state', `ui-page-state--${kind}`, className)}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      {icon ? <div className="ui-page-state__icon" aria-hidden="true">{icon}</div> : null}
      <h2 className="ui-page-state__title">{title}</h2>
      {description ? <div className="ui-page-state__description">{description}</div> : null}
      {actions ? <div className="ui-page-state__actions">{actions}</div> : null}
    </div>
  )
}

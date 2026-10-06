import type { HTMLAttributes, ReactNode } from 'react'
import { joinClassNames } from '@shared/lib'

type PageHeaderProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  actions?: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  title: ReactNode
  titleAs?: 'h1' | 'h2'
  titleId?: string
}

export function PageHeader({
  actions,
  className,
  description,
  eyebrow,
  title,
  titleAs: Title = 'h1',
  titleId,
  ...props
}: PageHeaderProps) {
  return (
    <header {...props} className={joinClassNames('ui-page-header', className)}>
      <div className="ui-page-header__copy">
        {eyebrow ? <p className="ui-eyebrow">{eyebrow}</p> : null}
        <Title className="ui-page-title" id={titleId}>{title}</Title>
        {description ? <div className="ui-page-lead">{description}</div> : null}
      </div>
      {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
    </header>
  )
}

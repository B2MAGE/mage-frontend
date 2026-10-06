import type { HTMLAttributes, ReactNode } from 'react'
import { joinClassNames } from '@shared/lib'

type SectionHeaderProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  actions?: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  title: ReactNode
  titleAs?: 'h2' | 'h3'
}

export function SectionHeader({
  actions,
  className,
  description,
  eyebrow,
  title,
  titleAs: Title = 'h2',
  ...props
}: SectionHeaderProps) {
  return (
    <header {...props} className={joinClassNames('ui-section-header', className)}>
      <div className="ui-section-header__copy">
        {eyebrow ? <p className="ui-eyebrow">{eyebrow}</p> : null}
        <Title className="ui-section-title">{title}</Title>
        {description ? <div className="ui-section-description">{description}</div> : null}
      </div>
      {actions ? <div className="ui-section-header__actions">{actions}</div> : null}
    </header>
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { joinClassNames } from '@shared/lib'
import './creatorProfileLink.css'

type CreatorProfileLinkProps = {
  handle?: string | null
  children: ReactNode
  className?: string
}

export function CreatorProfileLink({ handle, children, className }: CreatorProfileLinkProps) {
  const normalizedHandle = handle?.trim().replace(/^@/, '').toLowerCase()
  const classes = joinClassNames('creator-profile-link', className)

  if (!normalizedHandle || !/^[a-z][a-z0-9_]{2,29}$/.test(normalizedHandle)) {
    return <span className={className}>{children}</span>
  }

  return <Link className={classes} to={`/@${normalizedHandle}`}>{children}</Link>
}

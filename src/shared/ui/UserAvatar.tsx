import { joinClassNames } from '@shared/lib'
import './userAvatar.css'

type UserAvatarProps = {
  className?: string
  initials: string
}

// Each placement keeps its own dimensions; the avatar's appearance is shared.
export function UserAvatar({ className, initials }: UserAvatarProps) {
  return <span className={joinClassNames('user-avatar', className)} aria-hidden="true">{initials}</span>
}

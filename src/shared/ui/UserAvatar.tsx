import { joinClassNames } from '@shared/lib'
import { avatarGradientStyle } from '@shared/lib/avatarGradient'
import './userAvatar.css'

type UserAvatarProps = {
  className?: string
  initials: string
  gradientStart?: string | null
  gradientEnd?: string | null
}

// Each placement keeps its own dimensions; the avatar's appearance is shared.
export function UserAvatar({ className, initials, gradientStart, gradientEnd }: UserAvatarProps) {
  return <span className={joinClassNames('user-avatar', className)} style={avatarGradientStyle(gradientStart, gradientEnd)} aria-hidden="true">{initials}</span>
}

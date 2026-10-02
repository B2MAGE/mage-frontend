import { joinClassNames } from '@shared/lib'
import { UserAvatar } from './UserAvatar'
import './profileFields.css'

type ProfileIdentityPreviewProps = {
  className?: string
  displayName: string
  handle: string
  gradientStart?: string | null
  gradientEnd?: string | null
}

export function ProfileIdentityPreview({
  className,
  displayName,
  handle,
  gradientStart,
  gradientEnd,
}: ProfileIdentityPreviewProps) {
  const previewDisplayName = displayName.trim() || 'Display name'
  const handleName = handle.trim().replace(/^@+/, '')
  const previewHandle = handleName ? `@${handleName}` : '@handle'
  const previewInitials = displayName.trim().split(/\s+/)
    .map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'MG'

  return (
    <div className={joinClassNames('profile-identity-preview', className)} role="group" aria-label="Profile preview">
      <UserAvatar className="profile-identity-preview__avatar" initials={previewInitials} gradientStart={gradientStart} gradientEnd={gradientEnd} />
      <div className="profile-identity-preview__copy">
        <strong>{previewDisplayName}</strong>
        <span>{previewHandle}</span>
      </div>
    </div>
  )
}

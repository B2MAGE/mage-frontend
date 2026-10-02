import './profileFields.css'
import { AppIcon } from './AppIcon'

export function PublicProfileMarker() {
  return (
    <AppIcon name="asterisk" size={12} className="public-profile-marker settings-public-field-marker" />
  )
}

import { Link } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { useAdminCapabilities } from './useAdminCapabilities'

export function ModeratorSettingsLink() {
  const { capabilities } = useAdminCapabilities()
  return capabilities && (capabilities.canModerateScenes || capabilities.canManageModerators || capabilities.canManageCustomRendering)
    ? <a className="settings-nav__link" href="/moderation">Moderation</a> : null
}

export function ModerationMenuLink({ onNavigate }: { onNavigate: () => void }) {
  const { capabilities } = useAdminCapabilities()
  if (!capabilities || !(capabilities.canModerateScenes || capabilities.canManageModerators || capabilities.canManageCustomRendering)) return null
  return <Link className="nav-menu__item" role="menuitem" to="/moderation" onClick={onNavigate}>
    <span className="nav-menu__icon"><Shield size={18} aria-hidden="true" /></span>
    <span>Moderation</span>
  </Link>
}

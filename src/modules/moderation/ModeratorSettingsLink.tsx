import { useAdminCapabilities } from './useAdminCapabilities'

export function ModeratorSettingsLink() {
  const { capabilities } = useAdminCapabilities()
  return capabilities?.canManageModerators
    ? <a className="settings-nav__link" href="/settings/moderators">Scene moderators</a> : null
}

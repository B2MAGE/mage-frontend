import { useAuth } from '@auth'
import { saveUserProfile } from './profile'
import { ProfileDetailsForm, ThemeSettingsSection } from './ui'

export function SettingsPage() {
  const { authenticatedFetch, updateAuthenticatedUser, user } = useAuth()

  if (!user) {
    return (
      <main className="surface surface--hero">
        <div className="eyebrow">Settings</div>
        <h1>Unable to open settings</h1>
        <p className="page-lead">
          MAGE could not find the signed-in account details needed to render this page.
        </p>
      </main>
    )
  }

  return (
    <main className="page-stack settings-page">
      <section className="surface surface--page-panel">
        <div className="eyebrow">Settings</div>
        <h1 className="settings-title">Settings</h1>
        <p className="settings-lead">
          Manage your MAGE profile details and choose the interface theme that fits this device.
        </p>

        <ThemeSettingsSection />

        <ProfileDetailsForm
          email={user.email}
          firstName={user.firstName ?? ''}
          lastName={user.lastName ?? ''}
          displayName={user.displayName}
          onSave={async (nameFields) => {
            const result = await saveUserProfile(authenticatedFetch, nameFields)

            if (result.ok && result.user) {
              updateAuthenticatedUser(result.user)
            }

            return result
          }}
        />
      </section>
    </main>
  )
}

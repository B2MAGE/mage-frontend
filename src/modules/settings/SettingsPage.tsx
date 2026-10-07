import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@auth'
import { PageFrame, PageHeader, PageState } from '@shared/ui'
import { changePassword } from './password'
import { saveUserProfile } from './profile'
import { getSettingsSection, type SettingsSection } from './sections'
import { PasswordChangeForm, ProfileDetailsForm, ThemeSettingsSection } from './ui'
import './settings.css'

const sectionLinks: Array<{ id: SettingsSection; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Password' },
]

export function SettingsPage() {
  const { authenticatedFetch, updateAuthenticatedUser, user } = useAuth()
  const location = useLocation()
  const activeSection = getSettingsSection(location.hash)

  if (!user) {
    return (
      <PageFrame className="settings-page" width="form">
        <PageState
          description="MAGE could not find the signed-in account details needed to render this page."
          kind="error"
          title="Unable to open settings"
        />
      </PageFrame>
    )
  }

  return (
    <PageFrame className="settings-page" width="form">
      <PageHeader
        className="settings-page__heading"
        description="Manage how MAGE looks on this device and update the account details tied to your profile."
        title="Settings"
      />

      <div className="settings-layout">
        <aside className="settings-nav">
          <nav aria-label="Settings sections" className="settings-nav__list">
            {sectionLinks.map(({ id, label }) => (
              <Link
                aria-current={activeSection === id ? 'page' : undefined}
                className="settings-nav__link"
                key={id}
                to={{ pathname: location.pathname, search: location.search, hash: `#${id}` }}
              >
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        <section className="settings-content">
          <div className="settings-section-view" hidden={activeSection !== 'appearance'}>
            <ThemeSettingsSection />
          </div>

          <div className="settings-section-view" hidden={activeSection !== 'profile'}>
            <ProfileDetailsForm
              avatarGradientStart={user.avatarGradientStart}
              avatarGradientEnd={user.avatarGradientEnd}
              description={user.description ?? ''}
              email={user.email}
              firstName={user.firstName ?? ''}
              handle={user.handle ?? ''}
              lastName={user.lastName ?? ''}
              displayName={user.displayName}
              onSave={async (profileFields) => {
                const result = await saveUserProfile(authenticatedFetch, profileFields)

                if (result.ok && result.user) {
                  updateAuthenticatedUser(result.user)
                }

                return result
              }}
            />
          </div>

          <div className="settings-section-view" hidden={activeSection !== 'security'}>
            <PasswordChangeForm
              authProvider={user.authProvider}
              onSave={(passwordFields) => changePassword(authenticatedFetch, passwordFields)}
            />
          </div>
        </section>
      </div>
    </PageFrame>
  )
}

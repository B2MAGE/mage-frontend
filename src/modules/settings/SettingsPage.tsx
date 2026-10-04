import { useState } from 'react'
import { useAuth } from '@auth'
import { ModeratorSettingsLink } from '@modules/moderation'
import { changePassword } from './password'
import { saveUserProfile } from './profile'
import { PasswordChangeForm, ProfileDetailsForm, ThemeSettingsSection } from './ui'
import './settings.css'

export function SettingsPage() {
  const { authenticatedFetch, updateAuthenticatedUser, user } = useAuth()
  const [activeSection, setActiveSection] = useState('appearance')

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
      <header className="settings-page__heading">
        <div className="eyebrow">Settings</div>
        <h1 className="settings-title">Settings</h1>
        <p className="settings-lead">
          Manage how MAGE looks on this device and update the account details tied to your profile.
        </p>
      </header>

      <div className="settings-layout">
        <aside className="settings-nav">
          <nav aria-label="Settings sections" className="settings-nav__list">
            <a className="settings-nav__link" aria-current={activeSection === 'appearance' ? 'location' : undefined} href="#appearance" onClick={() => setActiveSection('appearance')}>
              Appearance
            </a>
            <a className="settings-nav__link" aria-current={activeSection === 'profile' ? 'location' : undefined} href="#profile" onClick={() => setActiveSection('profile')}>
              Profile
            </a>
            <a className="settings-nav__link" aria-current={activeSection === 'security' ? 'location' : undefined} href="#security" onClick={() => setActiveSection('security')}>
              Password
            </a>
            <ModeratorSettingsLink />
          </nav>
        </aside>

        <section className="settings-content">
          <ThemeSettingsSection />

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

          <PasswordChangeForm
            authProvider={user.authProvider}
            onSave={(passwordFields) => changePassword(authenticatedFetch, passwordFields)}
          />
        </section>
      </div>
    </main>
  )
}

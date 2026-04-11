import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'

function splitDisplayName(displayName: string) {
  const trimmedDisplayName = displayName.trim()

  if (!trimmedDisplayName) {
    return { firstName: '', lastName: '' }
  }

  const [firstName = '', ...remainingParts] = trimmedDisplayName.split(/\s+/)

  return {
    firstName,
    lastName: remainingParts.join(' '),
  }
}

export function SettingsPage() {
  const { user } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  useEffect(() => {
    const nextNameFields = splitDisplayName(user?.displayName ?? '')
    setFirstName(nextNameFields.firstName)
    setLastName(nextNameFields.lastName)
  }, [user?.displayName])

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
      <section className="surface surface--page-header">
        <div className="eyebrow">Settings</div>
        <h1>Profile settings</h1>
        <p className="page-lead">
          Review the creator name tied to your account and keep password recovery close at hand.
        </p>
      </section>

      <section className="surface surface--page-panel">
        <div className="settings-layout">
          <section className="surface surface--soft settings-section" aria-labelledby="settings-profile-title">
            <div className="settings-section__header">
              <h2 id="settings-profile-title">Profile details</h2>
              <p>These fields are seeded from the display name on your current account.</p>
            </div>

            <div className="settings-form-grid">
              <div className="field-group">
                <label htmlFor="settings-first-name">First name</label>
                <input
                  id="settings-first-name"
                  name="firstName"
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="First name"
                  type="text"
                  value={firstName}
                />
              </div>

              <div className="field-group">
                <label htmlFor="settings-last-name">Last name</label>
                <input
                  id="settings-last-name"
                  name="lastName"
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Last name"
                  type="text"
                  value={lastName}
                />
              </div>
            </div>
          </section>

          <section className="surface surface--soft settings-section" aria-labelledby="settings-account-title">
            <div className="settings-section__header">
              <h2 id="settings-account-title">Account access</h2>
              <p>Keep your sign-in details visible in one place and trigger password recovery when needed.</p>
            </div>

            <dl className="settings-account-list">
              <div>
                <dt>Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Sign-in provider</dt>
                <dd>{user.authProvider}</dd>
              </div>
            </dl>

            <button className="preset-secondary-button settings-reset-button" type="button">
              Reset password
            </button>
          </section>
        </div>
      </section>
    </main>
  )
}

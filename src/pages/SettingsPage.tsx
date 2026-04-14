import { useState } from 'react'
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
        <h1 className="settings-title">Profile details</h1>
        <p className="settings-lead">
          Review the account details currently tied to your MAGE profile.
        </p>

        <ProfileDetailsForm
          key={`${user.email}:${user.displayName}`}
          displayName={user.displayName}
          email={user.email}
        />
      </section>
    </main>
  )
}

type ProfileDetailsFormProps = {
  displayName: string
  email: string
}

function ProfileDetailsForm({ displayName, email }: ProfileDetailsFormProps) {
  const [nameFields, setNameFields] = useState(() => splitDisplayName(displayName))

  return (
    <section className="surface surface--soft settings-section" aria-label="Profile details">
      <div className="settings-fields">
        <div className="field-group">
          <label htmlFor="settings-email">Email</label>
          <input id="settings-email" name="email" readOnly type="email" value={email} />
        </div>

        <div className="field-group">
          <label htmlFor="settings-first-name">First name</label>
          <input
            id="settings-first-name"
            name="firstName"
            onChange={(event) =>
              setNameFields((currentFields) => ({
                ...currentFields,
                firstName: event.target.value,
              }))
            }
            placeholder="First name"
            type="text"
            value={nameFields.firstName}
          />
        </div>

        <div className="field-group">
          <label htmlFor="settings-last-name">Last name</label>
          <input
            id="settings-last-name"
            name="lastName"
            onChange={(event) =>
              setNameFields((currentFields) => ({
                ...currentFields,
                lastName: event.target.value,
              }))
            }
            placeholder="Last name"
            type="text"
            value={nameFields.lastName}
          />
        </div>

        <button className="scene-secondary-button settings-reset-button" type="button">
          Reset password
        </button>
      </div>
    </section>
  )
}

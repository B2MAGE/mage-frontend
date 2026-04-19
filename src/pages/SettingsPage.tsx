import { useEffect, useId, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { parseApiError } from '../lib/authForm'

type UserProfileResponse = {
  userId: number | null
  email: string
  firstName?: string
  lastName?: string
  displayName: string
  authProvider: string
  createdAt?: string
}

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
        <h1 className="settings-title">Profile details</h1>
        <p className="settings-lead">
          Review the account details currently tied to your MAGE profile.
        </p>

        <ProfileDetailsForm
          email={user.email}
          firstName={user.firstName ?? ''}
          lastName={user.lastName ?? ''}
          displayName={user.displayName}
          onSave={async (nameFields) => {
            const response = await authenticatedFetch('/users/me', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(nameFields),
            })

            if (!response.ok) {
              const apiError = await parseApiError(response)
              return {
                ok: false as const,
                details: apiError?.details ?? {},
                message:
                  apiError?.message ??
                  'Profile updates are unavailable right now. Please try again in a moment.',
              }
            }

            const updatedUser = (await response.json()) as UserProfileResponse
            updateAuthenticatedUser(updatedUser)

            return {
              ok: true as const,
            }
          }}
        />
      </section>
    </main>
  )
}

type ProfileDetailsFormProps = {
  email: string
  firstName: string
  lastName: string
  displayName: string
  onSave: (nameFields: { firstName: string; lastName: string; displayName: string }) => Promise<
    | { ok: true }
    | { ok: false; details: Record<string, string>; message: string }
  >
}

function ProfileDetailsForm({
  email,
  firstName,
  lastName,
  displayName,
  onSave,
}: ProfileDetailsFormProps) {
  const [nameFields, setNameFields] = useState(() => ({ firstName, lastName, displayName }))
  const [errors, setErrors] = useState<{
    firstName?: string
    lastName?: string
    displayName?: string
    form?: string
  }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const formNoticeId = useId()

  const isDirty =
    nameFields.firstName !== firstName ||
    nameFields.lastName !== lastName ||
    nameFields.displayName !== displayName

  useEffect(() => {
    setNameFields({ firstName, lastName, displayName })
  }, [firstName, lastName, displayName])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setIsSubmitting(true)
    setErrors({})
    setSuccessMessage('')

    try {
      const result = await onSave({
        firstName: nameFields.firstName.trim(),
        lastName: nameFields.lastName.trim(),
        displayName: nameFields.displayName.trim(),
      })

      if (!result.ok) {
        setErrors({
          firstName: result.details.firstName,
          lastName: result.details.lastName,
          displayName: result.details.displayName,
          form: result.message,
        })
        return
      }

      setSuccessMessage('Profile details saved.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="surface surface--soft settings-section" aria-label="Profile details">
      <form className="settings-fields" onSubmit={handleSubmit}>
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
            aria-describedby={errors.firstName ? 'settings-first-name-error' : undefined}
            aria-invalid={Boolean(errors.firstName)}
            placeholder="First name"
            type="text"
            value={nameFields.firstName}
          />
          {errors.firstName ? (
            <p className="field-error" id="settings-first-name-error" role="alert">
              {errors.firstName}
            </p>
          ) : null}
        </div>

        <div className="field-group">
          <label htmlFor="settings-display-name">Display name</label>
          <input
            id="settings-display-name"
            name="displayName"
            onChange={(event) =>
              setNameFields((currentFields) => ({
                ...currentFields,
                displayName: event.target.value,
              }))
            }
            aria-describedby={errors.displayName ? 'settings-display-name-error' : undefined}
            aria-invalid={Boolean(errors.displayName)}
            placeholder="Display name"
            type="text"
            value={nameFields.displayName}
          />
          {errors.displayName ? (
            <p className="field-error" id="settings-display-name-error" role="alert">
              {errors.displayName}
            </p>
          ) : null}
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
            aria-describedby={errors.lastName ? 'settings-last-name-error' : undefined}
            aria-invalid={Boolean(errors.lastName)}
            placeholder="Last name"
            type="text"
            value={nameFields.lastName}
          />
          {errors.lastName ? (
            <p className="field-error" id="settings-last-name-error" role="alert">
              {errors.lastName}
            </p>
          ) : null}
        </div>

        {errors.form ? (
          <div className="form-alert" id={formNoticeId} role="alert">
            {errors.form}
          </div>
        ) : null}

        {successMessage ? (
          <div className="form-note" role="status">
            {successMessage}
          </div>
        ) : null}

        <button
          className="demo-link auth-submit"
          disabled={!isDirty || isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'Saving...' : 'Save changes'}
        </button>

        <button className="scene-secondary-button settings-reset-button" type="button">
          Reset password
        </button>
      </form>
    </section>
  )
}

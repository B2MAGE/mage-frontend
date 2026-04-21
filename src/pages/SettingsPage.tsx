import { useEffect, useId, useState, type FormEvent } from 'react'
import { useAuth } from '@auth'
import { ThemeSettingsSection } from '@components/settings'
import { parseApiError } from '@shared/lib'
import { FormNotice, SurfaceCard, TextInputField } from '@shared/ui'

const PROFILE_SAVE_UNAVAILABLE_MESSAGE =
  'Profile updates are unavailable right now. Please try again in a moment.'

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
            try {
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
                  message: apiError?.message ?? PROFILE_SAVE_UNAVAILABLE_MESSAGE,
                }
              }

              const updatedUser = (await response.json()) as UserProfileResponse
              updateAuthenticatedUser(updatedUser)

              return {
                ok: true as const,
              }
            } catch {
              return {
                ok: false as const,
                details: {},
                message: PROFILE_SAVE_UNAVAILABLE_MESSAGE,
              }
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
    <SurfaceCard as="section" className="settings-section" tone="soft" aria-label="Profile details">
      <div className="settings-section__header">
        <h2>Profile details</h2>
        <p>Review the account details currently tied to your MAGE profile.</p>
      </div>
      <form className="settings-fields" onSubmit={handleSubmit}>
        <TextInputField id="settings-email" label="Email" name="email" readOnly type="email" value={email} />
        <TextInputField
          error={errors.displayName}
          id="settings-display-name"
          label="Display name"
          name="displayName"
          onChange={(event) =>
            setNameFields((currentFields) => ({
              ...currentFields,
              displayName: event.target.value,
            }))
          }
          placeholder="Display name"
          type="text"
          value={nameFields.displayName}
        />
        <TextInputField
          error={errors.firstName}
          id="settings-first-name"
          label="First name"
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
        <TextInputField
          error={errors.lastName}
          id="settings-last-name"
          label="Last name"
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

        {errors.form ? (
          <FormNotice id={formNoticeId} tone="error">
            {errors.form}
          </FormNotice>
        ) : null}

        {successMessage ? (
          <FormNotice tone="note">
            {successMessage}
          </FormNotice>
        ) : null}

        <div className="settings-actions">
          <button
            className="demo-link auth-submit settings-action-button settings-save-button"
            disabled={!isDirty || isSubmitting}
            type="submit"
          >
            {isSubmitting ? 'Saving...' : 'Save changes'}
          </button>

          <button
            className="scene-secondary-button settings-action-button settings-reset-button"
            type="button"
          >
            Reset password
          </button>
        </div>
      </form>
    </SurfaceCard>
  )
}

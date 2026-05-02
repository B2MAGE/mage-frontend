import { useEffect, useId, useState, type FormEvent } from 'react'
import { FormNotice, SurfaceCard, TextInputField } from '@shared/ui'
import type { ProfileNameFields, ProfileSaveResult } from '../types'

type ProfileDetailsFormProps = {
  displayName: string
  email: string
  firstName: string
  lastName: string
  onSave: (nameFields: ProfileNameFields) => Promise<ProfileSaveResult>
}

export function ProfileDetailsForm({
  displayName,
  email,
  firstName,
  lastName,
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

        {successMessage ? <FormNotice tone="note">{successMessage}</FormNotice> : null}

        <div className="settings-actions">
          <button
            className="demo-link auth-submit settings-action-button settings-save-button"
            disabled={!isDirty || isSubmitting}
            type="submit"
          >
            {isSubmitting ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>
    </SurfaceCard>
  )
}

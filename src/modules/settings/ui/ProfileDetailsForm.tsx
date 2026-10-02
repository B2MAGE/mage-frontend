import { useEffect, useId, useState, type FormEvent } from 'react'
import {
  formatHandleInput,
  HANDLE_INPUT_MAX_LENGTH,
  validateHandleInput,
} from '@auth/handle'
import { FormNotice, PendingButtonLabel, SurfaceCard, TextInputField } from '@shared/ui'
import type { ProfileDetailsFields, ProfileSaveResult } from '../types'

type ProfileDetailsFormProps = {
  description: string
  displayName: string
  email: string
  firstName: string
  handle: string
  lastName: string
  onSave: (profileFields: ProfileDetailsFields) => Promise<ProfileSaveResult>
}

type EditableProfileFields = Omit<ProfileDetailsFields, 'description'> & {
  description: string
}

type ProfileFormErrors = Partial<Record<keyof EditableProfileFields | 'form', string>>

export function ProfileDetailsForm({
  description,
  displayName,
  email,
  firstName,
  handle,
  lastName,
  onSave,
}: ProfileDetailsFormProps) {
  const formattedHandle = formatHandleInput(handle)
  const [profileFields, setProfileFields] = useState<EditableProfileFields>(() => ({
    firstName,
    lastName,
    displayName,
    handle: formattedHandle,
    description,
  }))
  const [errors, setErrors] = useState<ProfileFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const formNoticeId = useId()

  const isDirty =
    profileFields.firstName !== firstName ||
    profileFields.lastName !== lastName ||
    profileFields.displayName !== displayName ||
    profileFields.handle !== formattedHandle ||
    profileFields.description !== description

  useEffect(() => {
    setProfileFields({
      firstName,
      lastName,
      displayName,
      handle: formatHandleInput(handle),
      description,
    })
  }, [description, firstName, handle, lastName, displayName])

  function handleFieldChange(field: keyof EditableProfileFields, nextValue: string) {
    setProfileFields((currentFields) => ({
      ...currentFields,
      [field]: nextValue,
    }))
    setSuccessMessage('')
    setErrors((currentErrors) => {
      if (!currentErrors[field] && !currentErrors.form) {
        return currentErrors
      }

      return {
        ...currentErrors,
        [field]: undefined,
        form: undefined,
      }
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedHandle = profileFields.handle.trim()
    const handleError = validateHandleInput(trimmedHandle)
    const descriptionError =
      profileFields.description.length > 300
        ? 'Description must be at most 300 characters.'
        : undefined

    if (handleError || descriptionError) {
      setErrors({
        handle: handleError,
        description: descriptionError,
      })
      setSuccessMessage('')
      return
    }

    setIsSubmitting(true)
    setErrors({})
    setSuccessMessage('')

    try {
      const result = await onSave({
        firstName: profileFields.firstName.trim(),
        lastName: profileFields.lastName.trim(),
        displayName: profileFields.displayName.trim(),
        handle: trimmedHandle,
        description: profileFields.description.trim() || null,
      })

      if (!result.ok) {
        setErrors({
          firstName: result.details.firstName,
          lastName: result.details.lastName,
          displayName: result.details.displayName,
          handle: result.details.handle,
          description: result.details.description,
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
    <SurfaceCard
      as="section"
      className="settings-section settings-section--profile"
      id="profile"
      tone="soft"
      aria-label="Profile details"
    >
      <div className="settings-section__header">
        <h2>Profile details</h2>
        <p>Your display name, handle, and description appear publicly on your profile.</p>
      </div>
      <form className="settings-fields settings-profile-form" onSubmit={handleSubmit}>
        <div className="settings-identity">
          <span className="settings-identity__avatar" aria-hidden="true">{displayName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'MG'}</span>
          <div className="settings-identity__copy"><strong>{displayName}</strong><span>{email}</span></div>
        </div>
        <TextInputField
          error={errors.displayName}
          id="settings-display-name"
          label="Display name"
          fieldClassName="settings-field--full"
          hint="Shown publicly on your scenes and comments."
          name="displayName"
          onChange={(event) => handleFieldChange('displayName', event.target.value)}
          placeholder="Display name"
          type="text"
          value={profileFields.displayName}
        />
        <TextInputField
          autoCapitalize="none"
          autoComplete="username"
          error={errors.handle}
          id="settings-handle"
          label="Handle"
          fieldClassName="settings-field--full"
          hint="Your unique profile address. Start with @ and use 3–30 letters, numbers, or underscores."
          maxLength={HANDLE_INPUT_MAX_LENGTH}
          name="handle"
          onChange={(event) => handleFieldChange('handle', event.target.value)}
          placeholder="@sceneartist"
          required
          spellCheck={false}
          type="text"
          value={profileFields.handle}
        />
        <TextInputField
          error={errors.firstName}
          id="settings-first-name"
          label="First name"
          name="firstName"
          onChange={(event) => handleFieldChange('firstName', event.target.value)}
          placeholder="First name"
          type="text"
          value={profileFields.firstName}
        />
        <TextInputField
          error={errors.lastName}
          id="settings-last-name"
          label="Last name"
          name="lastName"
          onChange={(event) => handleFieldChange('lastName', event.target.value)}
          placeholder="Last name"
          type="text"
          value={profileFields.lastName}
        />
        <div className="field-group settings-field--full">
          <label htmlFor="settings-description">Description</label>
          <textarea
            aria-describedby={
              errors.description
                ? 'settings-description-hint settings-description-error'
                : 'settings-description-hint'
            }
            aria-invalid={Boolean(errors.description) || undefined}
            id="settings-description"
            maxLength={300}
            name="description"
            onChange={(event) => handleFieldChange('description', event.target.value)}
            placeholder="Tell people about the scenes you make."
            rows={4}
            value={profileFields.description}
          />
          <p className="field-hint settings-description-hint" id="settings-description-hint">
            <span>Shown on your public profile.</span>
            <span>{profileFields.description.length} / 300</span>
          </p>
          {errors.description ? (
            <p className="field-error" id="settings-description-error" role="alert">
              {errors.description}
            </p>
          ) : null}
        </div>

        {errors.form ? (
          <FormNotice id={formNoticeId} tone="error">
            {errors.form}
          </FormNotice>
        ) : null}

        {successMessage ? <FormNotice tone="note">{successMessage}</FormNotice> : null}

        <div className="settings-actions">
          <button
            aria-busy={isSubmitting}
            className="demo-link auth-submit settings-action-button settings-save-button"
            disabled={!isDirty || isSubmitting}
            type="submit"
          >
            <PendingButtonLabel pending={isSubmitting} pendingLabel="Saving...">
              Save changes
            </PendingButtonLabel>
          </button>
        </div>
      </form>
    </SurfaceCard>
  )
}

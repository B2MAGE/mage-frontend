import { useEffect, useId, useState, type FormEvent } from 'react'
import {
  formatHandleInput,
  HANDLE_FORMAT_ERROR,
  validateHandleInput,
} from '@auth/handle'
import { HandleInputField } from '@auth/HandleInputField'
import { DEFAULT_AVATAR_GRADIENT, isAvatarColor, normalizeAvatarColor } from '@shared/lib/avatarGradient'
import { AvatarGradientPicker } from './AvatarGradientPicker'
import {
  ActionButton,
  FormNotice,
  PagePanel,
  PendingButtonLabel,
  ProfileIdentityPreview,
  PublicProfileMarker,
  TextInputField,
} from '@shared/ui'
import type { ProfileDetailsFields, ProfileSaveResult } from '../types'

type ProfileDetailsFormProps = {
  avatarGradientStart?: string | null
  avatarGradientEnd?: string | null
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
  avatarGradientStart: string
  avatarGradientEnd: string
}

type ProfileFormErrors = Partial<Record<keyof EditableProfileFields | 'form', string>>

export function ProfileDetailsForm({
  avatarGradientStart,
  avatarGradientEnd,
  description,
  displayName,
  email,
  firstName,
  handle,
  lastName,
  onSave,
}: ProfileDetailsFormProps) {
  const handleName = formatHandleInput(handle).replace(/^@/, '')
  const savedStart = normalizeAvatarColor(avatarGradientStart, DEFAULT_AVATAR_GRADIENT.start)
  const savedEnd = normalizeAvatarColor(avatarGradientEnd, DEFAULT_AVATAR_GRADIENT.end)
  const [profileFields, setProfileFields] = useState<EditableProfileFields>(() => ({
    firstName,
    lastName,
    displayName,
    handle: handleName,
    description,
    avatarGradientStart: savedStart,
    avatarGradientEnd: savedEnd,
  }))
  const [errors, setErrors] = useState<ProfileFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const formNoticeId = useId()

  const isDirty =
    profileFields.firstName !== firstName ||
    profileFields.lastName !== lastName ||
    profileFields.displayName !== displayName ||
    profileFields.handle !== handleName ||
    profileFields.description !== description ||
    profileFields.avatarGradientStart.toLowerCase() !== savedStart ||
    profileFields.avatarGradientEnd.toLowerCase() !== savedEnd

  useEffect(() => {
    setProfileFields({
      firstName,
      lastName,
      displayName,
      handle: formatHandleInput(handle).replace(/^@/, ''),
      description,
      avatarGradientStart: savedStart,
      avatarGradientEnd: savedEnd,
    })
  }, [description, firstName, handle, lastName, displayName, savedStart, savedEnd])

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

    const formattedHandle = formatHandleInput(profileFields.handle)
    const handleValidationError = validateHandleInput(formattedHandle)
    const handleError = handleValidationError === HANDLE_FORMAT_ERROR
      ? 'Use 3–30 letters, numbers, or underscores, starting with a letter.'
      : handleValidationError
    const descriptionError =
      profileFields.description.length > 300
        ? 'Description must be at most 300 characters.'
        : undefined

    const avatarError = !isAvatarColor(profileFields.avatarGradientStart) || !isAvatarColor(profileFields.avatarGradientEnd)
      ? 'Choose two colors using six-digit hex values, like #5c51ba.'
      : undefined

    if (handleError || descriptionError || avatarError) {
      setErrors({
        handle: handleError,
        description: descriptionError,
        avatarGradientStart: avatarError,
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
        handle: formattedHandle,
        description: profileFields.description.trim() || null,
        avatarGradientStart: profileFields.avatarGradientStart.toLowerCase(),
        avatarGradientEnd: profileFields.avatarGradientEnd.toLowerCase(),
      })

      if (!result.ok) {
        setErrors({
          firstName: result.details.firstName,
          lastName: result.details.lastName,
          displayName: result.details.displayName,
          handle: result.details.handle,
          description: result.details.description,
          avatarGradientStart: result.details.avatarGradientStart,
          avatarGradientEnd: result.details.avatarGradientEnd,
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
    <PagePanel
      as="section"
      className="settings-section settings-section--profile"
      id="profile"
      aria-label="Profile details"
    >
      <div className="settings-section__header">
        <h2>Profile details</h2>
        <p>Your avatar, display name, handle, and description appear publicly on your profile.</p>
      </div>
      <form className="settings-fields settings-profile-form" onSubmit={handleSubmit}>
        <TextInputField
          id="settings-email"
          label="Email"
          fieldClassName="settings-field--full"
          hint="Your sign-in email. It can't be changed here."
          name="email"
          readOnly
          type="email"
          value={email}
        />
        <ProfileIdentityPreview
          className="settings-identity"
          displayName={profileFields.displayName}
          handle={profileFields.handle}
          gradientStart={profileFields.avatarGradientStart}
          gradientEnd={profileFields.avatarGradientEnd}
        />
        <AvatarGradientPicker
          start={profileFields.avatarGradientStart}
          end={profileFields.avatarGradientEnd}
          disabled={isSubmitting}
          error={errors.avatarGradientStart || errors.avatarGradientEnd}
          onChange={(start, end) => {
            handleFieldChange('avatarGradientStart', start)
            handleFieldChange('avatarGradientEnd', end)
          }}
        />
        <TextInputField
          aria-describedby="settings-public-profile-hint"
          error={errors.displayName}
          id="settings-display-name"
          label="Display name"
          labelSuffix={<PublicProfileMarker />}
          fieldClassName="settings-field--full"
          name="displayName"
          onChange={(event) => handleFieldChange('displayName', event.target.value)}
          placeholder="John"
          type="text"
          value={profileFields.displayName}
        />
        <HandleInputField
          aria-describedby="settings-public-profile-hint"
          error={errors.handle}
          id="settings-handle"
          label="Handle"
          labelSuffix={<PublicProfileMarker />}
          fieldClassName="settings-field--full"
          hint="Use 3–30 letters, numbers, or underscores, starting with a letter."
          onValueChange={(nextValue) => handleFieldChange('handle', nextValue)}
          placeholder="jdoe"
          required
          value={profileFields.handle}
        />
        <TextInputField
          error={errors.firstName}
          id="settings-first-name"
          label="First name"
          name="firstName"
          onChange={(event) => handleFieldChange('firstName', event.target.value)}
          placeholder="John"
          type="text"
          value={profileFields.firstName}
        />
        <TextInputField
          error={errors.lastName}
          id="settings-last-name"
          label="Last name"
          name="lastName"
          onChange={(event) => handleFieldChange('lastName', event.target.value)}
          placeholder="Doe"
          type="text"
          value={profileFields.lastName}
        />
        <div className="field-group settings-field--full">
          <label htmlFor="settings-description">Description<PublicProfileMarker /></label>
          <textarea
            aria-describedby={
              errors.description
                ? 'settings-public-profile-hint settings-description-count settings-description-error'
                : 'settings-public-profile-hint settings-description-count'
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
          <p className="field-hint settings-description-hint">
            <span id="settings-description-count">{profileFields.description.length} / 300</span>
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
          <p className="field-hint public-profile-hint" id="settings-public-profile-hint">
            <PublicProfileMarker />Shown on your public profile.
          </p>
          <ActionButton
            aria-busy={isSubmitting}
            className="settings-save-button"
            disabled={!isDirty || isSubmitting}
            tone="primary"
            type="submit"
          >
            <PendingButtonLabel pending={isSubmitting} pendingLabel="Saving...">
              Save changes
            </PendingButtonLabel>
          </ActionButton>
        </div>
      </form>
    </PagePanel>
  )
}

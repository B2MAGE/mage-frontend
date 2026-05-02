import { useId, useState, type FormEvent } from 'react'
import { FormNotice, SurfaceCard, TextInputField } from '@shared/ui'
import type { PasswordChangeFields, PasswordChangeResult } from '../types'

type PasswordChangeFormProps = {
  authProvider: string
  onSave: (fields: PasswordChangeFields) => Promise<PasswordChangeResult>
}

type PasswordFormValues = PasswordChangeFields & {
  confirmNewPassword: string
}

type PasswordFormErrors = Partial<Record<keyof PasswordFormValues | 'form', string>>

const initialValues: PasswordFormValues = {
  currentPassword: '',
  newPassword: '',
  confirmNewPassword: '',
}

function supportsLocalPassword(authProvider: string) {
  return authProvider === 'LOCAL' || authProvider === 'LOCAL_GOOGLE'
}

function validatePasswordForm(values: PasswordFormValues): PasswordFormErrors {
  const errors: PasswordFormErrors = {}

  if (!values.currentPassword.trim()) {
    errors.currentPassword = 'Current password is required.'
  }

  if (!values.newPassword.trim()) {
    errors.newPassword = 'New password is required.'
  } else if (values.newPassword.length < 8 || values.newPassword.length > 72) {
    errors.newPassword = 'New password must be between 8 and 72 characters.'
  }

  if (!values.confirmNewPassword.trim()) {
    errors.confirmNewPassword = 'Verify your new password.'
  } else if (values.confirmNewPassword !== values.newPassword) {
    errors.confirmNewPassword = 'New passwords must match.'
  }

  return errors
}

export function PasswordChangeForm({ authProvider, onSave }: PasswordChangeFormProps) {
  const [values, setValues] = useState<PasswordFormValues>(initialValues)
  const [errors, setErrors] = useState<PasswordFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const formNoticeId = useId()

  function handleChange(field: keyof PasswordFormValues, value: string) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
    setErrors({})
    setSuccessMessage('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextErrors = validatePasswordForm(values)

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setSuccessMessage('')
      return
    }

    setIsSubmitting(true)
    setErrors({})
    setSuccessMessage('')

    try {
      const result = await onSave({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      })

      if (!result.ok) {
        const currentPasswordError =
          result.details.currentPassword ??
          (result.code === 'INVALID_CURRENT_PASSWORD' ? result.message : undefined)

        setErrors({
          currentPassword: currentPasswordError,
          newPassword: result.details.newPassword,
          form: currentPasswordError ? undefined : result.message,
        })
        return
      }

      setValues(initialValues)
      setSuccessMessage('Password updated.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <SurfaceCard as="section" className="settings-section" tone="soft" aria-label="Password">
      <div className="settings-section__header">
        <h2>Password</h2>
        <p>Change the password used to sign in with this MAGE account.</p>
      </div>

      {!supportsLocalPassword(authProvider) ? (
        <FormNotice tone="note">
          Password changes are managed by Google for this account.
        </FormNotice>
      ) : (
        <form className="settings-fields" noValidate onSubmit={handleSubmit}>
          <TextInputField
            autoComplete="current-password"
            error={errors.currentPassword}
            id="settings-current-password"
            label="Current password"
            name="currentPassword"
            onChange={(event) => handleChange('currentPassword', event.target.value)}
            required
            type="password"
            value={values.currentPassword}
          />
          <TextInputField
            autoComplete="new-password"
            error={errors.newPassword}
            hint="Use 8 to 72 characters."
            id="settings-new-password"
            label="New password"
            name="newPassword"
            onChange={(event) => handleChange('newPassword', event.target.value)}
            required
            type="password"
            value={values.newPassword}
          />
          <TextInputField
            autoComplete="new-password"
            error={errors.confirmNewPassword}
            id="settings-confirm-new-password"
            label="Verify new password"
            name="confirmNewPassword"
            onChange={(event) => handleChange('confirmNewPassword', event.target.value)}
            required
            type="password"
            value={values.confirmNewPassword}
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
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? 'Saving password...' : 'Save password'}
            </button>
          </div>
        </form>
      )}
    </SurfaceCard>
  )
}

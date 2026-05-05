import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { AuthPage, AuthPageHeader, FormNotice, TextInputField } from '@shared/ui'
import { parseApiError } from '@shared/lib'
import { confirmPasswordReset } from './client'
import { useAuth } from './authContext'

type ResetPasswordFormValues = {
  newPassword: string
  confirmNewPassword: string
}

type ResetPasswordFormErrors = Partial<Record<keyof ResetPasswordFormValues | 'form', string>>

type PasswordResetResponse = {
  message?: string
}

const initialValues: ResetPasswordFormValues = {
  newPassword: '',
  confirmNewPassword: '',
}

const fallbackSuccessMessage = 'Password has been reset.'

function validateResetPasswordForm(values: ResetPasswordFormValues): ResetPasswordFormErrors {
  const errors: ResetPasswordFormErrors = {}

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

export function ResetPasswordPage() {
  const { isAuthenticated } = useAuth()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''
  const [values, setValues] = useState<ResetPasswordFormValues>(initialValues)
  const [errors, setErrors] = useState<ResetPasswordFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const formNoticeId = useId()
  const titleId = 'reset-password-title'

  if (isAuthenticated) {
    return <Navigate replace to="/" />
  }

  function handleChange(field: keyof ResetPasswordFormValues, nextValue: string) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: nextValue,
    }))
    setErrors({})
    setSuccessMessage('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!token) {
      setErrors({
        form: 'Password reset link is missing or invalid. Request a new reset link.',
      })
      return
    }

    const nextErrors = validateResetPasswordForm(values)

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setIsSubmitting(true)
    setErrors({})
    setSuccessMessage('')

    try {
      const response = await confirmPasswordReset({
        token,
        newPassword: values.newPassword,
      })

      if (!response.ok) {
        const apiError = await parseApiError(response)
        const backendDetails = apiError?.details ?? {}

        setErrors({
          newPassword: backendDetails.newPassword,
          form:
            backendDetails.newPassword || apiError?.message
              ? apiError?.message
              : 'Password reset is unavailable right now. Please try again in a moment.',
        })
        return
      }

      const payload = (await response.json().catch(() => null)) as PasswordResetResponse | null

      setValues(initialValues)
      setSuccessMessage(payload?.message?.trim() || fallbackSuccessMessage)
    } catch {
      setErrors({
        form: 'Password reset is unavailable right now. Please try again in a moment.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPage titleId={titleId}>
      <AuthPageHeader
        description="Choose a new password for your MAGE account."
        eyebrow="Account Recovery"
        title="Reset password"
        titleId={titleId}
      />

      {!token && !successMessage ? (
        <>
          <FormNotice tone="error">
            Password reset link is missing or invalid. Request a new reset link.
          </FormNotice>
          <p className="auth-footnote">
            <Link className="secondary-link" to="/forgot-password">
              Request a new reset link
            </Link>
          </p>
        </>
      ) : successMessage ? (
        <>
          <FormNotice tone="note">{successMessage}</FormNotice>
          <p className="auth-footnote">
            <Link className="secondary-link" to="/login">
              Back to login
            </Link>
          </p>
        </>
      ) : (
        <form className="auth-form" noValidate onSubmit={handleSubmit}>
          <TextInputField
            autoComplete="new-password"
            error={errors.newPassword}
            hint="Use 8 to 72 characters."
            id="new-password"
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
            id="confirm-new-password"
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

          <button className="demo-link auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Resetting password...' : 'Update password'}
          </button>
        </form>
      )}
    </AuthPage>
  )
}

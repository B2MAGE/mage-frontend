import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { AuthPage, AuthPageHeader, FormNotice, PendingButtonLabel } from '@shared/ui'
import { AuthInput } from './AuthInput'
import './auth.css'
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
      {!token && !successMessage ? (
        <>
          <AuthPageHeader description="This password reset link is missing, invalid, or no longer usable." eyebrow="Account Recovery" title="Reset link unavailable" titleId={titleId} />
          <FormNotice tone="error">Password reset link is missing or invalid. Request a new reset link.</FormNotice>
          <div className="auth-state-actions">
            <Link className="auth-primary-link" to="/forgot-password">Request a new reset link</Link>
            <Link className="auth-secondary-link" to="/login">Back to login</Link>
          </div>
        </>
      ) : successMessage ? (
        <>
          <AuthPageHeader description="Your password has been reset. You can now sign in with the new password." eyebrow="Account Recovery" title="You’re all set." titleId={titleId} />
          <FormNotice tone="note">{successMessage}</FormNotice>
          <div className="auth-state-actions"><Link className="auth-primary-link" to="/login">Back to login</Link></div>
        </>
      ) : (
        <>
          <AuthPageHeader description="Choose a new password for your MAGE account." eyebrow="Account Recovery" title="Reset password" titleId={titleId} />
          {errors.form ? <FormNotice id={formNoticeId} tone="error">{errors.form}</FormNotice> : null}
          <form className="auth-form" noValidate onSubmit={handleSubmit}>
            <AuthInput autoComplete="new-password" error={errors.newPassword} hint="Use 8 to 72 characters." id="new-password" label="New password" name="newPassword" placeholder="Enter new password" onChange={(event) => handleChange('newPassword', event.target.value)} required type="password" value={values.newPassword} />
            <AuthInput autoComplete="new-password" error={errors.confirmNewPassword} id="confirm-new-password" label="Verify new password" name="confirmNewPassword" placeholder="Enter new password again" onChange={(event) => handleChange('confirmNewPassword', event.target.value)} required type="password" value={values.confirmNewPassword} />
            <button aria-busy={isSubmitting} className="demo-link auth-submit" type="submit" disabled={isSubmitting}>
              <PendingButtonLabel pending={isSubmitting} pendingLabel="Updating password...">
                Update password
              </PendingButtonLabel>
            </button>
          </form>
        </>
      )}
    </AuthPage>
  )
}

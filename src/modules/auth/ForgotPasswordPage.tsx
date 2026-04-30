import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { AuthPage, AuthPageHeader, FormNotice, TextInputField } from '@shared/ui'
import { emailPattern, parseApiError } from '@shared/lib'
import { requestPasswordReset } from './client'
import { useAuth } from './authContext'

type ForgotPasswordFormValues = {
  email: string
}

type ForgotPasswordFormErrors = Partial<Record<keyof ForgotPasswordFormValues | 'form', string>>

type ForgotPasswordLocationState = {
  loginEmail?: string
}

type PasswordResetResponse = {
  message?: string
}

const initialValues: ForgotPasswordFormValues = {
  email: '',
}

const fallbackSuccessMessage =
  'If an account with that email exists, a password reset link has been sent.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readForgotPasswordLocationState(state: unknown): ForgotPasswordLocationState {
  if (!isRecord(state)) {
    return {}
  }

  return {
    loginEmail: typeof state.loginEmail === 'string' ? state.loginEmail : undefined,
  }
}

function validateForgotPasswordForm(values: ForgotPasswordFormValues): ForgotPasswordFormErrors {
  const errors: ForgotPasswordFormErrors = {}

  if (!values.email.trim()) {
    errors.email = 'Email is required.'
  } else if (!emailPattern.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  return errors
}

export function ForgotPasswordPage() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const forgotPasswordLocationState = readForgotPasswordLocationState(location.state)
  const [values, setValues] = useState<ForgotPasswordFormValues>(() => ({
    ...initialValues,
    email: forgotPasswordLocationState.loginEmail ?? '',
  }))
  const [errors, setErrors] = useState<ForgotPasswordFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmationMessage, setConfirmationMessage] = useState('')
  const [submittedEmail, setSubmittedEmail] = useState('')

  const formNoticeId = useId()
  const titleId = 'forgot-password-title'

  if (isAuthenticated) {
    return <Navigate replace to="/" />
  }

  function handleChange(nextValue: string) {
    setValues({ email: nextValue })

    setErrors((currentErrors) => {
      if (!currentErrors.email && !currentErrors.form) {
        return currentErrors
      }

      return {
        ...currentErrors,
        email: undefined,
        form: undefined,
      }
    })

    if (confirmationMessage) {
      setConfirmationMessage('')
      setSubmittedEmail('')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedValues = {
      email: values.email.trim(),
    }

    const nextErrors = validateForgotPasswordForm(trimmedValues)

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setIsSubmitting(true)
    setErrors({})

    try {
      const response = await requestPasswordReset(trimmedValues)

      if (!response.ok) {
        const apiError = await parseApiError(response)
        const backendDetails = apiError?.details ?? {}

        setErrors({
          email: backendDetails.email,
          form:
            apiError?.message ??
            'Password reset is unavailable right now. Please try again in a moment.',
        })
        return
      }

      const payload = (await response.json().catch(() => null)) as PasswordResetResponse | null

      setConfirmationMessage(payload?.message?.trim() || fallbackSuccessMessage)
      setSubmittedEmail(trimmedValues.email)
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
        description="Enter your email address and MAGE will start the password recovery process."
        eyebrow="Account Recovery"
        title="Forgot password"
        titleId={titleId}
      />

      {confirmationMessage ? (
        <>
          <FormNotice tone="note">{confirmationMessage}</FormNotice>
          <p className="auth-footnote">
            If the address is registered, use the reset link from that recovery message to continue.
          </p>
          <p className="auth-footnote">
            Sent to: <strong>{submittedEmail}</strong>
          </p>
          <p className="auth-footnote">
            <Link className="secondary-link" to="/login">
              Back to login
            </Link>
          </p>
        </>
      ) : (
        <>
          <form className="auth-form" noValidate onSubmit={handleSubmit}>
            <TextInputField
              autoComplete="email"
              error={errors.email}
              id="email"
              label="Email"
              name="email"
              onChange={(event) => handleChange(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={values.email}
            />

            {errors.form ? (
              <FormNotice id={formNoticeId} tone="error">
                {errors.form}
              </FormNotice>
            ) : null}

            <button className="demo-link auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Sending reset link...' : 'Send reset link'}
            </button>
          </form>

          <p className="auth-footnote">
            Remembered your password?{' '}
            <Link className="secondary-link" to="/login">
              Back to login
            </Link>
          </p>
        </>
      )}
    </AuthPage>
  )
}

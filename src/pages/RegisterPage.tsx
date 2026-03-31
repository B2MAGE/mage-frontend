import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { buildApiUrl } from '../lib/api'

type RegistrationFormValues = {
  displayName: string
  email: string
  password: string
}

type RegistrationFormErrors = Partial<Record<keyof RegistrationFormValues | 'form', string>>

type RegistrationResponse = {
  userId?: number
  email?: string
  displayName?: string
  authProvider?: string
  created?: boolean
}

type ApiErrorResponse = {
  code?: string
  message?: string
  details?: Record<string, string>
}

const initialValues: RegistrationFormValues = {
  displayName: '',
  email: '',
  password: '',
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateRegistrationForm(values: RegistrationFormValues): RegistrationFormErrors {
  const errors: RegistrationFormErrors = {}

  if (!values.displayName.trim()) {
    errors.displayName = 'Display name is required.'
  } else if (values.displayName.trim().length < 2) {
    errors.displayName = 'Display name must be at least 2 characters.'
  }

  if (!values.email.trim()) {
    errors.email = 'Email is required.'
  } else if (!emailPattern.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  if (!values.password) {
    errors.password = 'Password is required.'
  } else if (values.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.'
  }

  return errors
}

async function parseApiError(response: Response) {
  try {
    const payload = (await response.json()) as ApiErrorResponse
    return payload
  } catch {
    return null
  }
}

export function RegisterPage() {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<RegistrationFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [successEmail, setSuccessEmail] = useState('')

  const formErrorId = useId()

  const isSubmitDisabled = isSubmitting || isSuccess

  function handleChange(field: keyof RegistrationFormValues, nextValue: string) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: nextValue,
    }))

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

    const trimmedValues = {
      displayName: values.displayName.trim(),
      email: values.email.trim(),
      password: values.password,
    }

    const nextErrors = validateRegistrationForm(trimmedValues)

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setIsSubmitting(true)
    setErrors({})

    try {
      const response = await fetch(buildApiUrl('/auth/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(trimmedValues),
      })

      if (!response.ok) {
        const apiError = await parseApiError(response)
        const backendDetails = apiError?.details ?? {}
        const conflictMessage =
          response.status === 409
            ? apiError?.message ?? 'An account already exists for that email address.'
            : undefined

        setErrors({
          displayName: backendDetails.displayName,
          email: backendDetails.email,
          password: backendDetails.password,
          form:
            conflictMessage ??
            apiError?.message ??
            'Registration failed. Please review your information and try again.',
        })
        return
      }

      const payload = (await response.json().catch(() => null)) as RegistrationResponse | null
      setIsSuccess(true)
      setSuccessEmail(payload?.email ?? trimmedValues.email)
      setValues(initialValues)
    } catch {
      setErrors({
        form: 'Registration is unavailable right now. Please try again in a moment.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="register-shell">
      <section className="register-hero">
        <div className="register-badge">Epic E2</div>
        <h1>Build your MAGE account.</h1>
        <p className="register-copy">
          Start with a clean registration flow for new users, then expand it as the
          authentication workstream lands.
        </p>
        <div className="register-highlights" aria-label="Registration page highlights">
          <span>Email, password, and display name</span>
          <span>Client-side validation</span>
          <span>Backend-ready submit flow</span>
        </div>
      </section>

      <section className="register-panel" aria-labelledby="register-title">
        {isSuccess ? (
          <div className="register-success" role="status" aria-live="polite">
            <div className="eyebrow">Registration Complete</div>
            <h2 id="register-title">Your account request was submitted.</h2>
            <p className="register-copy">
              {successEmail
                ? `The registration for ${successEmail} completed successfully.`
                : 'Your registration completed successfully.'}
            </p>
            <div className="register-actions">
              <Link className="demo-link" to="/login">
                Continue to Login
              </Link>
              <Link className="secondary-link" to="/">
                Back to Home
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="eyebrow">Create Account</div>
            <h2 id="register-title">Register</h2>
            <p className="register-copy">
              Use your email address to create a local account for the MAGE platform.
            </p>

            <form className="register-form" noValidate onSubmit={handleSubmit}>
              <div className="field-group">
                <label htmlFor="displayName">Display name</label>
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  autoComplete="nickname"
                  required
                  minLength={2}
                  value={values.displayName}
                  onChange={(event) => handleChange('displayName', event.target.value)}
                  aria-invalid={Boolean(errors.displayName)}
                  aria-describedby={errors.displayName ? 'displayName-error' : undefined}
                  placeholder="Mir Ahnaf Ali"
                />
                {errors.displayName ? (
                  <p className="field-error" id="displayName-error" role="alert">
                    {errors.displayName}
                  </p>
                ) : null}
              </div>

              <div className="field-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={values.email}
                  onChange={(event) => handleChange('email', event.target.value)}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  placeholder="you@example.com"
                />
                {errors.email ? (
                  <p className="field-error" id="email-error" role="alert">
                    {errors.email}
                  </p>
                ) : null}
              </div>

              <div className="field-group">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={values.password}
                  onChange={(event) => handleChange('password', event.target.value)}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  placeholder="At least 8 characters"
                />
                {errors.password ? (
                  <p className="field-error" id="password-error" role="alert">
                    {errors.password}
                  </p>
                ) : null}
              </div>

              {errors.form ? (
                <div className="form-alert" id={formErrorId} role="alert">
                  {errors.form}
                </div>
              ) : null}

              <button className="demo-link register-submit" type="submit" disabled={isSubmitDisabled}>
                {isSubmitting ? 'Creating account...' : 'Create account'}
              </button>
            </form>

            <p className="register-footnote">
              Already have an account?{' '}
              <Link className="secondary-link" to="/login">
                Go to login
              </Link>
            </p>
          </>
        )}
      </section>
    </main>
  )
}

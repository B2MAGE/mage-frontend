import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

type LoginFormValues = {
  email: string
  password: string
}

type LoginFormErrors = Partial<Record<keyof LoginFormValues | 'form', string>>

type LoginResponse = {
  userId?: number
  email?: string
  displayName?: string
  authProvider?: string
  accessToken?: string
}

type ApiErrorResponse = {
  code?: string
  message?: string
  details?: Record<string, string>
}

const initialValues: LoginFormValues = {
  email: '',
  password: '',
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateLoginForm(values: LoginFormValues): LoginFormErrors {
  const errors: LoginFormErrors = {}

  if (!values.email.trim()) {
    errors.email = 'Email is required.'
  } else if (!emailPattern.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  if (!values.password) {
    errors.password = 'Password is required.'
  }

  return errors
}

function buildLoginUrl() {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

  if (!baseUrl) {
    return '/auth/login'
  }

  return `${baseUrl.replace(/\/+$/, '')}/auth/login`
}

async function parseApiError(response: Response) {
  try {
    const payload = (await response.json()) as ApiErrorResponse
    return payload
  } catch {
    return null
  }
}

export function LoginPage() {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [successEmail, setSuccessEmail] = useState('')

  const formNoticeId = useId()

  const isSubmitDisabled = isSubmitting || isSuccess

  function handleChange(field: keyof LoginFormValues, nextValue: string) {
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
      email: values.email.trim(),
      password: values.password,
    }

    const nextErrors = validateLoginForm(trimmedValues)

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setIsSubmitting(true)
    setErrors({})

    try {
      const response = await fetch(buildLoginUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(trimmedValues),
      })

      if (!response.ok) {
        const apiError = await parseApiError(response)
        const backendDetails = apiError?.details ?? {}
        const invalidCredentialsMessage =
          response.status === 401
            ? apiError?.message ?? 'Email or password is incorrect.'
            : undefined

        setErrors({
          email: backendDetails.email,
          password: backendDetails.password,
          form:
            invalidCredentialsMessage ??
            apiError?.message ??
            'Login failed. Please review your information and try again.',
        })
        return
      }

      const payload = (await response.json().catch(() => null)) as LoginResponse | null
      setIsSuccess(true)
      setSuccessEmail(payload?.email ?? trimmedValues.email)
      setValues(initialValues)
    } catch {
      setErrors({
        form: 'Login is unavailable right now. Please try again in a moment.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="register-shell login-shell">
      <section className="register-hero login-hero">
        <div className="register-badge">Epic E2</div>
        <h1>Welcome back to MAGE.</h1>
        <p className="register-copy">
          Sign in with your email and password to continue into the platform once the
          authentication flow is fully connected.
        </p>
        <div className="register-highlights" aria-label="Login page highlights">
          <span>Email and password inputs</span>
          <span>Keyboard-friendly form</span>
          <span>Client-side validation</span>
        </div>
      </section>

      <section className="register-panel" aria-labelledby="login-title">
        {isSuccess ? (
          <div className="register-success" role="status" aria-live="polite">
            <div className="eyebrow">Login Complete</div>
            <h2 id="login-title">Your credentials were accepted.</h2>
            <p className="register-copy">
              {successEmail
                ? `The login for ${successEmail} completed successfully.`
                : 'Your login completed successfully.'}
            </p>
            <p className="register-copy">
              The backend issued an access token for this account. Protected app navigation can
              build on that in the next step.
            </p>
            <div className="register-actions">
              <Link className="demo-link" to="/">
                Back to Home
              </Link>
              <Link className="secondary-link" to="/register">
                Create another account
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="eyebrow">Sign In</div>
            <h2 id="login-title">Login</h2>
            <p className="register-copy">
              Enter your credentials to access your account.
            </p>

            <form className="register-form" noValidate onSubmit={handleSubmit}>
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
                  aria-describedby={errors.email ? 'login-email-error' : undefined}
                  placeholder="you@example.com"
                />
                {errors.email ? (
                  <p className="field-error" id="login-email-error" role="alert">
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
                  autoComplete="current-password"
                  required
                  value={values.password}
                  onChange={(event) => handleChange('password', event.target.value)}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'login-password-error' : 'login-password-hint'}
                  placeholder="Enter your password"
                />
                <p className="field-hint" id="login-password-hint">
                  Use the same password you created during registration.
                </p>
                {errors.password ? (
                  <p className="field-error" id="login-password-error" role="alert">
                    {errors.password}
                  </p>
                ) : null}
              </div>

              {errors.form ? (
                <div className="form-alert" id={formNoticeId} role="alert">
                  {errors.form}
                </div>
              ) : null}

              <button className="demo-link register-submit" type="submit" disabled={isSubmitDisabled}>
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <p className="register-footnote">
              Need an account?{' '}
              <Link className="secondary-link" to="/register">
                Create one here
              </Link>
            </p>
          </>
        )}
      </section>
    </main>
  )
}

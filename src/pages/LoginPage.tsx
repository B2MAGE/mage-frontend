import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthPage, AuthPageHeader } from '../components/AuthPage'
import { useAuth, type AuthenticatedUser } from '../auth/AuthContext'
import { buildApiUrl } from '../lib/api'
import { emailPattern, parseApiError } from '../lib/authForm'

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

const initialValues: LoginFormValues = {
  email: '',
  password: '',
}

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

export function LoginPage() {
  const {
    accessToken,
    completeLoginSession,
    isAuthenticated,
    isRestoringSession,
    user,
  } = useAuth()
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formNoticeId = useId()
  const titleId = 'login-title'

  const isSubmitDisabled = isSubmitting || isAuthenticated

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
      const response = await fetch(buildApiUrl('/auth/login'), {
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
      const issuedAccessToken = payload?.accessToken?.trim()

      if (!issuedAccessToken) {
        setErrors({
          form: 'Login did not return an access token. Please try again.',
        })
        return
      }

      const authenticatedUser: AuthenticatedUser = {
        userId: payload?.userId ?? null,
        email: payload?.email ?? trimmedValues.email,
        displayName: payload?.displayName ?? payload?.email ?? trimmedValues.email,
        authProvider: payload?.authProvider ?? 'LOCAL',
      }

      completeLoginSession({
        accessToken: issuedAccessToken,
        user: authenticatedUser,
      })
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
    <AuthPage titleId={titleId}>
        {isAuthenticated && user ? (
          <div className="auth-state" role="status" aria-live="polite">
            <AuthPageHeader
              description={
                user.email
                  ? `The login for ${user.email} completed successfully.`
                  : 'Your login completed successfully.'
              }
              eyebrow="Login Complete"
              title="Your session is active."
              titleId={titleId}
            />
            <p className="auth-copy">
              The shared frontend auth session has stored your access token and can restore this
              user across refreshes.
            </p>
            <div className="auth-actions">
              <Link className="demo-link" to="/">
                Back to Home
              </Link>
              <Link className="secondary-link" to="/register">
                Create another account
              </Link>
            </div>
          </div>
        ) : isRestoringSession && accessToken ? (
          <div className="auth-state" role="status" aria-live="polite">
            <AuthPageHeader
              description="MAGE found a stored access token and is verifying it with the backend."
              eyebrow="Restoring Session"
              title="Checking your saved login."
              titleId={titleId}
            />
          </div>
        ) : (
          <>
            <AuthPageHeader
              description="Enter your credentials to access your account."
              eyebrow="Sign In"
              title="Login"
              titleId={titleId}
            />

            <form className="auth-form" noValidate onSubmit={handleSubmit}>
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
                  aria-describedby={
                    errors.password ? 'login-password-error' : 'login-password-hint'
                  }
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

              <button
                className="demo-link auth-submit"
                type="submit"
                disabled={isSubmitDisabled}
              >
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <p className="auth-footnote">
              Need an account?{' '}
              <Link className="secondary-link" to="/register">
                Create one here
              </Link>
            </p>
          </>
        )}
    </AuthPage>
  )
}

import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthPage, AuthPageHeader } from '@components/AuthPage'
import { emailPattern, parseApiError } from '@shared/lib'
import { FormNotice, TextInputField } from '@shared/ui'
import { loginWithCredentials } from './client'
import { useAuth } from './authContext'
import type { AuthenticatedUser } from './types'

type LoginFormValues = {
  email: string
  password: string
}

type LoginFormErrors = Partial<Record<keyof LoginFormValues | 'form', string>>

type LoginResponse = {
  userId?: number
  email?: string
  firstName?: string
  lastName?: string
  displayName?: string
  authProvider?: string
  accessToken?: string
}

type LoginLocationState = {
  registrationEmail?: string
  registrationNotice?: string
}

const initialValues: LoginFormValues = {
  email: '',
  password: '',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readLoginLocationState(state: unknown): LoginLocationState {
  if (!isRecord(state)) {
    return {}
  }

  return {
    registrationEmail:
      typeof state.registrationEmail === 'string' ? state.registrationEmail : undefined,
    registrationNotice:
      typeof state.registrationNotice === 'string' ? state.registrationNotice : undefined,
  }
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
  const { accessToken, completeLoginSession, isAuthenticated, isRestoringSession } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const loginLocationState = readLoginLocationState(location.state)
  const [values, setValues] = useState<LoginFormValues>(() => ({
    ...initialValues,
    email: loginLocationState.registrationEmail ?? '',
  }))
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resetPasswordNotice, setResetPasswordNotice] = useState('')
  const [registrationNotice, setRegistrationNotice] = useState(
    loginLocationState.registrationNotice ?? '',
  )

  const formNoticeId = useId()
  const titleId = 'login-title'

  const isSubmitDisabled = isSubmitting

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

    if (resetPasswordNotice) {
      setResetPasswordNotice('')
    }

    if (registrationNotice) {
      setRegistrationNotice('')
    }
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
      const response = await loginWithCredentials(trimmedValues)

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
        firstName: payload?.firstName,
        lastName: payload?.lastName,
        displayName: payload?.displayName ?? payload?.email ?? trimmedValues.email,
        authProvider: payload?.authProvider ?? 'LOCAL',
      }

      completeLoginSession({
        accessToken: issuedAccessToken,
        user: authenticatedUser,
      })
      setValues(initialValues)
      navigate('/', { replace: true })
    } catch {
      setErrors({
        form: 'Login is unavailable right now. Please try again in a moment.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isAuthenticated) {
    return <Navigate replace to="/" />
  }

  return (
    <AuthPage titleId={titleId}>
      {isRestoringSession && accessToken ? (
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
            <TextInputField
              autoComplete="email"
              error={errors.email}
              id="email"
              label="Email"
              name="email"
              onChange={(event) => handleChange('email', event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={values.email}
            />
            <TextInputField
              autoComplete="current-password"
              error={errors.password}
              hint="Use the same password you created during registration."
              id="password"
              label="Password"
              name="password"
              onChange={(event) => handleChange('password', event.target.value)}
              placeholder="Enter your password"
              required
              type="password"
              value={values.password}
            />

            {errors.form ? (
              <FormNotice id={formNoticeId} tone="error">
                {errors.form}
              </FormNotice>
            ) : null}

            {registrationNotice ? <FormNotice tone="note">{registrationNotice}</FormNotice> : null}

            {resetPasswordNotice ? <FormNotice tone="note">{resetPasswordNotice}</FormNotice> : null}

            <button className="demo-link auth-submit" type="submit" disabled={isSubmitDisabled}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="auth-footnote">
            Forgot your password?{' '}
            <button
              className="auth-link-button"
              type="button"
              onClick={() =>
                setResetPasswordNotice(
                  'Password reset is not connected yet, but this option is now available in the frontend.',
                )
              }
            >
              Reset it here
            </button>
          </p>

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

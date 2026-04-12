import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthPage, AuthPageHeader } from '../components/AuthPage'
import { buildApiUrl } from '../lib/api'
import { emailPattern, parseApiError } from '../lib/authForm'

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

const initialValues: RegistrationFormValues = {
  displayName: '',
  email: '',
  password: '',
}

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

export function RegisterPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<RegistrationFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formErrorId = useId()
  const titleId = 'register-title'

  const isSubmitDisabled = isSubmitting

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
      setValues(initialValues)
      navigate('/login', {
        replace: true,
        state: {
          registrationEmail: payload?.email ?? trimmedValues.email,
          registrationNotice: 'Account created. Sign in to open your profile.',
        },
      })
    } catch {
      setErrors({
        form: 'Registration is unavailable right now. Please try again in a moment.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPage titleId={titleId}>
        <>
          <AuthPageHeader
            description="Use your email address to create a local account for the MAGE platform."
            eyebrow="Create Account"
            title="Register"
            titleId={titleId}
          />

          <form className="auth-form" noValidate onSubmit={handleSubmit}>
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

            <button className="demo-link auth-submit" type="submit" disabled={isSubmitDisabled}>
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="auth-footnote">
            Already have an account?{' '}
            <Link className="secondary-link" to="/login">
              Go to login
            </Link>
          </p>
        </>
    </AuthPage>
  )
}

import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthPage, AuthPageHeader } from '@components/AuthPage'
import { buildApiUrl } from '@lib/api'
import { emailPattern, parseApiError } from '@shared/lib'
import { FormNotice, TextInputField } from '@shared/ui'

type RegistrationFormValues = {
  firstName: string
  lastName: string
  displayName: string
  email: string
  password: string
}

type RegistrationFormErrors = Partial<Record<keyof RegistrationFormValues | 'form', string>>

type RegistrationResponse = {
  userId?: number
  email?: string
  firstName?: string
  lastName?: string
  displayName?: string
  authProvider?: string
  created?: boolean
}

const initialValues: RegistrationFormValues = {
  firstName:'',
  lastName: '',
  displayName: '',
  email: '',
  password: '',
}

const DEFAULT_REGISTRATION_FIRST_NAME = 'NoName'
const DEFAULT_REGISTRATION_LAST_NAME = 'NoName'

function validateRegistrationForm(values: RegistrationFormValues): RegistrationFormErrors {
  const errors: RegistrationFormErrors = {}

  if (!values.firstName.trim()) {
    errors.firstName = 'First name is required.'
  } else if (values.firstName.trim().length < 2) {
    errors.firstName = 'First name must be at least 2 characters.'
  }

  if (!values.lastName.trim()) {
    errors.lastName = 'Last name is required.'
  } else if (values.lastName.trim().length < 2) {
    errors.lastName = 'Last name must be at least 2 characters.'
  }

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
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
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
      const response = await fetch(buildApiUrl('/api/auth/register'), {
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
            <TextInputField
              autoComplete="first-name"
              error={errors.firstName}
              id="firstName"
              label="First name"
              minLength={2}
              name="firstName"
              onChange={(event) => handleChange('firstName', event.target.value)}
              placeholder="John"
              required
              type="text"
              value={values.firstName}
            />
            <TextInputField
              autoComplete="last-name"
              error={errors.lastName}
              id="lastName"
              label="Last name"
              minLength={2}
              name="lastName"
              onChange={(event) => handleChange('lastName', event.target.value)}
              placeholder="Doe"
              required
              type="text"
              value={values.lastName}
            />
            <TextInputField
              autoComplete="nickname"
              error={errors.displayName}
              id="displayName"
              label="Display name"
              minLength={2}
              name="displayName"
              onChange={(event) => handleChange('displayName', event.target.value)}
              placeholder="Mir Ahnaf Ali"
              required
              type="text"
              value={values.displayName}
            />
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
              autoComplete="new-password"
              error={errors.password}
              id="password"
              label="Password"
              minLength={8}
              name="password"
              onChange={(event) => handleChange('password', event.target.value)}
              placeholder="At least 8 characters"
              required
              type="password"
              value={values.password}
            />

            {errors.form ? (
              <FormNotice id={formErrorId} tone="error">
                {errors.form}
              </FormNotice>
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

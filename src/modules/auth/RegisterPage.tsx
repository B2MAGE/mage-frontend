import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthPage, AuthPageHeader, FormNotice, PendingButtonLabel, ProfileIdentityPreview, PublicProfileMarker, TextInputField } from '@shared/ui'
import { emailPattern, parseApiError } from '@shared/lib'
import { HandleInputField } from './HandleInputField'
import './auth.css'
import { registerLocalAccount } from './client'
import { formatHandleInput, HANDLE_FORMAT_ERROR, validateHandleInput } from './handle'

type RegistrationFormValues = {
  firstName: string
  lastName: string
  displayName: string
  handle: string
  email: string
  password: string
  confirmPassword: string
}

type RegistrationFormErrors = Partial<Record<keyof RegistrationFormValues | 'form', string>>

type RegistrationResponse = {
  userId?: number
  email?: string
  firstName?: string
  lastName?: string
  displayName?: string
  handle?: string
  description?: string | null
  authProvider?: string
  created?: boolean
}

const initialValues: RegistrationFormValues = {
  firstName: '',
  lastName: '',
  displayName: '',
  handle: '',
  email: '',
  password: '',
  confirmPassword: '',
}

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

  const handleError = validateHandleInput(values.handle)

  if (handleError) {
    errors.handle = handleError === HANDLE_FORMAT_ERROR
      ? 'Use 3–30 letters, numbers, or underscores, starting with a letter.'
      : handleError
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

  if (!values.confirmPassword) {
    errors.confirmPassword = 'Confirm your password.'
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Passwords must match.'
  }

  return errors
}

export function RegisterPage() {
  const navigate = useNavigate()
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<RegistrationFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false)

  const formErrorId = useId()
  const titleId = 'register-title'

  const isSubmitDisabled = isSubmitting

  function handleChange(field: keyof RegistrationFormValues, nextValue: string) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: nextValue,
    }))

    setErrors((currentErrors) => {
      if (!currentErrors[field] && !currentErrors.form && !(field === 'password' && currentErrors.confirmPassword)) {
        return currentErrors
      }

      return {
        ...currentErrors,
        confirmPassword: field === 'password' ? undefined : currentErrors.confirmPassword,
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
      handle: formatHandleInput(values.handle),
      email: values.email.trim(),
      password: values.password,
    }

    const nextErrors = validateRegistrationForm({
      ...trimmedValues,
      confirmPassword: values.confirmPassword,
    })

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    setIsSubmitting(true)
    setErrors({})

    try {
      const response = await registerLocalAccount(trimmedValues)

      if (!response.ok) {
        const apiError = await parseApiError(response)
        const backendDetails = apiError?.details ?? {}
        const conflictMessage =
          response.status === 409
            ? apiError?.message ?? 'That email address or handle is already in use.'
            : undefined

        setErrors({
          firstName: backendDetails.firstName,
          lastName: backendDetails.lastName,
          displayName: backendDetails.displayName,
          handle: backendDetails.handle,
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
    <AuthPage titleId={titleId} className="auth-page--registration">
      <>
        <AuthPageHeader
          description="Create your account and choose how you appear on MAGE."
          eyebrow="Create Account"
          title="Register"
          titleId={titleId}
        />

        {errors.form ? (
          <FormNotice id={formErrorId} tone="error">
            {errors.form}
          </FormNotice>
        ) : null}

        <form className="auth-form registration-form" noValidate onSubmit={handleSubmit}>
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

          <ProfileIdentityPreview displayName={values.displayName} handle={values.handle} />

          <TextInputField
            aria-describedby="register-public-profile-hint"
            autoComplete="nickname"
            error={errors.displayName}
            id="displayName"
            label="Display name"
            labelSuffix={<PublicProfileMarker />}
            minLength={2}
            name="displayName"
            onChange={(event) => handleChange('displayName', event.target.value)}
            placeholder="John"
            required
            type="text"
            value={values.displayName}
          />
          <HandleInputField
            aria-describedby="register-public-profile-hint"
            error={errors.handle}
            hint="Use 3–30 letters, numbers, or underscores, starting with a letter."
            id="handle"
            label="Handle"
            labelSuffix={<PublicProfileMarker />}
            onValueChange={(value) => handleChange('handle', value)}
            placeholder="jdoe"
            required
            value={values.handle}
          />
          <div className="auth-name-grid">
            <TextInputField
              autoComplete="given-name"
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
              autoComplete="family-name"
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
          </div>
          <p className="field-hint public-profile-hint" id="register-public-profile-hint">
            <PublicProfileMarker />Shown on your public profile.
          </p>
          <TextInputField
            autoComplete="new-password"
            error={errors.password}
            id="password"
            label="Password"
            hint="Use at least 8 characters."
            minLength={8}
            name="password"
            onChange={(event) => handleChange('password', event.target.value)}
            placeholder="At least 8 characters"
            required
            type={passwordVisible ? 'text' : 'password'}
            value={values.password}
            inputAction={
              <button
                className="registration-show-password"
                type="button"
                aria-controls="password"
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? 'Hide' : 'Show'}
              </button>
            }
          />
          <TextInputField
            autoComplete="new-password"
            error={errors.confirmPassword}
            id="confirmPassword"
            label="Confirm password"
            name="confirmPassword"
            onChange={(event) => handleChange('confirmPassword', event.target.value)}
            placeholder="Enter your password again"
            required
            type={confirmPasswordVisible ? 'text' : 'password'}
            value={values.confirmPassword}
            inputAction={
              <button
                className="registration-show-password"
                type="button"
                aria-controls="confirmPassword"
                aria-label={confirmPasswordVisible ? 'Hide password confirmation' : 'Show password confirmation'}
                aria-pressed={confirmPasswordVisible}
                onClick={() => setConfirmPasswordVisible((visible) => !visible)}
              >
                {confirmPasswordVisible ? 'Hide' : 'Show'}
              </button>
            }
          />

          <button aria-busy={isSubmitting} className="demo-link auth-submit" type="submit" disabled={isSubmitDisabled}>
            <PendingButtonLabel pending={isSubmitting} pendingLabel="Creating account...">
              Create account
            </PendingButtonLabel>
          </button>
        </form>

        <div className="auth-divider" />
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

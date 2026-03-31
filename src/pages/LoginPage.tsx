import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

type LoginFormValues = {
  email: string
  password: string
}

type LoginFormErrors = Partial<Record<keyof LoginFormValues | 'form', string>>

const initialValues: LoginFormValues = {
  email: '',
  password: '',
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Keep validation local to the page for now so the UI story is testable
// even before the backend login endpoint is fully connected.
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
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [notice, setNotice] = useState('')

  const formNoticeId = useId()

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

    if (notice) {
      setNotice('')
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedValues = {
      email: values.email.trim(),
      password: values.password,
    }

    const nextErrors = validateLoginForm(trimmedValues)

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setNotice('')
      return
    }

    setErrors({})
    // This success note marks the current frontend milestone without pretending
    // the authentication flow is already wired to the backend.
    setNotice('Validation passed. Backend login integration can be connected in the next step.')
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

          {notice ? (
            <div className="form-note" id={formNoticeId} role="status">
              {notice}
            </div>
          ) : null}

          <button className="demo-link register-submit" type="submit">
            Sign in
          </button>
        </form>

        <p className="register-footnote">
          Need an account?{' '}
          <Link className="secondary-link" to="/register">
            Create one here
          </Link>
        </p>
      </section>
    </main>
  )
}

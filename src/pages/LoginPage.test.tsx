import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AUTH_SESSION_STORAGE_KEY, AuthProvider } from '../auth/AuthContext'
import { buildApiUrl } from '../lib/api'
import { LoginPage } from './LoginPage'

type RenderLoginPageOptions = {
  locationState?: {
    registrationEmail?: string
    registrationNotice?: string
  }
}

function renderLoginPage(options: RenderLoginPageOptions = {}) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/login',
          state: options.locationState,
        },
      ]}
    >
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/settings" element={<div>Settings page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^email$/i), ' user@example.com ')
  await user.type(screen.getByLabelText(/password/i), 'secret-value')
}

describe('LoginPage', () => {
  it('renders email and password inputs', () => {
    renderLoginPage()

    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows required-field validation errors', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()

    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('submits trimmed values, disables the button while loading, and routes to settings', async () => {
    let resolveResponse: ((value: Response) => void) | undefined
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )
    const user = userEvent.setup()

    renderLoginPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(fetchSpy).toHaveBeenCalledWith(
      buildApiUrl('/auth/login'),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'secret-value',
        }),
      }),
    )
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()

    resolveResponse?.(
      new Response(
        JSON.stringify({
          userId: 14,
          email: 'user@example.com',
          displayName: 'Existing User',
          authProvider: 'LOCAL',
          accessToken: 'issued-login-token',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    expect(await screen.findByText('Settings page')).toBeInTheDocument()
    expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toContain('issued-login-token')
  })

  it('prefills the email and shows the registration handoff notice', () => {
    renderLoginPage({
      locationState: {
        registrationEmail: 'new-user@example.com',
        registrationNotice: 'Account created. Sign in to open your profile.',
      },
    })

    expect(screen.getByLabelText(/^email$/i)).toHaveValue('new-user@example.com')
    expect(
      screen.getByText('Account created. Sign in to open your profile.'),
    ).toBeInTheDocument()
  })

  it('shows backend invalid-credential errors clearly to the user', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Email or password is incorrect.',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )
    const user = userEvent.setup()

    renderLoginPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(
      await screen.findByText('Email or password is incorrect.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled()
  })

  it('maps backend validation details onto the form fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Request validation failed.',
          details: {
            email: 'email must not be blank',
            password: 'password must not be blank',
          },
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )
    const user = userEvent.setup()

    renderLoginPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('email must not be blank')).toBeInTheDocument()
    expect(screen.getByText('password must not be blank')).toBeInTheDocument()
  })
})

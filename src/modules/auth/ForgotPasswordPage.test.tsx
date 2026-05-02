import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@shared/lib'
import { AuthProvider } from '@auth'
import { ForgotPasswordPage } from './ForgotPasswordPage'

function renderForgotPasswordPage(initialState?: { loginEmail?: string }) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/forgot-password',
          state: initialState,
        },
      ]}
    >
      <AuthProvider>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/login" element={<div>Login page</div>} />
          <Route path="/" element={<div>Home page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('ForgotPasswordPage', () => {
  it('renders the recovery form and prefills email from login state', () => {
    renderForgotPasswordPage({ loginEmail: 'artist@example.com' })

    expect(screen.getByRole('heading', { name: /forgot password/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('artist@example.com')
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })

  it('shows client-side validation for blank and malformed email values', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()

    renderForgotPasswordPage()

    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByText('Email is required.')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^email$/i), 'not-an-email')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('submits the email and shows a neutral success state', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'If an account with that email exists, a password reset link has been sent.',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )
    const user = userEvent.setup()

    renderForgotPasswordPage()

    await user.type(screen.getByLabelText(/^email$/i), ' user@example.com ')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(fetchSpy).toHaveBeenCalledWith(
      buildApiUrl('/auth/reset-password/request'),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'user@example.com',
        }),
      }),
    )

    expect(
      await screen.findByText(
        'If an account with that email exists, a password reset link has been sent.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Sent to:')).toBeInTheDocument()
    expect(screen.getByText('user@example.com')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to login/i })).toBeInTheDocument()
  })

  it('surfaces backend validation details when the request is rejected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Request validation failed.',
          details: {
            email: 'email must be a well-formed email address',
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

    renderForgotPasswordPage()

    await user.type(screen.getByLabelText(/^email$/i), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(
      await screen.findByText('email must be a well-formed email address'),
    ).toBeInTheDocument()
  })

  it('shows a generic failure notice when the request throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    const user = userEvent.setup()

    renderForgotPasswordPage()

    await user.type(screen.getByLabelText(/^email$/i), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(
      await screen.findByText(
        'Password reset is unavailable right now. Please try again in a moment.',
      ),
    ).toBeInTheDocument()
  })
})

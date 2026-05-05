import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@shared/lib'
import { AuthProvider } from '@auth'
import { ResetPasswordPage } from './ResetPasswordPage'

function renderResetPasswordPage(path = '/reset-password?token=reset-token') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/forgot-password" element={<div>Forgot password page</div>} />
          <Route path="/login" element={<div>Login page</div>} />
          <Route path="/" element={<div>Home page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('ResetPasswordPage', () => {
  it('renders a missing-token error when the link has no token', () => {
    renderResetPasswordPage('/reset-password')

    expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument()
    expect(
      screen.getByText('Password reset link is missing or invalid. Request a new reset link.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /request a new reset link/i })).toBeInTheDocument()
  })

  it('shows client-side validation for invalid password values', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()

    renderResetPasswordPage()

    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText('New password is required.')).toBeInTheDocument()
    expect(screen.getByText('Verify your new password.')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^new password$/i), 'new-password')
    await user.type(screen.getByLabelText(/^verify new password$/i), 'different-password')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText('New passwords must match.')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('submits a valid token and new password', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Password has been reset.' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )
    const user = userEvent.setup()

    renderResetPasswordPage()

    await user.type(screen.getByLabelText(/^new password$/i), 'new-password')
    await user.type(screen.getByLabelText(/^verify new password$/i), 'new-password')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(fetchSpy).toHaveBeenCalledWith(
      buildApiUrl('/auth/reset-password/confirm'),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: 'reset-token',
          newPassword: 'new-password',
        }),
      }),
    )

    expect(await screen.findByText('Password has been reset.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to login/i })).toBeInTheDocument()
  })

  it('surfaces an invalid or expired token response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'INVALID_PASSWORD_RESET_TOKEN',
          message: 'Password reset link is invalid or expired.',
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

    renderResetPasswordPage('/reset-password?token=expired-token')

    await user.type(screen.getByLabelText(/^new password$/i), 'new-password')
    await user.type(screen.getByLabelText(/^verify new password$/i), 'new-password')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText('Password reset link is invalid or expired.')).toBeInTheDocument()
  })

  it('surfaces backend password validation details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Request validation failed.',
          details: {
            newPassword: 'newPassword must be between 8 and 72 characters',
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

    renderResetPasswordPage()

    await user.type(screen.getByLabelText(/^new password$/i), 'new-password')
    await user.type(screen.getByLabelText(/^verify new password$/i), 'new-password')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(
      await screen.findByText('newPassword must be between 8 and 72 characters'),
    ).toBeInTheDocument()
  })
})

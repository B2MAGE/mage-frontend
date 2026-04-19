import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'

let authState = {
  accessToken: null as string | null,
  authenticatedFetch: vi.fn(),
  completeLoginSession: vi.fn(),
  isAuthenticated: false,
  isRestoringSession: false,
  logout: vi.fn(),
  updateAuthenticatedUser: vi.fn(),
  user: null as null | {
    authProvider: string
    displayName: string
    email: string
    firstName?: string
    lastName?: string
    userId: number | null
  },
}

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => authState,
}))

describe('SettingsPage', () => {
  beforeEach(() => {
    authState = {
      accessToken: null,
      authenticatedFetch: vi.fn(),
      completeLoginSession: vi.fn(),
      isAuthenticated: false,
      isRestoringSession: false,
      logout: vi.fn(),
      updateAuthenticatedUser: vi.fn(),
      user: null,
    }
  })

  it('renders the current account details and moved profile fields for a signed-in user', () => {
    authState = {
      ...authState,
      accessToken: 'token',
      isAuthenticated: true,
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        email: 'artist@example.com',
        firstName: 'Scene',
        lastName: 'Artist',
        userId: 8,
      },
    }

    render(<SettingsPage />)

    expect(screen.getByRole('heading', { name: /profile details/i, level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /profile details/i, level: 2 })).not.toBeInTheDocument()
    expect(
      screen.getByText(/review the account details currently tied to your mage profile/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toHaveValue('artist@example.com')
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Scene')
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Scene Artist')
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Artist')
    expect(screen.queryByText('LOCAL')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument()
  })

  it('saves updated names through the authenticated backend flow', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      authenticatedFetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            authProvider: 'LOCAL',
            displayName: 'Updated Artist',
            email: 'artist@example.com',
            firstName: 'Updated',
            lastName: 'Artist',
            userId: 8,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      ),
      isAuthenticated: true,
      updateAuthenticatedUser: vi.fn(),
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        email: 'artist@example.com',
        firstName: 'Scene',
        lastName: 'Artist',
        userId: 8,
      },
    }

    const user = userEvent.setup()

    render(<SettingsPage />)

    await user.clear(screen.getByLabelText(/first name/i))
    await user.type(screen.getByLabelText(/first name/i), 'Updated')
    await user.clear(screen.getByLabelText(/display name/i))
    await user.type(screen.getByLabelText(/display name/i), 'Updated Artist')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(authState.authenticatedFetch).toHaveBeenCalledWith(
        '/users/me',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            firstName: 'Updated',
            lastName: 'Artist',
            displayName: 'Updated Artist',
          }),
        }),
      ),
    )

    await waitFor(() =>
      expect(authState.updateAuthenticatedUser).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Updated',
          lastName: 'Artist',
          displayName: 'Updated Artist',
        }),
      ),
    )

    expect(await screen.findByText('Profile details saved.')).toBeInTheDocument()
  })

  it('shows a fallback state when the page cannot read a signed-in user', () => {
    render(<SettingsPage />)

    expect(screen.getByRole('heading', { name: /unable to open settings/i })).toBeInTheDocument()
    expect(
      screen.getByText(/could not find the signed-in account details needed to render this page/i),
    ).toBeInTheDocument()
  })
})

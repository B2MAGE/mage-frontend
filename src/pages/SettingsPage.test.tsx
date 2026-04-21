import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'
import { ThemeProvider } from '../theme/ThemeProvider'
import { APP_THEME_STORAGE_KEY } from '../theme/themes'

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

function renderSettingsPage() {
  return render(
    <ThemeProvider>
      <SettingsPage />
    </ThemeProvider>,
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
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

    renderSettingsPage()

    expect(screen.getByRole('heading', { name: /^settings$/i, level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /theme/i, level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /profile details/i, level: 2 })).toBeInTheDocument()
    expect(
      screen.getByText(
        /manage your mage profile details and choose the interface theme that fits this device/i,
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /mage pulse/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText(/email/i)).toHaveValue('artist@example.com')
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Scene')
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Scene Artist')
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Artist')
    expect(screen.queryByText('LOCAL')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument()
  })

  it('persists the selected theme on this device', async () => {
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

    const user = userEvent.setup()

    renderSettingsPage()

    await user.click(screen.getByRole('radio', { name: /classic blue/i }))

    expect(screen.getByRole('radio', { name: /classic blue/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(document.documentElement.dataset.theme).toBe('classic-facebook')
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe('classic-facebook')
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

    renderSettingsPage()

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

  it('shows backend validation errors when submitted profile values are invalid', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      authenticatedFetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'Request validation failed.',
            details: {
              firstName: 'firstName must not be blank',
              lastName: 'lastName must not be blank',
              displayName: 'displayName must not be blank',
            },
          }),
          {
            status: 400,
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

    renderSettingsPage()

    await user.clear(screen.getByLabelText(/first name/i))
    await user.clear(screen.getByLabelText(/last name/i))
    await user.clear(screen.getByLabelText(/display name/i))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText('firstName must not be blank')).toBeInTheDocument()
    expect(screen.getByText('lastName must not be blank')).toBeInTheDocument()
    expect(screen.getByText('displayName must not be blank')).toBeInTheDocument()
    expect(screen.getByText('Request validation failed.')).toBeInTheDocument()
    expect(authState.updateAuthenticatedUser).not.toHaveBeenCalled()
  })

  it('shows a clear error message when the save request fails', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      authenticatedFetch: vi.fn().mockRejectedValue(new Error('network down')),
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

    renderSettingsPage()

    await user.clear(screen.getByLabelText(/display name/i))
    await user.type(screen.getByLabelText(/display name/i), 'Updated Artist')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(
      await screen.findByText('Profile updates are unavailable right now. Please try again in a moment.'),
    ).toBeInTheDocument()
    expect(authState.updateAuthenticatedUser).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled()
  })

  it('shows a fallback state when the page cannot read a signed-in user', () => {
    renderSettingsPage()

    expect(screen.getByRole('heading', { name: /unable to open settings/i })).toBeInTheDocument()
    expect(
      screen.getByText(/could not find the signed-in account details needed to render this page/i),
    ).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'

let authState = {
  accessToken: null as string | null,
  authenticatedFetch: vi.fn(),
  completeLoginSession: vi.fn(),
  isAuthenticated: false,
  isRestoringSession: false,
  logout: vi.fn(),
  user: null as null | {
    authProvider: string
    displayName: string
    email: string
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
        displayName: 'Preset Artist',
        email: 'artist@example.com',
        userId: 8,
      },
    }

    render(<SettingsPage />)

    expect(screen.getByRole('heading', { name: /profile settings/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Preset')
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Artist')
    expect(screen.getByText('artist@example.com')).toBeInTheDocument()
    expect(screen.getByText('LOCAL')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument()
  })

  it('shows a fallback state when the page cannot read a signed-in user', () => {
    render(<SettingsPage />)

    expect(screen.getByRole('heading', { name: /unable to open settings/i })).toBeInTheDocument()
    expect(
      screen.getByText(/could not find the signed-in account details needed to render this page/i),
    ).toBeInTheDocument()
  })
})

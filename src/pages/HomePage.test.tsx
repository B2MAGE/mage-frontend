import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

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

vi.mock('@auth', () => ({
  useAuth: () => authState,
}))

vi.mock('@modules/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modules/player')>()

  return {
    ...actual,
    MagePlayer: ({ initialPlayback }: { initialPlayback?: string }) => (
      <div data-playback={initialPlayback}>Preview player</div>
    ),
  }
})

vi.mock('./ScenesPage', () => ({
  ScenesPage: () => <div>Scenes page</div>,
}))

describe('HomePage', () => {
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

  it('renders the guest preview homepage without the old CTA links', () => {
    render(<HomePage />)

    expect(screen.getByRole('heading', { name: 'MAGE' })).toBeInTheDocument()
    expect(screen.getByText('Preview player')).toHaveAttribute('data-playback', 'playing')
    expect(screen.queryByRole('link', { name: /browse scenes/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /create an account/i })).not.toBeInTheDocument()
  })

  it('shows scene discovery for authenticated users', () => {
    authState = {
      ...authState,
      accessToken: 'token',
      isAuthenticated: true,
      user: {
        authProvider: 'LOCAL',
        displayName: 'Existing User',
        email: 'user@example.com',
        userId: 12,
      },
    }

    render(<HomePage />)

    expect(screen.getByText('Scenes page')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'MAGE' })).not.toBeInTheDocument()
  })
})

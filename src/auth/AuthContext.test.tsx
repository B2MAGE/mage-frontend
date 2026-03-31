import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import {
  AUTH_SESSION_STORAGE_KEY,
  AuthProvider,
  type AuthenticatedUser,
  useAuth,
} from './AuthContext'
import { buildApiUrl } from '../lib/api'

const storedUser: AuthenticatedUser = {
  userId: 8,
  email: 'stored-user@example.com',
  displayName: 'Stored User',
  authProvider: 'LOCAL',
}

const restoredUser: AuthenticatedUser = {
  userId: 8,
  email: 'restored-user@example.com',
  displayName: 'Restored User',
  authProvider: 'LOCAL',
  createdAt: '2026-03-31T18:10:00Z',
}

function AuthHarness() {
  const { authenticatedFetch, isAuthenticated, isRestoringSession, logout, user } = useAuth()

  return (
    <div>
      <div data-testid="auth-status">
        {isRestoringSession ? 'restoring' : isAuthenticated ? 'authenticated' : 'signed-out'}
      </div>
      <div data-testid="auth-user-email">{user?.email ?? 'none'}</div>
      <button type="button" onClick={logout}>
        Log out
      </button>
      <button
        type="button"
        onClick={() => {
          void authenticatedFetch('/presets')
        }}
      >
        Request protected data
      </button>
    </div>
  )
}

function storeSession(accessToken = 'stored-auth-token') {
  window.localStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      accessToken,
      user: storedUser,
    }),
  )
}

function renderAuthHarness() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('AuthProvider', () => {
  it('calls GET /users/me during app bootstrap and restores the authenticated user', async () => {
    storeSession()

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(restoredUser), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )

    renderAuthHarness()

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        buildApiUrl('/users/me'),
        expect.objectContaining({
          headers: expect.any(Headers),
        }),
      ),
    )

    const bootstrapRequest = fetchSpy.mock.calls[0]
    const bootstrapHeaders = bootstrapRequest[1]?.headers as Headers

    expect(bootstrapHeaders.get('Authorization')).toBe('Bearer stored-auth-token')
    expect(await screen.findByText('restored-user@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated')
  })

  it('clears invalid stored tokens when bootstrap receives a 401', async () => {
    storeSession('expired-auth-token')

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Authentication is required.',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    renderAuthHarness()

    await waitFor(() => {
      expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    })

    expect(screen.getByTestId('auth-status')).toHaveTextContent('signed-out')
    expect(screen.getByTestId('auth-user-email')).toHaveTextContent('none')
  })

  it('logout clears the stored token and shared auth state', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(restoredUser), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )

    const user = userEvent.setup()

    renderAuthHarness()

    expect(await screen.findByText('restored-user@example.com')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /log out/i }))

    expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId('auth-status')).toHaveTextContent('signed-out')
    expect(screen.getByTestId('auth-user-email')).toHaveTextContent('none')
  })

  it('authenticated requests send the bearer token and clear auth state on a 401', async () => {
    storeSession('valid-auth-token')

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(restoredUser), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'Authentication is required.',
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

    renderAuthHarness()

    expect(await screen.findByText('restored-user@example.com')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /request protected data/i }))

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        buildApiUrl('/presets'),
        expect.objectContaining({
          headers: expect.any(Headers),
        }),
      ),
    )

    const authenticatedRequestHeaders = fetchSpy.mock.calls[1][1]?.headers as Headers

    expect(authenticatedRequestHeaders.get('Authorization')).toBe('Bearer valid-auth-token')

    await waitFor(() => {
      expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    })

    expect(screen.getByTestId('auth-status')).toHaveTextContent('signed-out')
  })
})

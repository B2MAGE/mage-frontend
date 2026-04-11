import { StrictMode } from 'react'
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

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function renderAuthHarness(options?: { strictMode?: boolean }) {
  const tree = (
    <MemoryRouter>
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    </MemoryRouter>
  )

  if (options?.strictMode) {
    return render(<StrictMode>{tree}</StrictMode>)
  }

  return render(tree)
}

describe('AuthProvider', () => {
  it('calls GET /users/me during app bootstrap and restores the authenticated user', async () => {
    storeSession()

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(restoredUser))

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
      jsonResponse(
        {
          message: 'Authentication is required.',
        },
        401,
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

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(restoredUser))

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
      .mockResolvedValueOnce(jsonResponse(restoredUser))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            message: 'Authentication is required.',
          },
          401,
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

  it('finishes restoring a stored session when mounted in StrictMode', async () => {
    storeSession()

    const pendingResponses: Array<(value: Response) => void> = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          pendingResponses.push(resolve)
        }),
    )

    renderAuthHarness({ strictMode: true })

    await waitFor(() => {
      expect(pendingResponses.length).toBeGreaterThan(0)
    })

    pendingResponses.forEach((resolveResponse) => {
      resolveResponse(jsonResponse(restoredUser))
    })

    expect(await screen.findByText('restored-user@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated')
  })
})

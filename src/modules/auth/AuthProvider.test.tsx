import { StrictMode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@shared/lib'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './authContext'
import { AUTH_SESSION_STORAGE_KEY } from './storage'
import type { AuthenticatedUser } from './types'

const storedUser: AuthenticatedUser = {
  userId: 8,
  email: 'stored-user@example.com',
  displayName: 'Stored User',
  handle: 'stored_user',
  description: 'Stored profile description.',
  avatarGradientStart: '#ab3456',
  avatarGradientEnd: '#1234ef',
  authProvider: 'LOCAL',
}

const restoredUser: AuthenticatedUser = {
  userId: 8,
  email: 'restored-user@example.com',
  displayName: 'Restored User',
  handle: 'restored_user',
  description: 'Restored profile description.',
  avatarGradientStart: '#3456ab',
  avatarGradientEnd: '#ef1234',
  authProvider: 'LOCAL',
  createdAt: '2026-03-31T18:10:00Z',
}

function AuthHarness() {
  const {
    authenticatedFetch,
    completeLoginSession,
    isAuthenticated,
    isRestoringSession,
    logout,
    updateAuthenticatedUser,
    user,
  } = useAuth()

  return (
    <div>
      <div data-testid="auth-status">
        {isRestoringSession ? 'restoring' : isAuthenticated ? 'authenticated' : 'signed-out'}
      </div>
      <div data-testid="auth-user-email">{user?.email ?? 'none'}</div>
      <div data-testid="auth-user-display-name">{user?.displayName ?? 'none'}</div>
      <div data-testid="auth-user-handle">{user?.handle ?? 'none'}</div>
      <div data-testid="auth-user-description">{user?.description ?? 'none'}</div>
      <div data-testid="auth-user-gradient">{user?.avatarGradientStart}/{user?.avatarGradientEnd}</div>
      <button type="button" onClick={logout}>
        Log out
      </button>
      <button type="button" onClick={() => completeLoginSession({ accessToken: 'new-account-token', user: { ...storedUser, userId: 99, email: 'new-account@example.com' } })}>Switch account</button>
      <button
        type="button"
        onClick={() => {
          if (!user) {
            return
          }

          updateAuthenticatedUser({
            ...user,
            firstName: 'Updated',
            lastName: 'Artist',
            displayName: 'Updated Artist',
            avatarGradientStart: '#527b63',
            avatarGradientEnd: '#263e43',
          })
        }}
      >
        Update profile snapshot
      </button>
      <button
        type="button"
        onClick={() => {
          void authenticatedFetch('/scenes')
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
  it('does not sign out a new account when an old request later returns 401', async () => {
    storeSession()
    let resolveOld!: (response: Response) => void
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(restoredUser))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve }))
    renderAuthHarness()
    await screen.findByText('restored-user@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Request protected data' }))
    await userEvent.click(screen.getByRole('button', { name: 'Switch account' }))
    await act(async () => resolveOld(jsonResponse({}, 401)))
    expect(screen.getByTestId('auth-user-email')).toHaveTextContent('new-account@example.com')
    expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated')
    expect(JSON.parse(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)!)).toMatchObject({ accessToken: 'new-account-token' })
  })

  it.each([200, 401])('ignores old bootstrap status %s after an account switch', async (status) => {
    storeSession()
    let resolveOld!: (response: Response) => void
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOld = resolve }))
    renderAuthHarness()
    await userEvent.click(screen.getByRole('button', { name: 'Switch account' }))
    await act(async () => resolveOld(jsonResponse(restoredUser, status)))
    expect(screen.getByTestId('auth-user-email')).toHaveTextContent('new-account@example.com')
    expect(JSON.parse(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)!)).toMatchObject({ accessToken: 'new-account-token' })
  })
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
    expect(screen.getByTestId('auth-user-handle')).toHaveTextContent('restored_user')
    expect(screen.getByTestId('auth-user-gradient')).toHaveTextContent('#3456ab/#ef1234')
    expect(screen.getByTestId('auth-user-description')).toHaveTextContent(
      'Restored profile description.',
    )
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

  it('persists updated authenticated user details into the stored session', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(restoredUser))

    const user = userEvent.setup()

    renderAuthHarness()

    expect(await screen.findByText('restored-user@example.com')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /update profile snapshot/i }))

    const persistedSession = JSON.parse(
      window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY) ?? 'null',
    ) as { user: AuthenticatedUser | null }

    expect(persistedSession.user).toEqual(
      expect.objectContaining({
        firstName: 'Updated',
        lastName: 'Artist',
        displayName: 'Updated Artist',
        avatarGradientStart: '#527b63',
        avatarGradientEnd: '#263e43',
      }),
    )
    expect(screen.getByTestId('auth-user-display-name')).toHaveTextContent('Updated Artist')
    expect(screen.getByTestId('auth-user-gradient')).toHaveTextContent('#527b63/#263e43')
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
        buildApiUrl('/scenes'),
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

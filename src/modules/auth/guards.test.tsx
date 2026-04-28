import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { GuestOnlyRoute, ProtectedRoute } from './guards'
import { useAuth } from './authContext'

vi.mock('./authContext', () => ({
  useAuth: vi.fn(),
}))

const useAuthMock = vi.mocked(useAuth)

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <div>Protected page</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderGuestOnlyRoute() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route
          path="/login"
          element={
            <GuestOnlyRoute>
              <div>Guest page</div>
            </GuestOnlyRoute>
          }
        />
        <Route path="/" element={<div>Home page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('auth guards', () => {
  it('shows the restore state while the session bootstrap is in progress', () => {
    useAuthMock.mockReturnValue({
      accessToken: null,
      authenticatedFetch: vi.fn(),
      completeLoginSession: vi.fn(),
      isAuthenticated: false,
      isRestoringSession: true,
      logout: vi.fn(),
      updateAuthenticatedUser: vi.fn(),
      user: null,
    })

    renderProtectedRoute()

    expect(screen.getByRole('heading', { name: /checking your login/i })).toBeInTheDocument()
  })

  it('redirects unauthenticated users away from protected routes', () => {
    useAuthMock.mockReturnValue({
      accessToken: null,
      authenticatedFetch: vi.fn(),
      completeLoginSession: vi.fn(),
      isAuthenticated: false,
      isRestoringSession: false,
      logout: vi.fn(),
      updateAuthenticatedUser: vi.fn(),
      user: null,
    })

    renderProtectedRoute()

    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument()
  })

  it('redirects authenticated users away from guest-only routes', () => {
    useAuthMock.mockReturnValue({
      accessToken: 'token',
      authenticatedFetch: vi.fn(),
      completeLoginSession: vi.fn(),
      isAuthenticated: true,
      isRestoringSession: false,
      logout: vi.fn(),
      updateAuthenticatedUser: vi.fn(),
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        email: 'artist@example.com',
        userId: 8,
      },
    })

    renderGuestOnlyRoute()

    expect(screen.getByText('Home page')).toBeInTheDocument()
    expect(screen.queryByText('Guest page')).not.toBeInTheDocument()
  })
})

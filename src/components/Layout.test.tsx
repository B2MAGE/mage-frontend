import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Layout } from './Layout'

const logoutMock = vi.fn()

let authState = {
  accessToken: null as string | null,
  authenticatedFetch: vi.fn(),
  completeLoginSession: vi.fn(),
  isAuthenticated: false,
  isRestoringSession: false,
  logout: logoutMock,
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

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout>
        <div>Page content</div>
      </Layout>
    </MemoryRouter>,
  )
}

describe('Layout', () => {
  beforeEach(() => {
    logoutMock.mockReset()
    authState = {
      accessToken: null,
      authenticatedFetch: vi.fn(),
      completeLoginSession: vi.fn(),
      isAuthenticated: false,
      isRestoringSession: false,
      logout: logoutMock,
      updateAuthenticatedUser: vi.fn(),
      user: null,
    }
  })

  it('shows a compact sign-in action when the user is signed out', () => {
    renderLayout()

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: /open account menu/i })).not.toBeInTheDocument()
  })

  it('shows the main branch account dropdown and routes the identity row to settings', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      isAuthenticated: true,
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        email: 'artist@example.com',
        userId: 8,
      },
    }

    const user = userEvent.setup()

    renderLayout()

    expect(screen.getByRole('link', { name: /create/i })).toHaveAttribute('href', '/create-scene')

    await user.click(screen.getByRole('button', { name: /open account menu for scene artist/i }))

    expect(screen.getByRole('menuitem', { name: /scene artist/i })).toHaveAttribute(
      'href',
      '/settings',
    )
    expect(screen.getByRole('button', { name: /view your channel/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /browse/i })).toHaveAttribute('href', '/')
    expect(screen.getByRole('menuitem', { name: /my scenes/i })).toHaveAttribute(
      'href',
      '/my-scenes',
    )
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: /sign out/i }))

    expect(logoutMock).toHaveBeenCalledTimes(1)
  })
})

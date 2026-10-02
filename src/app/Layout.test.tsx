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
    handle?: string
    avatarGradientStart?: string
    avatarGradientEnd?: string
    firstName?: string
    lastName?: string
    userId: number | null
  },
}

vi.mock('@auth', () => ({
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
    expect(screen.getByRole('link', { name: /sign in/i }).querySelector('.app-icon')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getAllByRole('link', { name: 'About', hidden: true })).toHaveLength(2)
    for (const aboutLink of screen.getAllByRole('link', { name: 'About', hidden: true })) {
      expect(aboutLink).toHaveAttribute('href', '/about')
    }
    expect(screen.queryByRole('button', { name: 'About' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open account menu/i })).not.toBeInTheDocument()
  })

  it('shows the profile, library, settings, and sign-out account actions', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      isAuthenticated: true,
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        email: 'artist@example.com',
        handle: 'sceneartist',
        avatarGradientStart: '#527b63',
        avatarGradientEnd: '#263e43',
        userId: 8,
      },
    }

    const user = userEvent.setup()

    renderLayout()

    expect(screen.getByRole('link', { name: /create/i })).toHaveAttribute('href', '/create-scene')
    expect(screen.getByRole('link', { name: /create/i }).querySelector('.app-icon')).toHaveAttribute('fill', 'none')
    expect(screen.getByRole('button', { name: /open account menu for scene artist/i }).querySelector('.nav-avatar')).toHaveClass('user-avatar')

    await user.click(screen.getByRole('button', { name: /open account menu for scene artist/i }))

    expect(screen.getAllByRole('menuitem')).toHaveLength(4)
    const profileMenuItem = screen.getByRole('menuitem', { name: /scene artist/i })
    const profileIdentity = profileMenuItem.querySelector('.nav-menu__identity')
    const viewProfile = screen.getByText('View profile')

    expect(profileMenuItem).toHaveAttribute('href', '/@sceneartist')
    expect(profileMenuItem.querySelector('.nav-avatar')).toHaveClass('user-avatar')
    expect(profileMenuItem.querySelector('.nav-avatar')).toHaveStyle({ backgroundImage: 'linear-gradient(145deg, #527b63, #263e43)' })
    expect(screen.getByRole('button', { name: /open account menu for scene artist/i }).querySelector('.nav-avatar')).toHaveStyle({ backgroundImage: 'linear-gradient(145deg, #527b63, #263e43)' })
    expect(profileMenuItem.querySelector('.nav-avatar')).toHaveAttribute('aria-hidden', 'true')
    expect(profileIdentity).toHaveTextContent('Scene Artist')
    expect(profileIdentity).toHaveTextContent('artist@example.com')
    expect(profileIdentity).not.toHaveTextContent('View profile')
    expect(viewProfile).toHaveClass('nav-menu__channel-link')
    expect(viewProfile.parentElement).toBe(profileMenuItem)
    expect(screen.queryByRole('menuitem', { name: /browse/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /my scenes/i })).toHaveAttribute(
      'href',
      '/my-scenes',
    )
    expect(screen.getByRole('menuitem', { name: /settings/i })).toHaveAttribute(
      'href',
      '/settings',
    )
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
    for (const name of [/my scenes/i, /settings/i, /sign out/i]) {
      const icon = screen.getByRole('menuitem', { name }).querySelector('.app-icon')
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      expect(icon).toHaveAttribute('focusable', 'false')
      expect(icon).toHaveAttribute('stroke-width', '2')
    }

    await user.click(screen.getByRole('menuitem', { name: /sign out/i }))

    expect(logoutMock).toHaveBeenCalledTimes(1)
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_SESSION_STORAGE_KEY } from '@auth'
import App from './App'

vi.mock('@app/Layout', () => ({
  Layout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@modules/home', () => ({
  HomePage: () => <div>Home page</div>,
}))

vi.mock('./modules/about/AboutScene', () => ({
  AboutScene: () => <div>Decorative About scene</div>,
}))

vi.mock('@modules/my-scenes', () => ({
  MyScenesLoadingState: () => <div>Loading my scenes</div>,
  MyScenesPage: () => <div>My scenes page</div>,
}))

vi.mock('@modules/profile', () => ({
  ProfilePage: () => <div>Public profile page</div>,
}))

vi.mock('@modules/discovery', () => ({
  ScenesPage: () => <div>Scenes page</div>,
}))

vi.mock('@modules/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modules/auth')>()

  return {
    ...actual,
    ForgotPasswordPage: () => <div>Forgot password page</div>,
    LoginPage: () => <div>Login page</div>,
    RegisterPage: () => <div>Register page</div>,
    ResetPasswordPage: () => <div>Reset password page</div>,
  }
})

vi.mock('@modules/scene-detail', () => ({
  SceneDetailPage: () => <div>Scene detail page</div>,
}))

vi.mock('@modules/scene-editor', () => ({
  CreateScenePage: () => <div>Create scene page</div>,
  EditScenePage: () => <div>Edit scene page</div>,
  SceneEditorLoadingState: () => <div>Loading scene editor</div>,
}))

vi.mock('@modules/settings', () => ({
  SettingsLoadingState: () => <div>Loading settings</div>,
  SettingsPage: () => <div>Settings page</div>,
}))

describe('App routing', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  it.each(['/settings/moderators', '/moderation', '/moderation/moderators', '/moderation/playback'])('keeps %s behind authentication', async path => {
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Moderation' })).not.toBeInTheDocument()
  })

  it('allows direct scene detail visits without redirecting to login', async () => {
    render(
      <MemoryRouter initialEntries={['/scenes/12']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('Scene detail page')).toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })

  it('allows public visits to the scenes discovery page', () => {
    render(
      <MemoryRouter initialEntries={['/scenes']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('Scenes page')).toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })

  it('renders the public About page', () => {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Music you can see.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore scenes' })).toHaveAttribute('href', '/scenes')
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })

  it('treats the retired profile alias as an unknown route', async () => {
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Home page')).toBeInTheDocument()
    })

    expect(screen.queryByRole('heading', { name: 'Your profile' })).not.toBeInTheDocument()
  })

  it('allows public visits to canonical handle profile routes', () => {
    render(
      <MemoryRouter initialEntries={['/@ari']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('Public profile page')).toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })

  it('does not treat ordinary unknown paths as profile handles', async () => {
    render(
      <MemoryRouter initialEntries={['/not-a-profile']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Home page')).toBeInTheDocument()
    })
    expect(screen.queryByText('Public profile page')).not.toBeInTheDocument()
  })

  it('keeps settings behind authentication', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Login page')).toBeInTheDocument()
    })

    expect(screen.queryByText('Settings page')).not.toBeInTheDocument()
  })

  it('redirects authenticated users away from login to home', async () => {
    window.localStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        accessToken: 'saved-token',
        user: {
          userId: 14,
          email: 'user@example.com',
          displayName: 'Existing User',
          handle: 'existing_user',
          authProvider: 'LOCAL',
        },
      }),
    )

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          userId: 14,
          email: 'user@example.com',
          displayName: 'Existing User',
          handle: 'existing_user',
          authProvider: 'LOCAL',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Home page')).toBeInTheDocument()
    })

    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })

  it('redirects authenticated users away from register to home', async () => {
    window.localStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify({
        accessToken: 'saved-token',
        user: {
          userId: 14,
          email: 'user@example.com',
          displayName: 'Existing User',
          handle: 'existing_user',
          authProvider: 'LOCAL',
        },
      }),
    )

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          userId: 14,
          email: 'user@example.com',
          displayName: 'Existing User',
          handle: 'existing_user',
          authProvider: 'LOCAL',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    render(
      <MemoryRouter initialEntries={['/register']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Home page')).toBeInTheDocument()
    })

    expect(screen.queryByText('Register page')).not.toBeInTheDocument()
  })
})

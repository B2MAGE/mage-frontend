import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AUTH_SESSION_STORAGE_KEY } from './auth/AuthContext'

vi.mock('./components/Layout', () => ({
  Layout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('./pages/HomePage', () => ({
  HomePage: () => <div>Home page</div>,
}))

vi.mock('./pages/LoginPage', () => ({
  LoginPage: () => <div>Login page</div>,
}))

vi.mock('./pages/MyPresetsPage', () => ({
  MyPresetsPage: () => <div>My presets page</div>,
}))

vi.mock('./pages/PresetsPage', () => ({
  PresetsPage: () => <div>Presets page</div>,
}))

vi.mock('./pages/PresetDetailPage', () => ({
  PresetDetailPage: () => <div>Preset detail page</div>,
}))

vi.mock('./pages/RegisterPage', () => ({
  RegisterPage: () => <div>Register page</div>,
}))

vi.mock('./pages/CreatePresetPage', () => ({
  CreatePresetPage: () => <div>Create preset page</div>,
}))

vi.mock('./pages/SettingsPage', () => ({
  SettingsPage: () => <div>Settings page</div>,
}))

describe('App routing', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('allows direct preset detail visits without redirecting to login', async () => {
    render(
      <MemoryRouter initialEntries={['/presets/12']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('Preset detail page')).toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })

  it('allows public visits to the presets discovery page', () => {
    render(
      <MemoryRouter initialEntries={['/presets']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('Presets page')).toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
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

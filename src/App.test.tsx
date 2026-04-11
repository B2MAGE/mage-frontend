import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

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
  it('allows direct preset detail visits without redirecting to login', async () => {
    render(
      <MemoryRouter initialEntries={['/presets/12']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('Preset detail page')).toBeInTheDocument()
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
})

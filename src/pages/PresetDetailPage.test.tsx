import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import {
  AUTH_SESSION_STORAGE_KEY,
  AuthProvider,
  type AuthenticatedUser,
} from '../auth/AuthContext'
import { buildApiUrl } from '../lib/api'
import { LoginPage } from './LoginPage'
import { MyPresetsPage } from './MyPresetsPage'
import { PresetDetailPage } from './PresetDetailPage'

vi.mock('../components/MagePlayer', () => ({
  MagePlayer: ({
    ariaLabel,
    className,
    sceneBlob,
  }: {
    ariaLabel?: string
    className?: string
    sceneBlob: unknown
  }) => (
    <div aria-label={ariaLabel} className={className} data-testid="mage-player">
      {sceneBlob ? 'player-ready' : 'no-scene'}
    </div>
  ),
}))

const storedUser: AuthenticatedUser = {
  userId: 8,
  email: 'artist@example.com',
  displayName: 'Preset Artist',
  authProvider: 'LOCAL',
}

const presetResponse = {
  presetId: 12,
  ownerUserId: 8,
  name: 'Aurora Drift',
  sceneData: {
    visualizer: {
      shader: 'nebula',
    },
  },
  thumbnailRef: 'thumbnails/preset-12.png',
  createdAt: '2026-04-06T14:00:00Z',
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function storeSession() {
  window.localStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify({
      accessToken: 'stored-auth-token',
      user: storedUser,
    }),
  )
}

function renderPresetDetailPage(initialEntries = ['/presets/12']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/my-presets" element={<MyPresetsPage />} />
          <Route path="/presets/:id" element={<PresetDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('PresetDetailPage', () => {
  it('loads preset detail on a direct route visit and renders the player', async () => {
    storeSession()

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/presets/12')) {
        return Promise.resolve(jsonResponse(presetResponse))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderPresetDetailPage()

    expect(await screen.findByRole('heading', { name: /aurora drift/i })).toBeInTheDocument()
    expect(screen.getByTestId('mage-player')).toHaveTextContent('player-ready')
    expect(screen.getByRole('heading', { name: /comments/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /recommended presets/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upvote 416/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /downvote/i }).length).toBeGreaterThan(0)
    expect(screen.getByText(/add a comment as preset artist/i)).toBeInTheDocument()
    expect(screen.getByText(/now playing/i)).toBeInTheDocument()

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        buildApiUrl('/presets/12'),
        expect.objectContaining({
          headers: expect.any(Headers),
        }),
      ),
    )

    const presetRequestHeaders = fetchSpy.mock.calls[1][1]?.headers as Headers

    expect(presetRequestHeaders.get('Authorization')).toBe('Bearer stored-auth-token')
  })

  it('shows a clear error state for an invalid preset route id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    renderPresetDetailPage(['/presets/not-a-number'])

    expect(await screen.findByRole('heading', { name: /invalid preset link/i })).toBeInTheDocument()
    expect(screen.getByText(/missing a valid preset id/i)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows a not-found state when the preset request returns 404', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/presets/12')) {
        return Promise.resolve(
          jsonResponse(
            {
              message: 'Preset not found.',
            },
            404,
          ),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderPresetDetailPage()

    expect(await screen.findByRole('heading', { name: /preset not found/i })).toBeInTheDocument()
    expect(screen.getByText(/does not exist or is no longer available/i)).toBeInTheDocument()
  })

  it('shows a sign-in-needed state when an unauthenticated preset request is rejected', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/presets/12')) {
        return Promise.resolve(
          jsonResponse(
            {
              message: 'Authentication is required.',
            },
            401,
          ),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderPresetDetailPage()

    expect(await screen.findByRole('heading', { name: /sign in to view this preset/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to login/i })).toBeInTheDocument()
  })
})

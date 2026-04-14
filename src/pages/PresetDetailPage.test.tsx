import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
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
  creatorDisplayName: 'Preset Artist',
  name: 'Aurora Drift',
  sceneData: {
    visualizer: {
      shader: 'nebula',
    },
  },
  thumbnailRef: 'thumbnails/preset-12.png',
  createdAt: '2026-04-06T14:00:00Z',
  tags: ['ambient', 'focus-friendly'],
}

const creatorPresetResponse = {
  presetId: 16,
  ownerUserId: 8,
  creatorDisplayName: 'Preset Artist',
  name: 'Signal Bloom',
  sceneData: {
    visualizer: {
      shader: 'pulse',
    },
  },
  thumbnailRef: 'thumbnails/preset-16.png',
  createdAt: '2026-04-08T14:00:00Z',
}

const tagPresetResponse = {
  presetId: 21,
  ownerUserId: 42,
  creatorDisplayName: 'Night Archive',
  name: 'Afterglow Static',
  sceneData: {
    visualizer: {
      shader: 'mist',
    },
  },
  thumbnailRef: 'thumbnails/preset-21.png',
  createdAt: '2026-04-09T14:00:00Z',
}

const unrelatedPresetResponse = {
  presetId: 34,
  ownerUserId: 77,
  creatorDisplayName: 'Other Creator',
  name: 'Unrelated Echo',
  sceneData: {
    visualizer: {
      shader: 'echo',
    },
  },
  thumbnailRef: 'thumbnails/preset-34.png',
  createdAt: '2026-04-10T14:00:00Z',
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
  function PresetsRouteProbe() {
    const location = useLocation()

    return <div data-testid="presets-route">{location.search}</div>
  }

  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/my-presets" element={<MyPresetsPage />} />
          <Route path="/presets" element={<PresetsRouteProbe />} />
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

      if (input === buildApiUrl('/presets')) {
        return Promise.resolve(
          jsonResponse([
            presetResponse,
            creatorPresetResponse,
            unrelatedPresetResponse,
          ]),
        )
      }

      if (input === buildApiUrl('/presets?tag=ambient')) {
        return Promise.resolve(jsonResponse([presetResponse, tagPresetResponse]))
      }

      if (input === buildApiUrl('/presets?tag=focus-friendly')) {
        return Promise.resolve(jsonResponse([presetResponse, creatorPresetResponse]))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderPresetDetailPage()

    expect(await screen.findByRole('heading', { name: /aurora drift/i })).toBeInTheDocument()
    expect(screen.getByTestId('mage-player')).toHaveTextContent('player-ready')
    expect(screen.getByRole('heading', { name: /comments/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upvote 416/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^show$/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /downvote/i }).length).toBeGreaterThan(0)
    expect(screen.getByText(/add a comment as preset artist/i)).toBeInTheDocument()
    expect(screen.getAllByText('Preset Artist').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/2,999 plays/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /from preset artist/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^ambient$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^focus-friendly$/i })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /afterglow static/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /unrelated echo/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/after rain \/ windowlight/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/now playing/i)).not.toBeInTheDocument()

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

  it('shows the real creator name for another users preset', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/presets/44')) {
        return Promise.resolve(
          jsonResponse({
            presetId: 44,
            ownerUserId: 77,
            creatorDisplayName: 'Peter',
            name: 'Test 3',
            sceneData: {
              visualizer: {
                shader: 'nebula',
              },
            },
            thumbnailRef: 'thumbnails/preset-44.png',
            createdAt: '2026-04-06T14:00:00Z',
            tags: ['chill'],
          }),
        )
      }

      if (input === buildApiUrl('/presets')) {
        return Promise.resolve(
          jsonResponse([
            {
              presetId: 44,
              ownerUserId: 77,
              creatorDisplayName: 'Peter',
              name: 'Test 3',
              sceneData: {
                visualizer: {
                  shader: 'nebula',
                },
              },
              thumbnailRef: 'thumbnails/preset-44.png',
              createdAt: '2026-04-06T14:00:00Z',
            },
            {
              presetId: 45,
              ownerUserId: 77,
              creatorDisplayName: 'Peter',
              name: 'Pulse Coast',
              sceneData: {
                visualizer: {
                  shader: 'nebula',
                },
              },
              thumbnailRef: 'thumbnails/preset-45.png',
              createdAt: '2026-04-08T14:00:00Z',
            },
          ]),
        )
      }

      if (input === buildApiUrl('/presets?tag=chill')) {
        return Promise.resolve(
          jsonResponse([
            {
              presetId: 44,
              ownerUserId: 77,
              creatorDisplayName: 'Peter',
              name: 'Test 3',
              sceneData: {
                visualizer: {
                  shader: 'nebula',
                },
              },
              thumbnailRef: 'thumbnails/preset-44.png',
              createdAt: '2026-04-06T14:00:00Z',
            },
          ]),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderPresetDetailPage(['/presets/44'])

    expect(await screen.findAllByText('Peter')).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: /from peter/i })).toBeInTheDocument()
    expect(screen.queryByText('Talia North')).not.toBeInTheDocument()
  })

  it('shows attached preset tags and routes to the filtered presets grid when clicked', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/presets/12')) {
        return Promise.resolve(jsonResponse(presetResponse))
      }

      if (input === buildApiUrl('/presets')) {
        return Promise.resolve(jsonResponse([presetResponse, creatorPresetResponse]))
      }

      if (input === buildApiUrl('/presets?tag=ambient')) {
        return Promise.resolve(jsonResponse([presetResponse, tagPresetResponse]))
      }

      if (input === buildApiUrl('/presets?tag=focus-friendly')) {
        return Promise.resolve(jsonResponse([presetResponse, creatorPresetResponse]))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    const user = userEvent.setup()

    renderPresetDetailPage()

    await screen.findByRole('heading', { name: /aurora drift/i })
    await user.click(screen.getByRole('button', { name: /^show$/i }))

    const ambientTagLink = screen.getByRole('link', { name: /^ambient$/i })
    expect(ambientTagLink).toHaveAttribute('href', '/presets?tag=ambient')
    expect(screen.getByRole('link', { name: /^focus-friendly$/i })).toHaveAttribute(
      'href',
      '/presets?tag=focus-friendly',
    )

    await user.click(ambientTagLink)

    expect(await screen.findByTestId('presets-route')).toHaveTextContent('?tag=ambient')
  })

  it('filters sidebar recommendations by creator and the current preset tags', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/presets/12')) {
        return Promise.resolve(jsonResponse(presetResponse))
      }

      if (input === buildApiUrl('/presets')) {
        return Promise.resolve(
          jsonResponse([
            presetResponse,
            creatorPresetResponse,
            unrelatedPresetResponse,
          ]),
        )
      }

      if (input === buildApiUrl('/presets?tag=ambient')) {
        return Promise.resolve(jsonResponse([presetResponse, tagPresetResponse]))
      }

      if (input === buildApiUrl('/presets?tag=focus-friendly')) {
        return Promise.resolve(jsonResponse([presetResponse, creatorPresetResponse]))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    const user = userEvent.setup()

    renderPresetDetailPage()

    expect(await screen.findByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /afterglow static/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /from preset artist/i }))

    expect(screen.getByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /afterglow static/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^ambient$/i }))

    expect(screen.getByRole('link', { name: /afterglow static/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /signal bloom/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^all$/i }))

    expect(screen.getByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /afterglow static/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /unrelated echo/i })).not.toBeInTheDocument()
  })
})

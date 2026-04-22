import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import {
  AUTH_SESSION_STORAGE_KEY,
  AuthProvider,
  type AuthenticatedUser,
} from '@auth'
import { buildApiUrl } from '@lib/api'
import { MyScenesPage } from '@modules/my-scenes'
import { LoginPage } from '@pages/LoginPage'
import { SceneDetailPage } from './SceneDetailPage'

vi.mock('@modules/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modules/player')>()

  return {
    ...actual,
    MagePlayer: ({
      ariaLabel,
      className,
      initialPlayback,
      sceneBlob,
    }: {
      ariaLabel?: string
      className?: string
      initialPlayback?: string
      sceneBlob: unknown
    }) => (
      <div
        aria-label={ariaLabel}
        className={className}
        data-playback={initialPlayback}
        data-testid="mage-player"
      >
        {sceneBlob ? 'player-ready' : 'no-scene'}
      </div>
    ),
  }
})

const storedUser: AuthenticatedUser = {
  userId: 8,
  email: 'artist@example.com',
  displayName: 'Scene Artist',
  authProvider: 'LOCAL',
}

const sceneResponse = {
  sceneId: 12,
  ownerUserId: 8,
  creatorDisplayName: 'Scene Artist',
  name: 'Aurora Drift',
  sceneData: {
    visualizer: {
      shader: 'nebula',
    },
  },
  thumbnailRef: 'thumbnails/scene-12.png',
  createdAt: '2026-04-06T14:00:00Z',
  tags: ['ambient', 'focus-friendly'],
}

const creatorSceneResponse = {
  sceneId: 16,
  ownerUserId: 8,
  creatorDisplayName: 'Scene Artist',
  name: 'Signal Bloom',
  sceneData: {
    visualizer: {
      shader: 'pulse',
    },
  },
  thumbnailRef: 'thumbnails/scene-16.png',
  createdAt: '2026-04-08T14:00:00Z',
}

const tagSceneResponse = {
  sceneId: 21,
  ownerUserId: 42,
  creatorDisplayName: 'Night Archive',
  name: 'Afterglow Static',
  sceneData: {
    visualizer: {
      shader: 'mist',
    },
  },
  thumbnailRef: 'thumbnails/scene-21.png',
  createdAt: '2026-04-09T14:00:00Z',
}

const unrelatedSceneResponse = {
  sceneId: 34,
  ownerUserId: 77,
  creatorDisplayName: 'Other Creator',
  name: 'Unrelated Echo',
  sceneData: {
    visualizer: {
      shader: 'echo',
    },
  },
  thumbnailRef: 'thumbnails/scene-34.png',
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

function renderSceneDetailPage(initialEntries = ['/scenes/12']) {
  function ScenesRouteProbe() {
    const location = useLocation()

    return <div data-testid="scenes-route">{location.search}</div>
  }

  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/my-scenes" element={<MyScenesPage />} />
          <Route path="/scenes" element={<ScenesRouteProbe />} />
          <Route path="/scenes/:id" element={<SceneDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('SceneDetailPage', () => {
  it('loads scene detail on a direct route visit and renders the player', async () => {
    storeSession()

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/scenes/12')) {
        return Promise.resolve(jsonResponse(sceneResponse))
      }

      if (input === buildApiUrl('/scenes')) {
        return Promise.resolve(
          jsonResponse([
            sceneResponse,
            creatorSceneResponse,
            unrelatedSceneResponse,
          ]),
        )
      }

      if (input === buildApiUrl('/scenes?tag=ambient')) {
        return Promise.resolve(jsonResponse([sceneResponse, tagSceneResponse]))
      }

      if (input === buildApiUrl('/scenes?tag=focus-friendly')) {
        return Promise.resolve(jsonResponse([sceneResponse, creatorSceneResponse]))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderSceneDetailPage()

    expect(await screen.findByRole('heading', { name: /aurora drift/i })).toBeInTheDocument()
    expect(screen.getByTestId('mage-player')).toHaveTextContent('player-ready')
    expect(screen.getByTestId('mage-player')).toHaveAttribute('data-playback', 'playing')
    expect(screen.getByRole('heading', { name: /comments/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upvote 416/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^show$/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /downvote/i }).length).toBeGreaterThan(0)
    expect(screen.getByText(/add a comment as scene artist/i)).toBeInTheDocument()
    expect(screen.getAllByText('Scene Artist').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/2,999 views/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /from scene artist/i })).toBeInTheDocument()
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
        buildApiUrl('/scenes/12'),
        expect.objectContaining({
          headers: expect.any(Headers),
        }),
      ),
    )

    const sceneRequestHeaders = fetchSpy.mock.calls[1][1]?.headers as Headers

    expect(sceneRequestHeaders.get('Authorization')).toBe('Bearer stored-auth-token')
  })

  it('shows a clear error state for an invalid scene route id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    renderSceneDetailPage(['/scenes/not-a-number'])

    expect(await screen.findByRole('heading', { name: /invalid scene link/i })).toBeInTheDocument()
    expect(screen.getByText(/missing a valid scene id/i)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows a not-found state when the scene request returns 404', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/scenes/12')) {
        return Promise.resolve(
          jsonResponse(
            {
              message: 'Scene not found.',
            },
            404,
          ),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderSceneDetailPage()

    expect(await screen.findByRole('heading', { name: /scene not found/i })).toBeInTheDocument()
    expect(screen.getByText(/does not exist or is no longer available/i)).toBeInTheDocument()
  })

  it('shows a sign-in-needed state when an unauthenticated scene request is rejected', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/scenes/12')) {
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

    renderSceneDetailPage()

    expect(await screen.findByRole('heading', { name: /sign in to view this scene/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to login/i })).toBeInTheDocument()
  })

  it('shows the real creator name for another users scene', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/scenes/44')) {
        return Promise.resolve(
          jsonResponse({
            sceneId: 44,
            ownerUserId: 77,
            creatorDisplayName: 'Peter',
            name: 'Test 3',
            sceneData: {
              visualizer: {
                shader: 'nebula',
              },
            },
            thumbnailRef: 'thumbnails/scene-44.png',
            createdAt: '2026-04-06T14:00:00Z',
            tags: ['chill'],
          }),
        )
      }

      if (input === buildApiUrl('/scenes')) {
        return Promise.resolve(
          jsonResponse([
            {
              sceneId: 44,
              ownerUserId: 77,
              creatorDisplayName: 'Peter',
              name: 'Test 3',
              sceneData: {
                visualizer: {
                  shader: 'nebula',
                },
              },
              thumbnailRef: 'thumbnails/scene-44.png',
              createdAt: '2026-04-06T14:00:00Z',
            },
            {
              sceneId: 45,
              ownerUserId: 77,
              creatorDisplayName: 'Peter',
              name: 'Pulse Coast',
              sceneData: {
                visualizer: {
                  shader: 'nebula',
                },
              },
              thumbnailRef: 'thumbnails/scene-45.png',
              createdAt: '2026-04-08T14:00:00Z',
            },
          ]),
        )
      }

      if (input === buildApiUrl('/scenes?tag=chill')) {
        return Promise.resolve(
          jsonResponse([
            {
              sceneId: 44,
              ownerUserId: 77,
              creatorDisplayName: 'Peter',
              name: 'Test 3',
              sceneData: {
                visualizer: {
                  shader: 'nebula',
                },
              },
              thumbnailRef: 'thumbnails/scene-44.png',
              createdAt: '2026-04-06T14:00:00Z',
            },
          ]),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderSceneDetailPage(['/scenes/44'])

    expect(await screen.findAllByText('Peter')).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: /from peter/i })).toBeInTheDocument()
    expect(screen.queryByText('Talia North')).not.toBeInTheDocument()
  })

  it('shows attached scene tags and routes to the filtered scenes grid when clicked', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/scenes/12')) {
        return Promise.resolve(jsonResponse(sceneResponse))
      }

      if (input === buildApiUrl('/scenes')) {
        return Promise.resolve(jsonResponse([sceneResponse, creatorSceneResponse]))
      }

      if (input === buildApiUrl('/scenes?tag=ambient')) {
        return Promise.resolve(jsonResponse([sceneResponse, tagSceneResponse]))
      }

      if (input === buildApiUrl('/scenes?tag=focus-friendly')) {
        return Promise.resolve(jsonResponse([sceneResponse, creatorSceneResponse]))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    const user = userEvent.setup()

    renderSceneDetailPage()

    await screen.findByRole('heading', { name: /aurora drift/i })
    await user.click(screen.getByRole('button', { name: /^show$/i }))

    const ambientTagLink = screen.getByRole('link', { name: /^ambient$/i })
    expect(ambientTagLink).toHaveAttribute('href', '/scenes?tag=ambient')
    expect(screen.getByRole('link', { name: /^focus-friendly$/i })).toHaveAttribute(
      'href',
      '/scenes?tag=focus-friendly',
    )

    await user.click(ambientTagLink)

    expect(await screen.findByTestId('scenes-route')).toHaveTextContent('?tag=ambient')
  })

  it('filters sidebar recommendations by creator and the current scene tags', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/scenes/12')) {
        return Promise.resolve(jsonResponse(sceneResponse))
      }

      if (input === buildApiUrl('/scenes')) {
        return Promise.resolve(
          jsonResponse([
            sceneResponse,
            creatorSceneResponse,
            unrelatedSceneResponse,
          ]),
        )
      }

      if (input === buildApiUrl('/scenes?tag=ambient')) {
        return Promise.resolve(jsonResponse([sceneResponse, tagSceneResponse]))
      }

      if (input === buildApiUrl('/scenes?tag=focus-friendly')) {
        return Promise.resolve(jsonResponse([sceneResponse, creatorSceneResponse]))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    const user = userEvent.setup()

    renderSceneDetailPage()

    expect(await screen.findByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /afterglow static/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /from scene artist/i }))

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

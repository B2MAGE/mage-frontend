import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import {
  AUTH_SESSION_STORAGE_KEY,
  AuthProvider,
  type AuthenticatedUser,
} from '@auth'
import { buildApiUrl } from '@lib/api'
import { SceneDetailPage } from '@modules/scene-detail'
import { LoginPage } from './LoginPage'
import { MyScenesPage } from './MyScenesPage'

vi.mock('@modules/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modules/player')>()

  return {
    ...actual,
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
  }
})

const storedUser: AuthenticatedUser = {
  userId: 8,
  email: 'artist@example.com',
  displayName: 'Scene Artist',
  authProvider: 'LOCAL',
}

const mockScenes = [
  {
    sceneId: 1,
    ownerUserId: 42,
    name: 'Aurora Drift',
    description: 'Soft teal bloom with low-end drift.',
    sceneData: {
      visualizer: { shader: 'nebula' },
    },
    thumbnailRef: 'thumbnails/scene-1.png',
    createdAt: '2026-04-06T14:00:00Z',
  },
  {
    sceneId: 2,
    ownerUserId: 42,
    name: 'Signal Bloom',
    sceneData: {
      visualizer: { shader: 'pulse' },
    },
    thumbnailRef: null,
    createdAt: '2026-04-06T14:10:00Z',
  },
  {
    sceneId: 3,
    ownerUserId: 42,
    name: 'Very Long Scene Name To Test Wrapping In The Card Layout',
    sceneData: {
      visualizer: { shader: 'glacier' },
    },
    thumbnailRef: 'thumbnails/scene-3.png',
    createdAt: '2026-04-06T14:20:00Z',
  },
]

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

function renderMyScenesPage(initialEntries = ['/my-scenes']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/my-scenes" element={<MyScenesPage />} />
          <Route path="/scenes/:id" element={<SceneDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('MyScenesPage', () => {
  it('redirects signed-out visitors to login', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    renderMyScenesPage()

    expect(await screen.findByRole('heading', { name: /login/i })).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows a loading state while scenes are being fetched', async () => {
    storeSession()

    let resolveScenesResponse: ((value: Response) => void) | undefined

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        return new Promise<Response>((resolve) => {
          resolveScenesResponse = resolve
        })
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderMyScenesPage()

    expect(await screen.findAllByText(/loading scenes/i)).not.toHaveLength(0)
    await waitFor(() => expect(resolveScenesResponse).toBeDefined())

    resolveScenesResponse?.(
      jsonResponse([]),
    )

    expect(await screen.findByText(/no scenes yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add sample scenes/i })).toBeInTheDocument()
  })

  it('renders the authenticated users scenes and opens the scene detail route', async () => {
    storeSession()

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        return Promise.resolve(
          jsonResponse([
            {
              id: 12,
              name: 'Aurora Drift',
              sceneData: {
                visualizer: { shader: 'nebula' },
              },
            },
            {
              id: 13,
              name: 'Signal Bloom',
            },
          ]),
        )
      }

      if (input === buildApiUrl('/scenes/12')) {
        return Promise.resolve(
          jsonResponse({
            sceneId: 12,
            ownerUserId: 8,
            name: 'Aurora Drift',
            sceneData: {
              visualizer: { shader: 'nebula' },
            },
            thumbnailRef: 'thumbnails/scene-12.png',
            createdAt: '2026-04-06T14:00:00Z',
          }),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })
    const user = userEvent.setup()

    renderMyScenesPage()

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        buildApiUrl('/users/8/scenes'),
        expect.objectContaining({
          headers: expect.any(Headers),
        }),
      ),
    )

    const sceneLink = await screen.findByRole('link', { name: /aurora drift/i })

    expect(screen.getByRole('link', { name: /signal bloom/i })).toBeInTheDocument()

    await user.click(sceneLink)

    expect(await screen.findByTestId('mage-player')).toHaveTextContent('player-ready')
    expect(screen.getByRole('heading', { name: /aurora drift/i })).toBeInTheDocument()
  })

  it('renders the populated scene state with thumbnails, fallback UI, and navigation', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        return Promise.resolve(jsonResponse(mockScenes))
      }

      if (input === buildApiUrl('/scenes/1')) {
        return Promise.resolve(
          jsonResponse({
            sceneId: 1,
            ownerUserId: 42,
            name: 'Aurora Drift',
            sceneData: {
              visualizer: { shader: 'nebula' },
            },
            thumbnailRef: 'thumbnails/scene-1.png',
            createdAt: '2026-04-06T14:00:00Z',
          }),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })
    const user = userEvent.setup()

    renderMyScenesPage()

    const auroraScene = await screen.findByRole('link', { name: /aurora drift/i })

    expect(auroraScene).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /very long scene name to test wrapping in the card layout/i }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Public')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Public' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /soft teal bloom with low-end drift\./i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /add description/i })).toHaveLength(2)
    expect(screen.getByAltText('Aurora Drift thumbnail')).toBeInTheDocument()
    expect(
      screen.getByAltText('Very Long Scene Name To Test Wrapping In The Card Layout thumbnail'),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('Signal Bloom thumbnail unavailable'),
    ).toBeInTheDocument()
    expect(screen.getByText('1-3 of 3')).toBeInTheDocument()

    const selectAllCheckbox = screen.getByRole('checkbox', {
      name: /select all scenes on this page/i,
    })

    await user.click(selectAllCheckbox)

    expect(screen.getByRole('checkbox', { name: /select aurora drift/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /select signal bloom/i })).toBeChecked()
    expect(
      screen.getByRole('checkbox', {
        name: /select very long scene name to test wrapping in the card layout/i,
      }),
    ).toBeChecked()

    await user.click(auroraScene)

    expect(await screen.findByTestId('mage-player')).toHaveTextContent('player-ready')
    expect(screen.getByRole('heading', { name: /aurora drift/i })).toBeInTheDocument()
  })

  it('shows empty and error states using simple messages', async () => {
    storeSession()

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        return Promise.resolve(
          jsonResponse(
            {
              message: 'Something went wrong.',
            },
            500,
          ),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderMyScenesPage()

    expect(
      await screen.findByText(/unable to load scenes right now\. please try again in a moment\./i),
    ).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('shows a description placeholder when no description is stored', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        return Promise.resolve(
          jsonResponse([
            {
              id: 31,
              name: 'Custom Shader Scene',
              description: null,
              sceneData: {
                visualizer: {
                  shader:
                    'let size = input() let pointerDown = input() time = 0.3*time rotateY(mouse.x * 2 * PI / 2 * (1+nsin(time)))',
                },
              },
              thumbnailRef: null,
              createdAt: '2026-04-06T14:00:00Z',
            },
          ]),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderMyScenesPage()

    expect(await screen.findByText('Custom Shader Scene')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add description/i })).toBeInTheDocument()
    expect(screen.queryByText(/let size = input/i)).not.toBeInTheDocument()
  })

  it('filters the table with the visible status pills', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        return Promise.resolve(jsonResponse(mockScenes))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })
    const user = userEvent.setup()

    renderMyScenesPage()

    expect(await screen.findByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Public' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Public' }))

    expect(screen.getByText('3 scenes')).toBeInTheDocument()
    expect(screen.getAllByText('Public')).toHaveLength(4)
  })

  it('sorts the table when updated, views, and likes headers are clicked', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        return Promise.resolve(
          jsonResponse([
            {
              id: 7,
              name: 'Signal Bloom',
              createdAt: '2026-04-06T14:10:00Z',
            },
            {
              id: 2,
              name: 'Aurora Drift',
              createdAt: '2026-04-06T14:00:00Z',
            },
            {
              id: 13,
              name: 'Solar Thread',
              createdAt: '2026-04-06T14:30:00Z',
            },
          ]),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })
    const user = userEvent.setup()

    renderMyScenesPage()

    await screen.findByRole('link', { name: /signal bloom/i })

    const titleLinks = () => screen.getAllByRole('link').filter((link) => /\/scenes\/\d+$/.test(link.getAttribute('href') ?? '') && !/Open scene preview/i.test(link.getAttribute('aria-label') ?? ''))

    expect(titleLinks().map((link) => link.textContent)).toEqual([
      'Solar Thread',
      'Signal Bloom',
      'Aurora Drift',
    ])
    expect(screen.getByText('Newest items first')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /sort by views descending/i }))

    expect(titleLinks().map((link) => link.textContent)).toEqual([
      'Solar Thread',
      'Signal Bloom',
      'Aurora Drift',
    ])
    expect(screen.getByText('Highest views first')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /sort by views ascending/i }))

    expect(titleLinks().map((link) => link.textContent)).toEqual([
      'Aurora Drift',
      'Signal Bloom',
      'Solar Thread',
    ])
    expect(screen.getByText('Lowest views first')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /sort by likes \(vs dislikes\) descending/i }))

    expect(titleLinks().map((link) => link.textContent)).toEqual([
      'Solar Thread',
      'Aurora Drift',
      'Signal Bloom',
    ])
    expect(screen.getByText('Highest likes ratio first')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /sort by updated descending/i }))
    await user.click(screen.getByRole('button', { name: /sort by updated ascending/i }))

    expect(titleLinks().map((link) => link.textContent)).toEqual([
      'Aurora Drift',
      'Signal Bloom',
      'Solar Thread',
    ])
    expect(screen.getByText('Oldest items first')).toBeInTheDocument()
  })

  it('paginates the table and shows the footer controls', async () => {
    storeSession()

    const paginatedScenes = Array.from({ length: 31 }, (_, index) => {
      const sceneNumber = index + 1
      const day = String(sceneNumber).padStart(2, '0')

      return {
        id: sceneNumber,
        name: `Scene ${sceneNumber}`,
        createdAt: `2026-04-${day}T14:00:00Z`,
      }
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        return Promise.resolve(jsonResponse(paginatedScenes))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })
    const user = userEvent.setup()

    renderMyScenesPage()

    expect(await screen.findByText('1-30 of 31')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scene 31' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Scene 1' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /go to next page/i }))

    expect(await screen.findByText('31-31 of 31')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scene 1' })).toBeInTheDocument()
  })

  it('adds sample scenes from the empty state and reloads the list', async () => {
    storeSession()

    const createdSceneBodies: Array<Record<string, unknown>> = []
    let sceneListRequestCount = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        sceneListRequestCount += 1

        return Promise.resolve(
          jsonResponse(
            sceneListRequestCount === 1
              ? []
              : [
                  {
                    id: 21,
                    name: 'Aurora Drift',
                    thumbnailRef: 'thumbnails/scene-21.png',
                  },
                  {
                    id: 22,
                    name: 'Signal Bloom',
                    thumbnailRef: null,
                  },
                  {
                    id: 23,
                    name: 'Glacier Echo',
                    thumbnailRef: 'thumbnails/scene-23.png',
                  },
                  {
                    id: 24,
                    name: 'Solar Thread',
                    thumbnailRef: 'thumbnails/scene-24.png',
                  },
                ],
          ),
        )
      }

      if (input === buildApiUrl('/scenes')) {
        createdSceneBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)

        return Promise.resolve(
          jsonResponse(
            {
              sceneId: 20 + createdSceneBodies.length,
            },
            201,
          ),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })
    const user = userEvent.setup()

    renderMyScenesPage()

    expect(await screen.findByText(/no scenes yet/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /add sample scenes/i }))

    expect(await screen.findByRole('link', { name: /aurora drift/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(createdSceneBodies).toHaveLength(4)
    expect(sceneListRequestCount).toBe(2)
    expect(createdSceneBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Aurora Drift',
          sceneData: expect.objectContaining({
            visualizer: expect.objectContaining({
              shader: 'nebula',
            }),
          }),
        }),
        expect.objectContaining({
          name: 'Signal Bloom',
          sceneData: expect.objectContaining({
            visualizer: expect.objectContaining({
              shader: 'pulse',
            }),
          }),
        }),
      ]),
    )
  })
})

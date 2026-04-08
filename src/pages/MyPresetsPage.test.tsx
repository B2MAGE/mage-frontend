import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const storedUser: AuthenticatedUser = {
  userId: 8,
  email: 'artist@example.com',
  displayName: 'Preset Artist',
  authProvider: 'LOCAL',
}

const mockPresets = [
  {
    presetId: 1,
    ownerUserId: 42,
    name: 'Aurora Drift',
    sceneData: {
      visualizer: { shader: 'nebula' },
    },
    thumbnailRef: 'thumbnails/preset-1.png',
    createdAt: '2026-04-06T14:00:00Z',
  },
  {
    presetId: 2,
    ownerUserId: 42,
    name: 'Signal Bloom',
    sceneData: {
      visualizer: { shader: 'pulse' },
    },
    thumbnailRef: null,
    createdAt: '2026-04-06T14:10:00Z',
  },
  {
    presetId: 3,
    ownerUserId: 42,
    name: 'Very Long Preset Name To Test Wrapping In The Card Layout',
    sceneData: {
      visualizer: { shader: 'glacier' },
    },
    thumbnailRef: 'thumbnails/preset-3.png',
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

function renderMyPresetsPage(initialEntries = ['/my-presets']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/my-presets" element={<MyPresetsPage />} />
          <Route path="/presets/:id" element={<PresetDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('MyPresetsPage', () => {
  it('redirects signed-out visitors to login', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    renderMyPresetsPage()

    expect(await screen.findByRole('heading', { name: /login/i })).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows a loading state while presets are being fetched', async () => {
    storeSession()

    let resolvePresetsResponse: ((value: Response) => void) | undefined

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/presets')) {
        return new Promise<Response>((resolve) => {
          resolvePresetsResponse = resolve
        })
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderMyPresetsPage()

    expect(await screen.findAllByText(/loading presets/i)).not.toHaveLength(0)
    await waitFor(() => expect(resolvePresetsResponse).toBeDefined())

    resolvePresetsResponse?.(
      jsonResponse([]),
    )

    expect(await screen.findByText(/no presets yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add sample presets/i })).toBeInTheDocument()
  })

  it('renders the authenticated users presets and opens the preset detail route', async () => {
    storeSession()

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/presets')) {
        return Promise.resolve(
          jsonResponse([
            {
              id: 12,
              name: 'Aurora Drift',
            },
            {
              id: 13,
              name: 'Signal Bloom',
            },
          ]),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })
    const user = userEvent.setup()

    renderMyPresetsPage()

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        buildApiUrl('/users/8/presets'),
        expect.objectContaining({
          headers: expect.any(Headers),
        }),
      ),
    )

    const presetLink = await screen.findByRole('link', { name: /aurora drift/i })

    expect(screen.getByRole('link', { name: /signal bloom/i })).toBeInTheDocument()

    await user.click(presetLink)

    expect(await screen.findByRole('heading', { name: /preset 12/i })).toBeInTheDocument()
  })

  it('renders the populated preset state with thumbnails, fallback UI, and navigation', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/presets')) {
        return Promise.resolve(jsonResponse(mockPresets))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })
    const user = userEvent.setup()

    renderMyPresetsPage()

    const auroraPreset = await screen.findByRole('link', { name: /aurora drift/i })

    expect(auroraPreset).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /very long preset name to test wrapping in the card layout/i }),
    ).toBeInTheDocument()
    expect(screen.getByAltText('Aurora Drift thumbnail')).toBeInTheDocument()
    expect(
      screen.getByAltText('Very Long Preset Name To Test Wrapping In The Card Layout thumbnail'),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('Signal Bloom thumbnail unavailable'),
    ).toBeInTheDocument()

    await user.click(auroraPreset)

    expect(await screen.findByRole('heading', { name: /preset 1/i })).toBeInTheDocument()
  })

  it('shows empty and error states using simple messages', async () => {
    storeSession()

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/presets')) {
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

    renderMyPresetsPage()

    expect(
      await screen.findByText(/unable to load presets right now\. please try again in a moment\./i),
    ).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('adds sample presets from the empty state and reloads the list', async () => {
    storeSession()

    const createdPresetBodies: Array<Record<string, unknown>> = []
    let presetListRequestCount = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/presets')) {
        presetListRequestCount += 1

        return Promise.resolve(
          jsonResponse(
            presetListRequestCount === 1
              ? []
              : [
                  {
                    id: 21,
                    name: 'Aurora Drift',
                    thumbnailRef: 'thumbnails/preset-21.png',
                  },
                  {
                    id: 22,
                    name: 'Signal Bloom',
                    thumbnailRef: null,
                  },
                  {
                    id: 23,
                    name: 'Glacier Echo',
                    thumbnailRef: 'thumbnails/preset-23.png',
                  },
                  {
                    id: 24,
                    name: 'Solar Thread',
                    thumbnailRef: 'thumbnails/preset-24.png',
                  },
                ],
          ),
        )
      }

      if (input === buildApiUrl('/presets')) {
        createdPresetBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)

        return Promise.resolve(
          jsonResponse(
            {
              presetId: 20 + createdPresetBodies.length,
            },
            201,
          ),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })
    const user = userEvent.setup()

    renderMyPresetsPage()

    expect(await screen.findByText(/no presets yet/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /add sample presets/i }))

    expect(await screen.findByRole('link', { name: /aurora drift/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(createdPresetBodies).toHaveLength(4)
    expect(presetListRequestCount).toBe(2)
    expect(createdPresetBodies).toEqual(
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

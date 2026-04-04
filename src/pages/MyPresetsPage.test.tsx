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
        return Promise.resolve(
          new Response(JSON.stringify(storedUser), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }),
        )
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
      new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )

    expect(await screen.findByText(/no presets yet/i)).toBeInTheDocument()
  })

  it('renders the authenticated users presets and opens the preset detail route', async () => {
    storeSession()

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(
          new Response(JSON.stringify(storedUser), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }),
        )
      }

      if (input === buildApiUrl('/users/8/presets')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 12,
                name: 'Aurora Drift',
              },
              {
                id: 13,
                name: 'Signal Bloom',
              },
            ]),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          ),
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

  it('shows empty and error states using simple messages', async () => {
    storeSession()

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(
          new Response(JSON.stringify(storedUser), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }),
        )
      }

      if (input === buildApiUrl('/users/8/presets')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              message: 'Something went wrong.',
            }),
            {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
              },
            },
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
})

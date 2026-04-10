import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import {
  AUTH_SESSION_STORAGE_KEY,
  AuthProvider,
  type AuthenticatedUser,
} from '../auth/AuthContext'
import { buildApiUrl } from '../lib/api'
import { CreatePresetPage } from './CreatePresetPage'

vi.mock('../components/MagePlayer', () => ({
  MagePlayer: ({ sceneBlob }: { sceneBlob: unknown }) => (
    <div data-testid="mage-player">{sceneBlob ? 'preview-ready' : 'no-preview'}</div>
  ),
}))

const storedUser: AuthenticatedUser = {
  userId: 8,
  email: 'artist@example.com',
  displayName: 'Preset Artist',
  authProvider: 'LOCAL',
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

function renderCreatePresetPage() {
  return render(
    <MemoryRouter initialEntries={['/create-preset']}>
      <AuthProvider>
        <Routes>
          <Route path="/create-preset" element={<CreatePresetPage />} />
          <Route path="/my-presets" element={<div>My Presets</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('CreatePresetPage', () => {
  it('renders the curated editor with the full section menu available', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderCreatePresetPage()

    expect(screen.getByRole('heading', { name: /create preset/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /basic/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^scene$/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^camera$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^motion$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^effects$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /pass order/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /advanced/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/scene data json/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/custom shader/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('mage-player')).toHaveTextContent('preview-ready')
  })

  it('renders interactive metadata controls beneath the preset name field', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderCreatePresetPage()

    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'A soft drifting preset for night scenes.' },
    })
    fireEvent.change(screen.getByLabelText(/playlists/i), {
      target: { value: 'ambient-atlas' },
    })
    fireEvent.change(screen.getByLabelText(/upload thumbnail file/i), {
      target: {
        files: [new File(['cover'], 'cover.png', { type: 'image/png' })],
      },
    })

    expect(screen.getByLabelText(/description/i)).toHaveValue(
      'A soft drifting preset for night scenes.',
    )
    expect(screen.getByLabelText(/playlists/i)).toHaveValue('ambient-atlas')
    expect(screen.getByText(/selected file:/i)).toBeInTheDocument()
    expect(screen.getByText(/cover\.png/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /a\/b testing/i })).not.toBeInTheDocument()
  })

  it('keeps the Motion section focused on the controls that affect the preset most directly', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderCreatePresetPage()

    fireEvent.change(screen.getByLabelText(/jump to section/i), { target: { value: 'motion' } })

    expect(screen.getByRole('heading', { name: /^motion$/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/auto rotate/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/distortion/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/rotation speed/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/time speed/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/smoothness/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/compression/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/intensity/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/interaction boost/i)).not.toBeInTheDocument()
  })

  it('splits pass ordering into its own section and groups effects into categorized cards', async () => {
    storeSession()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderCreatePresetPage()

    fireEvent.change(screen.getByLabelText(/jump to section/i), { target: { value: 'effects' } })

    expect(screen.getByRole('heading', { name: /^effects$/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^pass order$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^finish & output$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^channel & motion$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^color & tone$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^pattern & structure$/i })).toBeInTheDocument()
    expect(screen.getByText(/^gamma correction$/i)).toBeInTheDocument()
    expect(screen.getByText(/sharp digital breakups and instability/i)).toBeInTheDocument()
    expect(screen.queryByText(/^additional passes$/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/jump to section/i), { target: { value: 'pass-order' } })

    expect(screen.getByRole('heading', { name: /^pass order$/i })).toBeInTheDocument()
    expect(screen.getByText(/^output$/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^finish & output$/i })).not.toBeInTheDocument()
  })

  it('submits the structured scene data and converts degree controls back to radians', async () => {
    storeSession()

    let submittedBody: Record<string, unknown> | null = null

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/presets')) {
        submittedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        return Promise.resolve(jsonResponse({ presetId: 18 }, 201))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    const user = userEvent.setup()

    renderCreatePresetPage()

    await user.type(screen.getByLabelText(/preset name/i), 'Aurora Drift')
    fireEvent.change(screen.getByLabelText(/jump to section/i), { target: { value: 'camera' } })
    expect(screen.getByRole('heading', { name: /^camera$/i })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/camera tilt/i), { target: { value: '90' } })
    await user.click(screen.getByRole('button', { name: /create preset/i }))

    await waitFor(() => expect(submittedBody).not.toBeNull())

    if (!submittedBody) {
      throw new Error('Expected preset submission payload to be captured.')
    }

    const responseBody: { name: string; sceneData: Record<string, unknown> } = submittedBody
    const sceneData = responseBody.sceneData
    const intent = sceneData.intent as Record<string, number>
    const fx = sceneData.fx as Record<string, unknown>
    const passOrder = fx.passOrder as string[]

    expect(responseBody).toMatchObject({
      name: 'Aurora Drift',
    })
    expect(intent.camTilt).toBeCloseTo(Math.PI / 2, 5)
    expect(passOrder.at(-1)).toBe('outputPass')
    expect(await screen.findByText('My Presets')).toBeInTheDocument()
  })
})

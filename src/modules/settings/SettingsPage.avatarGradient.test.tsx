import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@theme'
import { SettingsPage } from './SettingsPage'

const savedUser = {
  authProvider: 'LOCAL',
  displayName: 'Ari Rivera',
  description: 'Scenes for slow evenings.',
  email: 'ari@example.com',
  firstName: 'Ari',
  handle: 'aririvera',
  lastName: 'Rivera',
  userId: 8,
}

let authState = {
  authenticatedFetch: vi.fn(),
  updateAuthenticatedUser: vi.fn(),
  user: { ...savedUser } as typeof savedUser & { avatarGradientStart?: string | null; avatarGradientEnd?: string | null },
}

vi.mock('@auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@auth')>(),
  useAuth: () => authState,
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings#profile']}>
      <ThemeProvider><SettingsPage /></ThemeProvider>
    </MemoryRouter>,
  )
}

function previewAvatar() {
  return within(screen.getByRole('group', { name: 'Profile preview' })).getByText('AR')
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('Settings avatar gradients', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    authState = {
      authenticatedFetch: vi.fn(),
      updateAuthenticatedUser: vi.fn(),
      user: { ...savedUser },
    }
  })

  it('starts with the shared default for existing users and offers six labeled preset buttons', () => {
    renderPage()

    const presets = within(screen.getByRole('group', { name: 'Gradient presets' }))
    expect(presets.getAllByRole('button')).toHaveLength(6)
    for (const name of ['MAGE', 'Twilight', 'Ocean', 'Forest', 'Ember', 'Rose']) {
      expect(presets.getByRole('button', { name })).toHaveAttribute('aria-pressed', name === 'MAGE' ? 'true' : 'false')
    }
    expect(screen.getByRole('textbox', { name: 'Start color' })).toHaveValue('#5c51ba')
    expect(screen.getByRole('textbox', { name: 'End color' })).toHaveValue('#264a48')
    expect(previewAvatar()).toHaveStyle({ backgroundImage: 'linear-gradient(145deg, #5c51ba, #264a48)' })
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(authState.authenticatedFetch).not.toHaveBeenCalled()
  })

  it('previews presets without saving and lets MAGE restore the original gradient', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Ocean' }))
    expect(screen.getByRole('button', { name: 'Ocean' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'MAGE' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('textbox', { name: 'Start color' })).toHaveValue('#286d9b')
    expect(screen.getByRole('textbox', { name: 'End color' })).toHaveValue('#23494f')
    expect(previewAvatar()).toHaveStyle({ backgroundImage: 'linear-gradient(145deg, #286d9b, #23494f)' })
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'MAGE' }))
    expect(previewAvatar()).toHaveStyle({ backgroundImage: 'linear-gradient(145deg, #5c51ba, #264a48)' })
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(authState.authenticatedFetch).not.toHaveBeenCalled()
    expect(authState.updateAuthenticatedUser).not.toHaveBeenCalled()
  })

  it('loads saved custom colors and supports the native color selectors with live preview', () => {
    authState.user = { ...savedUser, avatarGradientStart: '#ABCDEF', avatarGradientEnd: '#FFFFFF' }
    renderPage()

    expect(screen.getByRole('textbox', { name: 'Start color' })).toHaveValue('#abcdef')
    expect(screen.getByRole('textbox', { name: 'End color' })).toHaveValue('#ffffff')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(within(screen.getByRole('group', { name: 'Gradient presets' })).queryByRole('button', { pressed: true })).not.toBeInTheDocument()
    expect(previewAvatar()).toHaveStyle({ color: '#111318' })

    const startPicker = screen.getByLabelText('Choose start color')
    const endPicker = screen.getByLabelText('Choose end color')
    expect(startPicker).toHaveAttribute('type', 'color')
    expect(endPicker).toHaveAttribute('type', 'color')
    fireEvent.change(startPicker, { target: { value: '#112233' } })
    fireEvent.change(endPicker, { target: { value: '#223344' } })

    expect(screen.getByRole('textbox', { name: 'Start color' })).toHaveValue('#112233')
    expect(screen.getByRole('textbox', { name: 'End color' })).toHaveValue('#223344')
    expect(previewAvatar()).toHaveStyle({
      backgroundImage: 'linear-gradient(145deg, #112233, #223344)',
      color: '#f4f5f7',
    })
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    expect(authState.authenticatedFetch).not.toHaveBeenCalled()
  })

  it('saves custom hex colors with profile details and propagates returned colors to the authenticated account', async () => {
    const updatedUser = { ...savedUser, avatarGradientStart: '#1122aa', avatarGradientEnd: '#efabcd' }
    authState.authenticatedFetch.mockResolvedValue(jsonResponse(updatedUser))
    const user = userEvent.setup()
    renderPage()

    await user.clear(screen.getByRole('textbox', { name: 'Start color' }))
    await user.type(screen.getByRole('textbox', { name: 'Start color' }), '#1122AA')
    await user.clear(screen.getByRole('textbox', { name: 'End color' }))
    await user.type(screen.getByRole('textbox', { name: 'End color' }), '#EFABCD')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(authState.authenticatedFetch).toHaveBeenCalledWith('/users/me', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({
        firstName: 'Ari',
        lastName: 'Rivera',
        displayName: 'Ari Rivera',
        handle: '@aririvera',
        description: savedUser.description,
        avatarGradientStart: '#1122aa',
        avatarGradientEnd: '#efabcd',
      }),
    })))
    await waitFor(() => expect(authState.updateAuthenticatedUser).toHaveBeenCalledWith(updatedUser))
    expect(await screen.findByText('Profile details saved.')).toBeInTheDocument()
  })

  it.each(['Start color', 'End color'])('rejects an invalid %s before any request and clears the error when a preset is chosen', async (label) => {
    const user = userEvent.setup()
    renderPage()

    await user.clear(screen.getByRole('textbox', { name: label }))
    await user.type(screen.getByRole('textbox', { name: label }), '#bad')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const error = screen.getByRole('alert')
    expect(error).toHaveTextContent('Choose two colors using six-digit hex values, like #5c51ba.')
    expect(screen.getByRole('textbox', { name: label })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox', { name: label })).toHaveAccessibleDescription(error.textContent ?? '')
    expect(authState.authenticatedFetch).not.toHaveBeenCalled()
    expect(authState.updateAuthenticatedUser).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Rose' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: label })).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('button', { name: 'Rose' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('disables the gradient controls during saving and keeps the chosen colors when the backend rejects them', async () => {
    let finishSave!: (response: Response) => void
    authState.authenticatedFetch.mockReturnValue(new Promise<Response>((resolve) => { finishSave = resolve }))
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Ember' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByRole('group', { name: 'Avatar gradient' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'MAGE' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Start color' })).toBeDisabled()
    expect(screen.getByLabelText('Choose end color')).toBeDisabled()

    finishSave(jsonResponse({
      message: 'Request validation failed.',
      details: { avatarGradientEnd: 'Choose a valid end color.' },
    }, 400))

    expect(await screen.findByText('Choose a valid end color.')).toBeInTheDocument()
    expect(screen.getByText('Request validation failed.')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Avatar gradient' })).not.toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Start color' })).toHaveValue('#ab6645')
    expect(screen.getByRole('textbox', { name: 'End color' })).toHaveValue('#663d54')
    expect(authState.updateAuthenticatedUser).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Forest' }))
    expect(screen.queryByText('Choose a valid end color.')).not.toBeInTheDocument()
    expect(screen.queryByText('Request validation failed.')).not.toBeInTheDocument()
  })
})

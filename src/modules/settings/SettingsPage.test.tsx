import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_THEME_STORAGE_KEY, ThemeProvider } from '@theme'
import { ANIMATED_SCENE_THUMBNAILS_STORAGE_KEY } from '@shared/preferences'
import { SettingsPage } from './SettingsPage'
vi.mock('@modules/moderation', () => ({ ModeratorSettingsLink: () => null }))

let authState = {
  accessToken: null as string | null,
  authenticatedFetch: vi.fn(),
  completeLoginSession: vi.fn(),
  isAuthenticated: false,
  isRestoringSession: false,
  logout: vi.fn(),
  updateAuthenticatedUser: vi.fn(),
  user: null as null | {
    authProvider: string
    description?: string | null
    displayName: string
    email: string
    firstName?: string
    handle?: string
    lastName?: string
    userId: number | null
  },
}

vi.mock('@auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('@auth')>(),
  useAuth: () => authState,
}))

function renderSettingsPage() {
  return render(
    <ThemeProvider>
      <SettingsPage />
    </ThemeProvider>,
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    authState = {
      accessToken: null,
      authenticatedFetch: vi.fn(),
      completeLoginSession: vi.fn(),
      isAuthenticated: false,
      isRestoringSession: false,
      logout: vi.fn(),
      updateAuthenticatedUser: vi.fn(),
      user: null,
    }
  })

  it('renders the current account details and moved profile fields for a signed-in user', () => {
    authState = {
      ...authState,
      accessToken: 'token',
      isAuthenticated: true,
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        description: 'Audio-reactive scenes with a human touch.',
        email: 'artist@example.com',
        firstName: 'Scene',
        handle: 'sceneartist',
        lastName: 'Artist',
        userId: 8,
      },
    }

    renderSettingsPage()

    expect(screen.getByRole('heading', { name: /^settings$/i, level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /appearance/i, level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /profile details/i, level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /password/i, level: 2 })).toBeInTheDocument()
    expect(
      screen.getByText(
        /manage how MAGE looks on this device and update the account details tied to your profile/i,
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /mage pulse/i })).toHaveAttribute('aria-checked', 'true')
    const emailInput = screen.getByRole('textbox', { name: /^email$/i })
    const profilePreview = screen.getByRole('group', { name: /profile preview/i })

    expect(emailInput).toHaveValue('artist@example.com')
    expect(emailInput).toHaveAttribute('readonly')
    expect(emailInput.compareDocumentPosition(profilePreview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(profilePreview).getByText('Scene Artist')).toBeInTheDocument()
    expect(within(profilePreview).getByText('SA')).toHaveClass('user-avatar')
    expect(within(profilePreview).getByText('@sceneartist')).toBeInTheDocument()
    expect(within(profilePreview).queryByText('artist@example.com')).not.toBeInTheDocument()
    expect(screen.queryByText('Shown publicly on your scenes and comments.')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Scene')
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Scene Artist')
    expect(screen.getByLabelText(/^handle$/i)).toHaveValue('sceneartist')
    expect(screen.getByLabelText(/^handle$/i)).toHaveAttribute('maxlength', '30')
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Artist')
    expect(screen.getByLabelText(/^description$/i)).toHaveValue(
      'Audio-reactive scenes with a human touch.',
    )
    expect(screen.queryByText('LOCAL')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/verify new password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save password/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reset password/i })).not.toBeInTheDocument()
    expect(emailInput).not.toHaveAttribute('placeholder')
    const fieldPlaceholders = [
      ['Display name', 'John'],
      ['Handle', 'jdoe'],
      ['First name', 'John'],
      ['Last name', 'Doe'],
      ['Description', 'Tell people about the scenes you make.'],
      ['Current password', 'Enter current password'],
      ['New password', 'Enter new password'],
      ['Verify new password', 'Enter new password again'],
    ]

    fieldPlaceholders.forEach(([label, placeholder]) => {
      expect(screen.getByLabelText(label)).toHaveAttribute('placeholder', placeholder)
    })
    for (const label of ['Current password', 'New password', 'Verify new password']) {
      expect(screen.getByLabelText(label)).toHaveValue('')
    }
  })

  it('marks only public profile fields and associates their shared explanation without changing labels', async () => {
    const description = 'Audio-reactive scenes with a human touch.'
    authState = {
      ...authState,
      accessToken: 'token',
      isAuthenticated: true,
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        description,
        email: 'artist@example.com',
        firstName: 'Scene',
        handle: 'sceneartist',
        lastName: 'Artist',
        userId: 8,
      },
    }

    const user = userEvent.setup()
    const { container } = renderSettingsPage()
    const publicHint = screen.getByText('Shown on your public profile.')
    const saveButton = screen.getByRole('button', { name: /save changes/i })
    const profileActions = saveButton.closest('.settings-actions')
    const markerSelector = '.settings-public-field-marker'

    expect(profileActions).toBeInTheDocument()
    expect(publicHint.closest('.settings-actions')).toBe(profileActions)
    expect(publicHint.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(publicHint).toHaveAttribute('id', 'settings-public-profile-hint')
    expect(publicHint.querySelector(markerSelector)).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll(markerSelector)).toHaveLength(5)
    expect(container.querySelectorAll(`label ${markerSelector}`)).toHaveLength(3)
    const gradientPicker = screen.getByRole('group', { name: 'Avatar gradient' })
    expect(gradientPicker.querySelector(`legend ${markerSelector}`)).toHaveAttribute('aria-hidden', 'true')
    expect(gradientPicker).toHaveAccessibleDescription(/Shown on your public profile\./)

    for (const name of ['Display name', 'Handle', 'Description']) {
      const input = screen.getByRole('textbox', { name })
      const label = container.querySelector(`label[for="${input.id}"]`)

      expect(label?.querySelector(markerSelector)).toHaveAttribute('aria-hidden', 'true')
      expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(publicHint.id)
      expect(input).toHaveAccessibleDescription(/Shown on your public profile\./)
    }

    for (const name of ['Email', 'First name', 'Last name']) {
      const input = screen.getByRole('textbox', { name })
      const label = container.querySelector(`label[for="${input.id}"]`)

      expect(label?.querySelector(markerSelector)).toBeNull()
      expect(input.getAttribute('aria-describedby')?.split(' ') ?? []).not.toContain(publicHint.id)
    }

    const descriptionInput = screen.getByRole('textbox', { name: 'Description' })
    const descriptionCount = screen.getByText(`${description.length} / 300`)

    expect(descriptionCount.closest('.settings-actions')).toBeNull()
    expect(descriptionCount.closest('.field-group')).toBe(descriptionInput.closest('.field-group'))
    expect(descriptionInput.compareDocumentPosition(descriptionCount) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(descriptionCount).toHaveAttribute('id', 'settings-description-count')
    expect(descriptionInput.getAttribute('aria-describedby')?.split(' ')).toContain(descriptionCount.id)

    await user.clear(descriptionInput)
    await user.type(descriptionInput, 'New bio')

    expect(descriptionCount).toHaveTextContent('7 / 300')
    expect(descriptionInput).toHaveAccessibleDescription(/Shown on your public profile\. 7 \/ 300/)
  })

  it('persists the selected theme on this device', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      isAuthenticated: true,
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        description: 'Audio-reactive scenes with a human touch.',
        email: 'artist@example.com',
        firstName: 'Scene',
        handle: 'sceneartist',
        lastName: 'Artist',
        userId: 8,
      },
    }

    const user = userEvent.setup()

    renderSettingsPage()

    await user.click(screen.getByRole('radio', { name: /classic blue/i }))

    expect(screen.getByRole('radio', { name: /classic blue/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(document.documentElement.dataset.theme).toBe('classic-facebook')
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe('classic-facebook')
  })

  it('previews draft display names and handles while keeping email and the handle prefix fixed', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      isAuthenticated: true,
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        email: 'artist@example.com',
        firstName: 'Scene',
        handle: 'sceneartist',
        lastName: 'Artist',
        userId: 8,
      },
    }

    const user = userEvent.setup()

    renderSettingsPage()

    const preview = within(screen.getByRole('group', { name: /profile preview/i }))
    const displayNameInput = screen.getByLabelText(/display name/i)
    const handleInput = screen.getByLabelText(/^handle$/i)
    const emailInput = screen.getByRole('textbox', { name: /^email$/i })
    const handlePrefix = screen.getByText('@', { selector: 'span' })

    await user.type(emailInput, 'changed')

    expect(emailInput).toHaveValue('artist@example.com')

    await user.clear(displayNameInput)

    expect(displayNameInput).toHaveValue('')
    expect(displayNameInput).toHaveAttribute('placeholder', 'John')
    expect(preview.getByText('Display name')).toBeInTheDocument()
    expect(preview.getByText('MG')).toBeInTheDocument()

    await user.type(displayNameInput, 'New Artist')

    expect(preview.getByText('New Artist')).toBeInTheDocument()
    expect(preview.getByText('NA')).toBeInTheDocument()
    expect(preview.getByText('NA')).toHaveClass('user-avatar')
    expect(preview.queryByText('Scene Artist')).not.toBeInTheDocument()

    await user.clear(handleInput)
    await user.keyboard('{Backspace}')

    expect(handleInput).toHaveValue('')
    expect(handleInput).toHaveAttribute('placeholder', 'jdoe')
    expect(handlePrefix).toHaveTextContent('@')
    expect(handlePrefix).toHaveAttribute('aria-hidden', 'true')
    expect(preview.getByText('@handle')).toBeInTheDocument()

    await user.type(handleInput, 'new_artist')

    expect(preview.getByText('@new_artist')).toBeInTheDocument()

    await user.clear(handleInput)
    await user.paste(' @Updated_Artist ')

    expect(handleInput).toHaveValue('Updated_Artist')
    expect(preview.getByText('@Updated_Artist')).toBeInTheDocument()
    expect(handlePrefix).toBeInTheDocument()

    const longestValidHandle = 'a'.repeat(30)

    await user.clear(handleInput)
    await user.paste(`@${longestValidHandle}`)

    expect(handleInput).toHaveValue(longestValidHandle)
    expect(preview.getByText(`@${longestValidHandle}`)).toBeInTheDocument()
    expect(authState.authenticatedFetch).not.toHaveBeenCalled()
    expect(authState.updateAuthenticatedUser).not.toHaveBeenCalled()
  })

  it('enables animated scene thumbnails by default and saves the device preference', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      isAuthenticated: true,
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        description: 'Audio-reactive scenes with a human touch.',
        email: 'artist@example.com',
        firstName: 'Scene',
        handle: 'sceneartist',
        lastName: 'Artist',
        userId: 8,
      },
    }

    const user = userEvent.setup()

    renderSettingsPage()

    const animatedThumbnailSwitch = screen.getByRole('switch', {
      name: /animated scene thumbnails/i,
    })

    expect(animatedThumbnailSwitch).toBeChecked()

    await user.click(animatedThumbnailSwitch)

    expect(animatedThumbnailSwitch).not.toBeChecked()
    expect(window.localStorage.getItem(ANIMATED_SCENE_THUMBNAILS_STORAGE_KEY)).toBe('false')
  })

  it('saves updated profile details through the authenticated backend flow', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      authenticatedFetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            authProvider: 'LOCAL',
            displayName: 'Updated Artist',
            description: 'New profile description.',
            email: 'artist@example.com',
            firstName: 'Updated',
            handle: 'updated_artist',
            lastName: 'Artist',
            userId: 8,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      ),
      isAuthenticated: true,
      updateAuthenticatedUser: vi.fn(),
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        description: 'Audio-reactive scenes with a human touch.',
        email: 'artist@example.com',
        firstName: 'Scene',
        handle: 'sceneartist',
        lastName: 'Artist',
        userId: 8,
      },
    }

    const user = userEvent.setup()

    renderSettingsPage()

    await user.clear(screen.getByLabelText(/first name/i))
    await user.type(screen.getByLabelText(/first name/i), 'Updated')
    await user.clear(screen.getByLabelText(/display name/i))
    await user.type(screen.getByLabelText(/display name/i), 'Updated Artist')
    await user.clear(screen.getByLabelText(/^handle$/i))
    await user.type(screen.getByLabelText(/^handle$/i), ' @Updated_Artist ')
    await user.clear(screen.getByLabelText(/^description$/i))
    await user.type(screen.getByLabelText(/^description$/i), ' New profile description. ')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(authState.authenticatedFetch).toHaveBeenCalledWith(
        '/users/me',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            firstName: 'Updated',
            lastName: 'Artist',
            displayName: 'Updated Artist',
            handle: '@Updated_Artist',
            description: 'New profile description.',
            avatarGradientStart: '#5c51ba',
            avatarGradientEnd: '#264a48',
          }),
        }),
      ),
    )

    await waitFor(() =>
      expect(authState.updateAuthenticatedUser).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Updated',
          lastName: 'Artist',
          displayName: 'Updated Artist',
          handle: 'updated_artist',
          description: 'New profile description.',
        }),
      ),
    )

    expect(await screen.findByText('Profile details saved.')).toBeInTheDocument()
  })

  it('shows backend validation errors when submitted profile values are invalid', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      authenticatedFetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'Request validation failed.',
            details: {
              firstName: 'firstName must not be blank',
              lastName: 'lastName must not be blank',
              displayName: 'displayName must not be blank',
              handle: 'That handle is already in use.',
              description: 'description must be at most 300 characters',
            },
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      ),
      isAuthenticated: true,
      updateAuthenticatedUser: vi.fn(),
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        description: 'Audio-reactive scenes with a human touch.',
        email: 'artist@example.com',
        firstName: 'Scene',
        handle: 'sceneartist',
        lastName: 'Artist',
        userId: 8,
      },
    }

    const user = userEvent.setup()

    renderSettingsPage()

    await user.clear(screen.getByLabelText(/first name/i))
    await user.clear(screen.getByLabelText(/last name/i))
    await user.clear(screen.getByLabelText(/display name/i))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText('firstName must not be blank')).toBeInTheDocument()
    expect(screen.getByText('lastName must not be blank')).toBeInTheDocument()
    expect(screen.getByText('displayName must not be blank')).toBeInTheDocument()
    expect(screen.getByText('That handle is already in use.')).toBeInTheDocument()
    expect(screen.getByText('description must be at most 300 characters')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Description' }).getAttribute('aria-describedby')?.split(' ')).toEqual(
      expect.arrayContaining([
        'settings-public-profile-hint',
        'settings-description-count',
        'settings-description-error',
      ]),
    )
    expect(screen.getByText('Request validation failed.')).toBeInTheDocument()
    expect(authState.updateAuthenticatedUser).not.toHaveBeenCalled()
  })

  it('validates the required handle before saving profile details', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      authenticatedFetch: vi.fn(),
      isAuthenticated: true,
      updateAuthenticatedUser: vi.fn(),
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        description: null,
        email: 'artist@example.com',
        firstName: 'Scene',
        handle: 'sceneartist',
        lastName: 'Artist',
        userId: 8,
      },
    }

    const user = userEvent.setup()

    renderSettingsPage()

    await user.clear(screen.getByLabelText(/^handle$/i))
    await user.type(screen.getByLabelText(/^handle$/i), 'not valid')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(
      await screen.findByText('Use 3–30 letters, numbers, or underscores, starting with a letter.', { selector: '[role="alert"]' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/The @ is added automatically\./)).not.toBeInTheDocument()
    expect(authState.authenticatedFetch).not.toHaveBeenCalled()
    expect(authState.updateAuthenticatedUser).not.toHaveBeenCalled()
  })

  it('shows a clear error message when the save request fails', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      authenticatedFetch: vi.fn().mockRejectedValue(new Error('network down')),
      isAuthenticated: true,
      updateAuthenticatedUser: vi.fn(),
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        description: 'Audio-reactive scenes with a human touch.',
        email: 'artist@example.com',
        firstName: 'Scene',
        handle: 'sceneartist',
        lastName: 'Artist',
        userId: 8,
      },
    }

    const user = userEvent.setup()

    renderSettingsPage()

    await user.clear(screen.getByLabelText(/display name/i))
    await user.type(screen.getByLabelText(/display name/i), 'Updated Artist')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(
      await screen.findByText('Profile updates are unavailable right now. Please try again in a moment.'),
    ).toBeInTheDocument()
    expect(authState.updateAuthenticatedUser).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled()
  })

  it('changes a local account password through the authenticated backend flow', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      authenticatedFetch: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
      isAuthenticated: true,
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        description: 'Audio-reactive scenes with a human touch.',
        email: 'artist@example.com',
        firstName: 'Scene',
        handle: 'sceneartist',
        lastName: 'Artist',
        userId: 8,
      },
    }

    const user = userEvent.setup()

    renderSettingsPage()

    await user.type(screen.getByLabelText(/current password/i), 'current-secret')
    await user.type(screen.getByLabelText(/^new password$/i), 'new-secret-value')
    await user.type(screen.getByLabelText(/verify new password/i), 'new-secret-value')
    await user.click(screen.getByRole('button', { name: /save password/i }))

    await waitFor(() =>
      expect(authState.authenticatedFetch).toHaveBeenCalledWith(
        '/users/me/password',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            currentPassword: 'current-secret',
            newPassword: 'new-secret-value',
          }),
        }),
      ),
    )

    expect(await screen.findByText('Password updated.')).toBeInTheDocument()
    expect(screen.getByLabelText(/current password/i)).toHaveValue('')
    expect(screen.getByLabelText(/^new password$/i)).toHaveValue('')
    expect(screen.getByLabelText(/verify new password/i)).toHaveValue('')
  })

  it('validates password change fields before submitting', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      authenticatedFetch: vi.fn(),
      isAuthenticated: true,
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        description: 'Audio-reactive scenes with a human touch.',
        email: 'artist@example.com',
        firstName: 'Scene',
        handle: 'sceneartist',
        lastName: 'Artist',
        userId: 8,
      },
    }

    const user = userEvent.setup()

    renderSettingsPage()

    await user.click(screen.getByRole('button', { name: /save password/i }))

    expect(await screen.findByText('Current password is required.')).toBeInTheDocument()
    expect(screen.getByText('New password is required.')).toBeInTheDocument()
    expect(screen.getByText('Verify your new password.')).toBeInTheDocument()
    expect(authState.authenticatedFetch).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText(/current password/i), 'current-secret')
    await user.type(screen.getByLabelText(/^new password$/i), 'short')
    await user.type(screen.getByLabelText(/verify new password/i), 'different-value')
    await user.click(screen.getByRole('button', { name: /save password/i }))

    expect(
      await screen.findByText('New password must be between 8 and 72 characters.'),
    ).toBeInTheDocument()
    expect(screen.getByText('New passwords must match.')).toBeInTheDocument()
    expect(authState.authenticatedFetch).not.toHaveBeenCalled()
  })

  it('shows invalid current password errors on the current password field', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      authenticatedFetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'INVALID_CURRENT_PASSWORD',
            message: 'Current password is incorrect.',
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      ),
      isAuthenticated: true,
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        description: 'Audio-reactive scenes with a human touch.',
        email: 'artist@example.com',
        firstName: 'Scene',
        handle: 'sceneartist',
        lastName: 'Artist',
        userId: 8,
      },
    }

    const user = userEvent.setup()

    renderSettingsPage()

    await user.type(screen.getByLabelText(/current password/i), 'wrong-secret')
    await user.type(screen.getByLabelText(/^new password$/i), 'new-secret-value')
    await user.type(screen.getByLabelText(/verify new password/i), 'new-secret-value')
    await user.click(screen.getByRole('button', { name: /save password/i }))

    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument()
  })

  it('shows backend password validation and request failure messages clearly', async () => {
    authState = {
      ...authState,
      accessToken: 'token',
      authenticatedFetch: vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              message: 'Request validation failed.',
              details: {
                newPassword: 'newPassword must be between 8 and 72 characters',
              },
            }),
            {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
              },
            },
          ),
        )
        .mockRejectedValueOnce(new Error('network down')),
      isAuthenticated: true,
      user: {
        authProvider: 'LOCAL',
        displayName: 'Scene Artist',
        description: 'Audio-reactive scenes with a human touch.',
        email: 'artist@example.com',
        firstName: 'Scene',
        handle: 'sceneartist',
        lastName: 'Artist',
        userId: 8,
      },
    }

    const user = userEvent.setup()

    renderSettingsPage()

    await user.type(screen.getByLabelText(/current password/i), 'current-secret')
    await user.type(screen.getByLabelText(/^new password$/i), 'new-secret-value')
    await user.type(screen.getByLabelText(/verify new password/i), 'new-secret-value')
    await user.click(screen.getByRole('button', { name: /save password/i }))

    expect(
      await screen.findByText('newPassword must be between 8 and 72 characters'),
    ).toBeInTheDocument()
    expect(screen.getByText('Request validation failed.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/current password/i))
    await user.type(screen.getByLabelText(/current password/i), 'current-secret')
    await user.click(screen.getByRole('button', { name: /save password/i }))

    expect(
      await screen.findByText(
        'Password changes are unavailable right now. Please try again in a moment.',
      ),
    ).toBeInTheDocument()
  })

  it('shows an unsupported password state for Google-only users', () => {
    authState = {
      ...authState,
      accessToken: 'token',
      authenticatedFetch: vi.fn(),
      isAuthenticated: true,
      user: {
        authProvider: 'GOOGLE',
        displayName: 'Scene Artist',
        description: 'Audio-reactive scenes with a human touch.',
        email: 'artist@example.com',
        firstName: 'Scene',
        handle: 'sceneartist',
        lastName: 'Artist',
        userId: 8,
      },
    }

    renderSettingsPage()

    expect(
      screen.getByText('Password changes are managed by Google for this account.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save password/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reset password/i })).not.toBeInTheDocument()
  })

  it('shows a fallback state when the page cannot read a signed-in user', () => {
    renderSettingsPage()

    expect(screen.getByRole('heading', { name: /unable to open settings/i })).toBeInTheDocument()
    expect(
      screen.getByText(/could not find the signed-in account details needed to render this page/i),
    ).toBeInTheDocument()
  })
})

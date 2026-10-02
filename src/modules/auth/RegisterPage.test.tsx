import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@auth'
import { buildApiUrl } from '@shared/lib'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'

function renderRegisterPage() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/first name/i), ' Ada ')
  await user.type(screen.getByLabelText(/last name/i), ' Lovelace ')
  await user.type(screen.getByLabelText(/display name/i), ' Countess Ada ')
  await user.type(screen.getByLabelText(/^handle$/i), 'countess_ada')
  await user.type(screen.getByLabelText(/^email$/i), ' user@example.com ')
  await user.type(screen.getByLabelText(/^password$/i), 'secret-value')
  await user.type(screen.getByLabelText(/^confirm password$/i), 'secret-value')
}

describe('RegisterPage', () => {
  it('shows placeholders without prefilling profile fields and marks only public fields', () => {
    const { container } = renderRegisterPage()
    const email = screen.getByRole('textbox', { name: 'Email' })
    const preview = screen.getByRole('group', { name: 'Profile preview' })
    const displayName = screen.getByRole('textbox', { name: 'Display name' })
    const handle = screen.getByRole('textbox', { name: 'Handle' })
    const firstName = screen.getByRole('textbox', { name: 'First name' })
    const lastName = screen.getByRole('textbox', { name: 'Last name' })
    const publicHint = screen.getByText('Shown on your public profile.')
    const password = screen.getByLabelText(/^password$/i)
    const confirmation = screen.getByLabelText(/^confirm password$/i)
    const orderedElements = [email, preview, displayName, handle, firstName, lastName, publicHint, password, confirmation]

    orderedElements.slice(1).forEach((element, index) => {
      expect(orderedElements[index].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
    for (const input of [email, displayName, handle, firstName, lastName, password, confirmation]) {
      expect(input).toHaveValue('')
      expect(input).toBeRequired()
    }
    expect(email).toHaveAttribute('placeholder', 'you@example.com')
    expect(displayName).toHaveAttribute('placeholder', 'John')
    expect(handle).toHaveAttribute('placeholder', 'jdoe')
    expect(firstName).toHaveAttribute('placeholder', 'John')
    expect(lastName).toHaveAttribute('placeholder', 'Doe')
    expect(password).toHaveAttribute('placeholder', 'At least 8 characters')
    expect(confirmation).toHaveAttribute('placeholder', 'Enter your password again')
    expect(confirmation).toHaveAttribute('name', 'confirmPassword')
    expect(confirmation).toHaveAttribute('id', 'confirmPassword')
    expect(confirmation).toHaveAttribute('autocomplete', 'new-password')
    expect(confirmation).toHaveAttribute('type', 'password')
    expect(handle).toHaveAttribute('maxlength', '30')
    expect(within(preview).getByText('Display name')).toBeInTheDocument()
    expect(within(preview).getByText('@handle')).toBeInTheDocument()
    expect(within(preview).getByText('MG')).toBeInTheDocument()
    expect(within(preview).getByText('MG')).toHaveClass('user-avatar')
    expect(publicHint).toHaveAttribute('id', 'register-public-profile-hint')
    expect(container.querySelectorAll('label .settings-public-field-marker')).toHaveLength(2)
    expect(container.querySelectorAll('.settings-public-field-marker')).toHaveLength(3)
    for (const input of [displayName, handle]) {
      expect(container.querySelector(`label[for="${input.id}"] .settings-public-field-marker`)).toHaveAttribute('aria-hidden', 'true')
      expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(publicHint.id)
      expect(input).toHaveAccessibleDescription(/Shown on your public profile\./)
    }
    for (const input of [email, firstName, lastName, password, confirmation]) {
      expect(container.querySelector(`label[for="${input.id}"] .settings-public-field-marker`)).toBeNull()
      expect(input.getAttribute('aria-describedby')?.split(' ') ?? []).not.toContain(publicHint.id)
    }
    expect(screen.queryByText('This is the public name people will see on your scenes and comments.')).not.toBeInTheDocument()
  })

  it('previews draft names and handles with a fixed prefix and accepts pasted handles up to 30 characters', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()
    renderRegisterPage()
    const preview = within(screen.getByRole('group', { name: 'Profile preview' }))
    const displayName = screen.getByRole('textbox', { name: 'Display name' })
    const handle = screen.getByRole('textbox', { name: 'Handle' })
    const prefix = screen.getByText('@', { selector: 'span' })

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'artist@example.com')
    expect(preview.queryByText('artist@example.com')).not.toBeInTheDocument()
    await user.type(displayName, 'New Artist')
    expect(preview.getByText('New Artist')).toBeInTheDocument()
    expect(preview.getByText('NA')).toBeInTheDocument()
    await user.clear(displayName)
    expect(preview.getByText('Display name')).toBeInTheDocument()
    expect(preview.getByText('MG')).toBeInTheDocument()

    await user.click(handle)
    await user.keyboard('{Backspace}')
    expect(handle).toHaveValue('')
    expect(prefix).toHaveTextContent('@')
    expect(prefix).toHaveAttribute('aria-hidden', 'true')
    await user.type(handle, 'new_artist')
    expect(preview.getByText('@new_artist')).toBeInTheDocument()
    await user.clear(handle)
    await user.paste(' @Updated_Artist ')
    expect(handle).toHaveValue('Updated_Artist')
    expect(preview.getByText('@Updated_Artist')).toBeInTheDocument()

    const longestValidHandle = 'a'.repeat(30)
    await user.clear(handle)
    await user.paste(`@${longestValidHandle}`)
    expect(handle).toHaveValue(longestValidHandle)
    expect(preview.getByText(`@${longestValidHandle}`)).toBeInTheDocument()
    await user.type(handle, 'b')
    expect(handle).toHaveValue(longestValidHandle)
    expect(prefix).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('preserves the password value when showing and hiding it without submitting', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()
    renderRegisterPage()
    const password = screen.getByLabelText(/^password$/i)
    await user.type(password, 'secret-value')
    expect(password).toHaveAttribute('type', 'password')
    const showButton = screen.getByRole('button', { name: /^show$/i })
    expect(showButton).toHaveAttribute('aria-controls', password.id)
    expect(showButton).toHaveAttribute('aria-pressed', 'false')
    await user.click(showButton)
    expect(password).toHaveAttribute('type', 'text')
    expect(password).toHaveValue('secret-value')
    const hideButton = screen.getByRole('button', { name: /^hide$/i })
    expect(hideButton).toHaveAttribute('aria-pressed', 'true')
    await user.click(hideButton)
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveValue('secret-value')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows and hides the confirmation independently without submitting or changing either password', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()
    renderRegisterPage()
    const password = screen.getByLabelText(/^password$/i)
    const confirmation = screen.getByLabelText(/^confirm password$/i)
    await user.type(password, 'secret-value')
    await user.type(confirmation, 'secret-value')

    const showConfirmation = screen.getByRole('button', { name: 'Show password confirmation' })
    expect(showConfirmation).toHaveAttribute('aria-controls', confirmation.id)
    expect(showConfirmation).toHaveAttribute('aria-pressed', 'false')
    await user.click(showConfirmation)
    expect(confirmation).toHaveAttribute('type', 'text')
    expect(password).toHaveAttribute('type', 'password')

    const hideConfirmation = screen.getByRole('button', { name: 'Hide password confirmation' })
    expect(hideConfirmation).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: /^show$/i }))
    expect(password).toHaveAttribute('type', 'text')
    await user.click(hideConfirmation)
    expect(confirmation).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('type', 'text')
    expect(confirmation).toHaveValue('secret-value')
    expect(password).toHaveValue('secret-value')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('requires confirmation before submitting an otherwise valid form', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()
    renderRegisterPage()
    await fillValidForm(user)
    const confirmation = screen.getByLabelText(/^confirm password$/i)
    await user.clear(confirmation)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(screen.getByRole('alert')).toHaveTextContent('Confirm your password.')
    expect(confirmation).toHaveAttribute('aria-invalid', 'true')
    expect(confirmation).toHaveAccessibleDescription('Confirm your password.')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects a mismatched confirmation and clears the error when it is corrected', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()
    renderRegisterPage()
    await fillValidForm(user)
    const confirmation = screen.getByLabelText(/^confirm password$/i)
    await user.type(confirmation, '-different')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(screen.getByRole('alert')).toHaveTextContent('Passwords must match.')
    expect(confirmation).toHaveAttribute('aria-invalid', 'true')
    expect(confirmation).toHaveAccessibleDescription('Passwords must match.')
    expect(fetchSpy).not.toHaveBeenCalled()

    await user.clear(confirmation)
    await user.type(confirmation, 'secret-value')
    expect(screen.queryByText('Passwords must match.')).not.toBeInTheDocument()
    expect(confirmation).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('clears stale confirmation errors when the original password changes but validates again on submit', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()
    renderRegisterPage()
    await fillValidForm(user)
    const password = screen.getByLabelText(/^password$/i)
    await user.type(password, '-different')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(screen.getByText('Passwords must match.')).toBeInTheDocument()

    await user.type(password, '-still-different')
    expect(screen.queryByText('Passwords must match.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(screen.getByText('Passwords must match.')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()

    await user.clear(password)
    await user.type(password, 'secret-value')
    expect(screen.queryByText('Passwords must match.')).not.toBeInTheDocument()
  })

  it.each([' secret-value', 'secret-value '])('requires an exact match including whitespace for %j', async (passwordValue) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()
    renderRegisterPage()
    await fillValidForm(user)
    const password = screen.getByLabelText(/^password$/i)
    await user.clear(password)
    await user.type(password, passwordValue)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(screen.getByText('Passwords must match.')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('accepts identical passwords with whitespace unchanged and excludes confirmation from the API payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ email: 'user@example.com', created: true }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const user = userEvent.setup()
    renderRegisterPage()
    await fillValidForm(user)
    for (const input of [screen.getByLabelText(/^password$/i), screen.getByLabelText(/^confirm password$/i)]) {
      await user.clear(input)
      await user.type(input, ' secret-value ')
    }
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByRole('heading', { name: /^login$/i })).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))
    expect(payload.password).toBe(' secret-value ')
    expect(payload).not.toHaveProperty('confirmPassword')
  })

  it('shows client-side validation errors without calling the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()

    renderRegisterPage()

    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('First name is required.')).toBeInTheDocument()
    expect(screen.getByText('Last name is required.')).toBeInTheDocument()
    expect(screen.getByText('Display name is required.')).toBeInTheDocument()
    expect(screen.getByText('Handle is required.')).toBeInTheDocument()
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
    expect(screen.getByText('Confirm your password.')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('submits trimmed first name, last name, and display name values, disables the button while loading, and hands the user into login', async () => {
    let resolveResponse: ((value: Response) => void) | undefined
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        }),
    )
    const user = userEvent.setup()

    renderRegisterPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        buildApiUrl('/auth/register'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      ),
    )
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      displayName: 'Countess Ada',
      handle: '@countess_ada',
      email: 'user@example.com',
      password: 'secret-value',
    })
    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled()

    resolveResponse?.(
      new Response(JSON.stringify({ email: 'user@example.com', created: true }), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )

    expect(await screen.findByRole('heading', { name: /^login$/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('user@example.com')
    expect(
      screen.getByText('Account created. Sign in to open your profile.'),
    ).toBeInTheDocument()
  })

  it('shows backend conflict errors clearly to the user', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'An account already exists for that email address.',
        }),
        {
          status: 409,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )
    const user = userEvent.setup()

    renderRegisterPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(
      await screen.findByText('An account already exists for that email address.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account/i })).toBeEnabled()
  })

  it('maps backend validation details onto the form fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Registration failed. Please review your information and try again.',
          details: {
            firstName: 'firstName must not be blank',
            lastName: 'lastName must not be blank',
            displayName: 'displayName must not be blank',
            handle: 'That handle is already in use.',
            email: 'email must not be blank',
            password: 'password must not be blank',
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
    const user = userEvent.setup()

    renderRegisterPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('firstName must not be blank')).toBeInTheDocument()
    expect(screen.getByText('lastName must not be blank')).toBeInTheDocument()
    expect(screen.getByText('displayName must not be blank')).toBeInTheDocument()
    expect(screen.getByText('That handle is already in use.')).toBeInTheDocument()
    expect(screen.getByText('email must not be blank')).toBeInTheDocument()
    expect(screen.getByText('password must not be blank')).toBeInTheDocument()
    const handle = screen.getByRole('textbox', { name: 'Handle' })
    expect(handle).toHaveAttribute('aria-invalid', 'true')
    expect(handle.getAttribute('aria-describedby')?.split(' ')).toContain('register-public-profile-hint')
    expect(handle).toHaveAccessibleDescription(/That handle is already in use\./)
  })

  it('rejects invalid handle characters without requiring users to type the fixed @ prefix', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()

    renderRegisterPage()

    await fillValidForm(user)
    await user.clear(screen.getByLabelText(/handle/i))
    await user.type(screen.getByLabelText(/handle/i), 'two words')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(
      await screen.findByText('Use 3–30 letters, numbers, or underscores, starting with a letter.', { selector: '[role="alert"]' }),
    ).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

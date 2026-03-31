import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '../lib/api'
import { RegisterPage } from './RegisterPage'

function renderRegisterPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  )
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/display name/i), ' New User ')
  await user.type(screen.getByLabelText(/^email$/i), ' user@example.com ')
  await user.type(screen.getByLabelText(/password/i), 'secret-value')
}

describe('RegisterPage', () => {
  it('shows client-side validation errors without calling the API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = userEvent.setup()

    renderRegisterPage()

    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('Display name is required.')).toBeInTheDocument()
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('submits trimmed values, disables the button while loading, and shows success', async () => {
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

    expect(fetchSpy).toHaveBeenCalledWith(
      buildApiUrl('/auth/register'),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName: 'New User',
          email: 'user@example.com',
          password: 'secret-value',
        }),
      }),
    )
    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled()

    resolveResponse?.(
      new Response(JSON.stringify({ email: 'user@example.com', created: true }), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    )

    expect(
      await screen.findByRole('heading', { name: /your account request was submitted/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/registration for user@example.com completed successfully/i)).toBeInTheDocument()
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
            displayName: 'displayName must not be blank',
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

    expect(await screen.findByText('displayName must not be blank')).toBeInTheDocument()
    expect(screen.getByText('email must not be blank')).toBeInTheDocument()
    expect(screen.getByText('password must not be blank')).toBeInTheDocument()
  })
})

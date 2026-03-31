import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LoginPage } from './LoginPage'

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  it('renders email and password inputs', () => {
    renderLoginPage()

    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows required-field validation errors', async () => {
    const user = userEvent.setup()

    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
  })

  it('shows email format validation and success notice for valid input', async () => {
    const user = userEvent.setup()

    renderLoginPage()

    await user.type(screen.getByLabelText(/^email$/i), 'not-an-email')
    await user.type(screen.getByLabelText(/password/i), 'secret-value')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/^email$/i))
    await user.type(screen.getByLabelText(/^email$/i), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(
      await screen.findByText(/validation passed\. backend login integration can be connected/i),
    ).toBeInTheDocument()
  })
})

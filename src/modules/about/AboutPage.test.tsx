import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AboutPage } from './AboutPage'

let isAuthenticated = false
vi.mock('@auth', () => ({
  useAuth: () => ({ isAuthenticated }),
}))

vi.mock('./AboutScene', () => ({
  AboutScene: () => <div role="img" aria-label="Decorative MAGE scene" />,
}))

describe('AboutPage', () => {
  beforeEach(() => { isAuthenticated = false })

  it('introduces MAGE and offers discovery and sign-in links to signed-out visitors', () => {
    const { container } = render(<MemoryRouter><AboutPage /></MemoryRouter>)

    expect(screen.getByRole('heading', { level: 1, name: 'Music you can see.' })).toBeInTheDocument()
    expect(screen.getByText(/Musical Autonomous Generated Environments/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'What is a MAGE scene?' })).toBeInTheDocument()
    for (const title of ['Create', 'React', 'Share']) {
      expect(screen.getByRole('heading', { name: title, level: 3 })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Explore scenes' })).toHaveAttribute('href', '/scenes')
    expect(screen.getByRole('link', { name: 'Explore MAGE' })).toHaveAttribute('href', '/scenes')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: 'Create a scene' })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Decorative MAGE scene' })).toBeInTheDocument()
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveClass('ui-page-frame', 'ui-page-frame--wide')
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('ui-page-title')
    expect(screen.getByRole('link', { name: 'Explore scenes' })).toHaveClass('ui-button', 'ui-button--primary')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveClass('ui-button', 'ui-button--secondary')
    expect(container.querySelector('.about-hero')).toHaveClass('ui-panel', 'ui-panel--primary')
    expect(container.querySelectorAll('.about-principle.ui-panel--nested')).toHaveLength(3)
    expect(container.querySelector('.about-callout')).toHaveClass('ui-panel', 'ui-panel--quiet')
  })

  it('offers the scene studio to signed-in visitors instead of signing in', () => {
    isAuthenticated = true
    render(<MemoryRouter><AboutPage /></MemoryRouter>)

    expect(screen.getByRole('link', { name: 'Create a scene' })).toHaveAttribute('href', '/create-scene')
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore scenes' })).toHaveAttribute('href', '/scenes')
    expect(screen.getByRole('link', { name: 'Explore MAGE' })).toHaveAttribute('href', '/scenes')
  })
})

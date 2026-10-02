import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppIcon } from './AppIcon'

describe('AppIcon', () => {
  it.each(['plus', 'heart', 'chevron-down', 'grip-vertical'] as const)('renders %s from Lucide with shared defaults', (name) => {
    const { container } = render(<button aria-label="Action"><AppIcon name={name} /></button>)
    const svg = container.querySelector('svg')
    expect(svg).toHaveClass('lucide', `lucide-${name}`, 'app-icon')
    expect(svg).toHaveAttribute('width', '20')
    expect(svg).toHaveAttribute('height', '20')
    expect(svg).toHaveAttribute('stroke-width', '2')
    expect(svg).toHaveAttribute('stroke', 'currentColor')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
  })

  it.each(['play', 'pause'] as const)('fills the %s icon for readable playback controls', (name) => {
    const { container } = render(<AppIcon name={name} />)
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
  })

  it('allows contextual sizes and filled selected states without altering the drawing', () => {
    const { container, rerender } = render(<AppIcon name="heart" size={22} className="selected-icon" />)
    const svg = container.querySelector('svg')
    const path = container.querySelector('path')
    expect(svg).toHaveAttribute('width', '22')
    expect(svg).toHaveClass('selected-icon')
    rerender(<AppIcon name="heart" size={22} className="selected-icon" fill="currentColor" />)
    expect(container.querySelector('svg')).toBe(svg)
    expect(container.querySelector('path')).toBe(path)
    expect(svg).toHaveAttribute('fill', 'currentColor')
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SceneAvailabilityPanel } from './SceneAvailabilityPanel'

describe('scene availability presentation', () => {
  it.each(['/scene-preview.png', null])('announces policy denial without offering retry, with poster %s', posterUrl => {
    const { container } = render(<SceneAvailabilityPanel posterUrl={posterUrl} message="This scene is currently unavailable." />)
    const player = screen.getByRole('region', { name: 'Playback unavailable' })
    expect(player).toHaveAccessibleDescription('This scene is currently unavailable.')
    expect(screen.getByRole('status')).toHaveTextContent('This scene is currently unavailable.')
    expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument()
    for (const control of screen.getAllByRole('button')) expect(control).toBeDisabled()
    expect(screen.getByRole('slider', { name: 'Seek scene audio' })).toBeDisabled()
    expect(container.querySelector('canvas, iframe')).not.toBeInTheDocument()
    const poster = container.querySelector('img')
    if (posterUrl) {
      expect(poster).toHaveAttribute('src', posterUrl)
      expect(poster).toHaveAttribute('alt', '')
    } else {
      expect(poster).not.toBeInTheDocument()
    }
  })

  it('supports keyboard rechecking after a temporary connection failure and disables duplicate requests', async () => {
    const onCheck = vi.fn()
    const view = render(<SceneAvailabilityPanel message="Playback couldn’t be checked. Please try again." onCheck={onCheck} />)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Check again' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onCheck).toHaveBeenCalledTimes(1)

    view.rerender(<SceneAvailabilityPanel message="Checking whether this scene can play…" onCheck={onCheck} checking />)
    expect(screen.getByRole('region', { name: 'Checking playback' })).toHaveAccessibleDescription('Checking whether this scene can play…')
    expect(screen.getByRole('button', { name: 'Check again' })).toBeDisabled()
    await userEvent.keyboard('{Enter}')
    expect(onCheck).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])('keeps the full player controls visible and disabled while unavailable or checking (%s)', checking => {
    const onCheck = vi.fn()
    render(<SceneAvailabilityPanel message="This scene is currently unavailable." checking={checking}
      onCheck={onCheck} audioMode="single" />)

    expect(screen.getByText('No song selected')).toBeInTheDocument()
    for (const control of screen.getAllByRole('button').filter(button => button.textContent !== 'Check again')) {
      expect(control).toBeDisabled()
    }
    expect(screen.getByRole('slider', { name: 'Seek scene audio' })).toBeDisabled()
    expect(onCheck).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('This scene is currently unavailable.')
  })
})

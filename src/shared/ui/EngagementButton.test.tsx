import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EngagementButton } from './EngagementButton'

describe('EngagementButton', () => {
  it.each([
    ['upvote', 'upvote'],
    ['downvote', 'downvote'],
    ['save', 'save'],
  ] as const)('renders the %s SVG', (kind, iconName) => {
    const { container } = render(
      <EngagementButton ariaLabel={kind} count={3} kind={kind} />,
    )

    expect(container.querySelector('svg')).toHaveAttribute('data-icon', iconName)
  })

  it('keeps the icon and count mounted while the busy spinner is overlaid', () => {
    const { container, rerender } = render(
      <EngagementButton ariaLabel="Upvote 12" count="12" kind="upvote" />,
    )
    const icon = container.querySelector('.engagement-button__icon')
    const count = container.querySelector('.engagement-button__count')

    rerender(
      <EngagementButton
        ariaLabel="Upvote 12"
        count="12"
        isBusy
        kind="upvote"
      />,
    )

    expect(container.querySelector('.engagement-button__icon')).toBe(icon)
    expect(container.querySelector('.engagement-button__count')).toBe(count)
    expect(count).toHaveTextContent('12')
    expect(container.querySelector('.engagement-button__icon-visual')).toHaveAttribute(
      'data-visible',
      'false',
    )
    expect(container.querySelector('.engagement-button__count')).toBeVisible()
    expect(container.querySelector('.engagement-button__spinner')).toHaveAttribute(
      'data-visible',
      'true',
    )
  })

  it('fills the same heart path when selected', () => {
    const { container, rerender } = render(
      <EngagementButton ariaLabel="Save 2" count={2} kind="save" />,
    )
    const heartPath = container.querySelector('path')
    const pathData = heartPath?.getAttribute('d')

    expect(heartPath).toHaveAttribute('fill', 'none')

    rerender(
      <EngagementButton
        ariaLabel="Saved 2"
        count={2}
        isSelected
        kind="save"
      />,
    )

    expect(container.querySelector('path')).toBe(heartPath)
    expect(heartPath).toHaveAttribute('d', pathData)
    expect(heartPath).toHaveAttribute('fill', 'currentColor')
  })

  it('forwards its accessible state, styling hook, and click handler', () => {
    const onClick = vi.fn()
    render(
      <EngagementButton
        ariaLabel="Downvote 7"
        className="custom-button"
        count={7}
        isBusy
        isSelected
        kind="downvote"
        onClick={onClick}
      />,
    )

    const button = screen.getByRole('button', { name: 'Downvote 7' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveClass('engagement-button', 'custom-button', 'is-selected')

    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('uses a dedicated count container for stable numeric sizing', () => {
    const { container } = render(
      <EngagementButton ariaLabel="Upvote 1.2K" count="1.2K" kind="upvote" />,
    )

    expect(container.querySelector('.engagement-button__count')).toHaveTextContent(
      '1.2K',
    )
  })
})

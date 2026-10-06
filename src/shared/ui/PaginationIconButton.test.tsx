import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaginationIconButton } from './PaginationIconButton'

describe('PaginationIconButton', () => {
  it('uses the shared pagination treatment while preserving page styling hooks', () => {
    const { container } = render(
      <PaginationIconButton
        className="profile-pagination__button"
        direction="right"
        label="Next page"
      />,
    )

    expect(screen.getByRole('button', { name: 'Next page' })).toHaveClass(
      'ui-pagination-button',
      'profile-pagination__button',
    )
    expect(container.querySelector('.ui-pagination-button__icon')).toHaveAttribute('aria-hidden', 'true')
  })
})

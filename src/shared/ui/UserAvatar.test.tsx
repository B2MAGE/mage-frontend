import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UserAvatar } from './UserAvatar'

describe('UserAvatar', () => {
  it('renders decorative initials with the shared avatar class', () => {
    render(<a href="/@aririvera"><UserAvatar initials="AR" />Ari Rivera</a>)
    const avatar = screen.getByText('AR')

    expect(avatar.tagName).toBe('SPAN')
    expect(avatar).toHaveClass('user-avatar')
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
    expect(avatar).not.toHaveAttribute('tabindex')
    expect(screen.getByRole('link', { name: 'Ari Rivera' })).toHaveAttribute('href', '/@aririvera')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('keeps caller classes and updates initials without losing shared styling', () => {
    const view = render(<UserAvatar initials="AR" className="profile-avatar example-avatar" />)
    expect(screen.getByText('AR')).toHaveClass('user-avatar', 'profile-avatar', 'example-avatar')

    view.rerender(<UserAvatar initials="NA" className="profile-avatar example-avatar" />)

    expect(screen.queryByText('AR')).not.toBeInTheDocument()
    expect(screen.getByText('NA')).toHaveClass('user-avatar', 'profile-avatar', 'example-avatar')
    expect(screen.getByText('NA')).toHaveAttribute('aria-hidden', 'true')
  })
})

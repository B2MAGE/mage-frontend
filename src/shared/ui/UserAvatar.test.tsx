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

  it('uses the shared default gradient when saved colors are absent or invalid', () => {
    const view = render(<UserAvatar initials="AR" />)
    expect(screen.getByText('AR')).toHaveStyle({
      backgroundImage: 'linear-gradient(145deg, #5c51ba, #264a48)',
      color: '#f4f5f7',
    })

    view.rerender(<UserAvatar initials="AR" gradientStart="invalid" gradientEnd={null} />)
    expect(screen.getByText('AR')).toHaveStyle({ backgroundImage: 'linear-gradient(145deg, #5c51ba, #264a48)' })
  })

  it('renders and updates custom colors while adapting initials contrast', () => {
    const view = render(<UserAvatar initials="AR" gradientStart="#ABCDEF" gradientEnd="#FFFFFF" />)
    expect(screen.getByText('AR')).toHaveStyle({
      backgroundImage: 'linear-gradient(145deg, #abcdef, #ffffff)',
      color: '#111318',
    })

    view.rerender(<UserAvatar initials="AR" gradientStart="#112233" gradientEnd="#223344" />)
    expect(screen.getByText('AR')).toHaveStyle({
      backgroundImage: 'linear-gradient(145deg, #112233, #223344)',
      color: '#f4f5f7',
    })
  })
})

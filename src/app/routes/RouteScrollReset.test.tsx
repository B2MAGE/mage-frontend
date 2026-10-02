import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteScrollReset } from './RouteScrollReset'

function NavigationFixture() {
  const navigate = useNavigate()
  const [count, setCount] = useState(0)

  return (
    <>
      <RouteScrollReset />
      <Link to="/scenes/42">Open scene</Link>
      <Link to="/scenes/59">Related scene</Link>
      <Link to="/@kaitanaka">Comment author</Link>
      <Link to="/scenes?sort=most-viewed">Change sort</Link>
      <Link to="/scenes/42#comments">Jump to comments</Link>
      <Link to="/settings#profile">Edit profile</Link>
      <button onClick={() => navigate('/scenes/59', { replace: true })}>Replace scene</button>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
      <button onClick={() => setCount(count + 1)}>Vote {count}</button>
    </>
  )
}

function renderNavigation(path = '/scenes') {
  return render(<MemoryRouter initialEntries={[path]}><NavigationFixture /></MemoryRouter>)
}

describe('route scroll reset', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  it('resets scroll immediately when opening a scene and another related scene', async () => {
    const user = userEvent.setup()
    renderNavigation()
    expect(window.scrollTo).not.toHaveBeenCalled()

    await user.click(screen.getByRole('link', { name: 'Open scene' }))
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'instant' })
    await user.click(screen.getByRole('link', { name: 'Related scene' }))
    expect(window.scrollTo).toHaveBeenCalledTimes(2)
  })

  it('starts a clicked comment author profile at the top too', async () => {
    const user = userEvent.setup()
    renderNavigation('/scenes/42')
    await user.click(screen.getByRole('link', { name: 'Comment author' }))
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, left: 0, behavior: 'instant' })
  })

  it('does not override initial visits, query-only changes, or component updates', async () => {
    const user = userEvent.setup()
    renderNavigation()
    await user.click(screen.getByRole('link', { name: 'Change sort' }))
    await user.click(screen.getByRole('button', { name: 'Vote 0' }))
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('does not override anchor navigation on the same page or another page', async () => {
    const user = userEvent.setup()
    renderNavigation('/scenes/42')
    await user.click(screen.getByRole('link', { name: 'Jump to comments' }))
    await user.click(screen.getByRole('link', { name: 'Edit profile' }))
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('leaves Back and Forward scroll restoration alone', async () => {
    const user = userEvent.setup()
    renderNavigation()
    await user.click(screen.getByRole('link', { name: 'Open scene' }))
    vi.mocked(window.scrollTo).mockClear()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByRole('button', { name: 'Forward' }))
    expect(window.scrollTo).not.toHaveBeenCalled()

    await user.click(screen.getByRole('link', { name: 'Related scene' }))
    expect(window.scrollTo).toHaveBeenCalledTimes(1)
  })

  it('resets for a replacement navigation to a different page', async () => {
    const user = userEvent.setup()
    renderNavigation('/scenes/42')
    await user.click(screen.getByRole('button', { name: 'Replace scene' }))
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, left: 0, behavior: 'instant' })
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DiscoverySceneCard } from './DiscoverySceneCard'
import type { DiscoveryScene } from '../types'

vi.mock('./useSceneHoverPreview', () => ({
  useSceneHoverPreview: () => ({ thumbnailRef: { current: null } }),
}))

const scene: DiscoveryScene = {
  sceneId: 17,
  ownerUserId: 4,
  creatorDisplayName: 'Ari Rivera',
  creatorHandle: 'aririvera',
  name: 'Signal Bloom',
  description: null,
  sceneData: {},
  thumbnailRef: '/signal.png',
  createdAt: '2026-09-28T12:00:00Z',
  engagement: { views: 18, upvotes: 4, downvotes: 0, saves: 2, currentUserVote: null, currentUserSaved: false },
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function show(handle: string | null | undefined = scene.creatorHandle) {
  return render(<MemoryRouter initialEntries={['/scenes']}>
    <DiscoverySceneCard scene={{ ...scene, creatorHandle: handle }} />
    <LocationProbe />
  </MemoryRouter>)
}

describe('Scene card creator navigation', () => {
  it('has separate scene and creator links without nesting anchors', async () => {
    const user = userEvent.setup()
    const { container } = show()
    const sceneLink = screen.getByRole('link', { name: 'Signal Bloom' })
    const creatorLink = screen.getByRole('link', { name: 'Ari Rivera' })
    expect(sceneLink).toHaveAttribute('href', '/scenes/17')
    expect(creatorLink).toHaveAttribute('href', '/@aririvera')
    expect(container.querySelector('a a')).toBeNull()
    expect(container.querySelector('.scene-card__play .app-icon')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.scene-card__play .app-icon')).toHaveAttribute('width', '16')

    await user.click(creatorLink)
    expect(screen.getByTestId('location')).toHaveTextContent('/@aririvera')
    await user.click(sceneLink)
    expect(screen.getByTestId('location')).toHaveTextContent('/scenes/17')
  })

  it('lets keyboard users focus and activate the creator independently', async () => {
    const user = userEvent.setup()
    show()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Signal Bloom' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Ari Rivera' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('location')).toHaveTextContent('/@aririvera')
  })

  it('normalizes the creator handle without using the display name as an address', () => {
    show(' @AriRivera ')
    expect(screen.getByRole('link', { name: 'Ari Rivera' })).toHaveAttribute('href', '/@aririvera')
  })

  it.each([null, '', 'not/a/handle'])('keeps a plain creator name when the handle is %s', (handle) => {
    show(handle)
    expect(screen.getByText('Ari Rivera')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ari Rivera' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })
})

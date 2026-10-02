import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { RecommendedSceneCard } from '../types'
import { SceneRecommendationRail } from './SceneRecommendationRail'

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderRail(overrides: Partial<RecommendedSceneCard> = {}) {
  return render(
    <MemoryRouter initialEntries={['/scenes/1']}>
      <SceneRecommendationRail
        creatorDisplayName="Ari Rivera"
        currentSceneTags={[]}
        isLoading={false}
        isPlaylistOpen={false}
        onClosePlaylist={vi.fn()}
        onPlaylistNameChange={vi.fn()}
        onReorderTracks={vi.fn()}
        onRemoveTrack={vi.fn()}
        onSelectFilter={vi.fn()}
        onSelectTrack={vi.fn()}
        onToggleRepeat={vi.fn()}
        onToggleShuffle={vi.fn()}
        onUpdateTrack={vi.fn()}
        playlistName="My playlist"
        playlistTracks={[]}
        recommendedScenes={[{
          id: 2,
          title: 'Quiet Orbit',
          creator: 'Ari Rivera',
          creatorHandle: 'aririvera',
          meta: '10 views | 1 day ago',
          accent: '#63f0d6',
          thumbnailRef: '/quiet-orbit.png',
          ownerUserId: 1,
          ...overrides,
        }]}
        recommendationFilter="all"
        repeatEnabled={false}
        selectedTrackId={null}
        shuffleEnabled={false}
      />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('SceneRecommendationRail creator links', () => {
  it('keeps separate scene and profile links without nested anchors', () => {
    const { container } = renderRail()

    expect(screen.getByRole('link', { name: 'Quiet Orbit' })).toHaveAttribute('href', '/scenes/2')
    expect(screen.getByRole('link', { name: 'Ari Rivera' })).toHaveAttribute('href', '/@aririvera')
    expect(screen.getByRole('img', { name: 'Quiet Orbit thumbnail' })).toBeInTheDocument()
    expect(container.querySelector('a a')).toBeNull()
  })

  it('opens the creator profile when their display name is clicked', async () => {
    const user = userEvent.setup()
    renderRail()

    await user.click(screen.getByRole('link', { name: 'Ari Rivera' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/@aririvera')
  })

  it('allows keyboard activation of the profile link and preserves scene navigation', async () => {
    const user = userEvent.setup()
    renderRail()

    const sceneLink = screen.getByRole('link', { name: 'Quiet Orbit' })
    sceneLink.focus()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Ari Rivera' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('location')).toHaveTextContent('/@aririvera')

    await user.click(sceneLink)
    expect(screen.getByTestId('location')).toHaveTextContent('/scenes/2')
  })

  it('keeps a creator without a handle as plain text', () => {
    renderRail({ creatorHandle: null })

    expect(screen.getByText('Ari Rivera')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ari Rivera' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Quiet Orbit' })).toHaveAttribute('href', '/scenes/2')
  })
})

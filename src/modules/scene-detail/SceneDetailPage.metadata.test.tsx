import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@lib/api'
import { jsonResponse } from '@shared/test/http'
import {
  buildSceneDetailResponse,
  buildSceneDetailStoredUser,
  renderSceneDetailPage,
  storeSceneDetailSession,
} from './test-fixtures'

vi.mock('@modules/player', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@modules/player')>()

  return {
    ...actual,
    MagePlayer: ({
      ariaLabel,
      className,
      sceneBlob,
    }: {
      ariaLabel?: string
      className?: string
      sceneBlob: unknown
    }) => (
      <div aria-label={ariaLabel} className={className} data-testid="mage-player">
        {sceneBlob ? 'player-ready' : 'no-scene'}
      </div>
    ),
  }
})

describe('SceneDetailPage metadata', () => {
  it('shows the real creator name for another users scene', async () => {
    storeSceneDetailSession()

    const storedUser = buildSceneDetailStoredUser()
    const creatorScene = buildSceneDetailResponse({
      creatorDisplayName: 'Peter',
      name: 'Test 3',
      ownerUserId: 77,
      sceneId: 44,
      tags: ['chill'],
      thumbnailRef: 'thumbnails/scene-44.png',
    })
    const relatedScene = buildSceneDetailResponse({
      creatorDisplayName: 'Peter',
      createdAt: '2026-04-08T14:00:00Z',
      name: 'Pulse Coast',
      ownerUserId: 77,
      sceneId: 45,
      tags: [],
      thumbnailRef: 'thumbnails/scene-45.png',
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/scenes/44')) {
        return Promise.resolve(jsonResponse(creatorScene))
      }

      if (input === buildApiUrl('/scenes')) {
        return Promise.resolve(jsonResponse([creatorScene, relatedScene]))
      }

      if (input === buildApiUrl('/scenes?tag=chill')) {
        return Promise.resolve(jsonResponse([creatorScene]))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderSceneDetailPage(['/scenes/44'])

    expect(await screen.findAllByText('Peter')).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: /from peter/i })).toBeInTheDocument()
    expect(screen.queryByText('Talia North')).not.toBeInTheDocument()
  })

  it('shows attached scene tags and routes to the filtered scenes grid when clicked', async () => {
    storeSceneDetailSession()

    const storedUser = buildSceneDetailStoredUser()
    const sceneResponse = buildSceneDetailResponse()
    const creatorSceneResponse = buildSceneDetailResponse({
      createdAt: '2026-04-08T14:00:00Z',
      name: 'Signal Bloom',
      sceneId: 16,
      tags: [],
      thumbnailRef: 'thumbnails/scene-16.png',
    })
    const tagSceneResponse = buildSceneDetailResponse({
      createdAt: '2026-04-09T14:00:00Z',
      creatorDisplayName: 'Night Archive',
      name: 'Afterglow Static',
      ownerUserId: 42,
      sceneId: 21,
      thumbnailRef: 'thumbnails/scene-21.png',
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/scenes/12')) {
        return Promise.resolve(jsonResponse(sceneResponse))
      }

      if (input === buildApiUrl('/scenes')) {
        return Promise.resolve(jsonResponse([sceneResponse, creatorSceneResponse]))
      }

      if (input === buildApiUrl('/scenes?tag=ambient')) {
        return Promise.resolve(jsonResponse([sceneResponse, tagSceneResponse]))
      }

      if (input === buildApiUrl('/scenes?tag=focus-friendly')) {
        return Promise.resolve(jsonResponse([sceneResponse, creatorSceneResponse]))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    const user = userEvent.setup()

    renderSceneDetailPage()

    await screen.findByRole('heading', { name: /aurora drift/i })
    await user.click(screen.getByRole('button', { name: /^show$/i }))

    const ambientTagLink = screen.getByRole('link', { name: /^ambient$/i })
    expect(ambientTagLink).toHaveAttribute('href', '/scenes?tag=ambient')
    expect(screen.getByRole('link', { name: /^focus-friendly$/i })).toHaveAttribute(
      'href',
      '/scenes?tag=focus-friendly',
    )

    await user.click(ambientTagLink)

    expect(await screen.findByTestId('scenes-route')).toHaveTextContent('?tag=ambient')
  })
})

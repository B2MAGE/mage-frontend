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

describe('SceneDetailPage recommendations', () => {
  it('filters sidebar recommendations by creator and the current scene tags', async () => {
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
    const unrelatedSceneResponse = buildSceneDetailResponse({
      createdAt: '2026-04-10T14:00:00Z',
      creatorDisplayName: 'Other Creator',
      name: 'Unrelated Echo',
      ownerUserId: 77,
      sceneId: 34,
      thumbnailRef: 'thumbnails/scene-34.png',
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/scenes/12')) {
        return Promise.resolve(jsonResponse(sceneResponse))
      }

      if (input === buildApiUrl('/scenes')) {
        return Promise.resolve(
          jsonResponse([
            sceneResponse,
            creatorSceneResponse,
            unrelatedSceneResponse,
          ]),
        )
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

    expect(await screen.findByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /afterglow static/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /from scene artist/i }))

    expect(screen.getByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /afterglow static/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^ambient$/i }))

    expect(screen.getByRole('link', { name: /afterglow static/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /signal bloom/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^all$/i }))

    expect(screen.getByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /afterglow static/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /unrelated echo/i })).not.toBeInTheDocument()
  })
})

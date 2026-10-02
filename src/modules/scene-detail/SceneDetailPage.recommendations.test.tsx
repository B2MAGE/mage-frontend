import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@shared/lib'
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
      creatorHandle: 'sceneartist',
      engagement: {
        currentUserSaved: false,
        currentUserVote: null,
        downvotes: 4,
        saves: 8,
        upvotes: 50,
        views: 4321,
      },
      name: 'Signal Bloom',
      sceneId: 16,
      tags: [],
      thumbnailRef: 'thumbnails/scene-16.png',
    })
    const tagSceneResponse = buildSceneDetailResponse({
      createdAt: '2026-04-09T14:00:00Z',
      creatorDisplayName: 'Night Archive',
      creatorHandle: 'nightarchive',
      engagement: {
        currentUserSaved: false,
        currentUserVote: null,
        downvotes: 0,
        saves: 0,
        upvotes: 1,
        views: 5,
      },
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
    expect(screen.getByText(/4\.3K views/i)).toBeInTheDocument()
    expect(screen.getByText(/5 views/i)).toBeInTheDocument()
    const recommendations = within(screen.getByRole('region', { name: /recommended scenes/i }))
    expect(recommendations.getByRole('link', { name: 'Scene Artist' })).toHaveAttribute('href', '/@sceneartist')
    expect(recommendations.getByRole('link', { name: 'Night Archive' })).toHaveAttribute('href', '/@nightarchive')
    expect(recommendations.getByRole('link', { name: 'Signal Bloom' })).toHaveAttribute('href', '/scenes/16')

    const allFilter = screen.getByRole('button', { name: /^all$/i })
    const ambientFilter = screen.getByRole('button', { name: /^ambient$/i })
    expect(allFilter).toHaveClass('tag-pill', 'tag-pill--active')
    expect(ambientFilter).toHaveClass('tag-pill')
    expect(ambientFilter).not.toHaveClass('tag-pill--active')

    await user.click(screen.getByRole('button', { name: /from scene artist/i }))

    expect(screen.getByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /afterglow static/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^ambient$/i }))
    expect(ambientFilter).toHaveClass('tag-pill', 'tag-pill--active')

    expect(screen.getByRole('link', { name: /afterglow static/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /signal bloom/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^all$/i }))

    expect(screen.getByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /afterglow static/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /unrelated echo/i })).not.toBeInTheDocument()
  })

  it('keeps recommendation thumbnails mounted while scene engagement changes', async () => {
    storeSceneDetailSession()

    const user = userEvent.setup()
    const storedUser = buildSceneDetailStoredUser()
    const initialEngagement = {
      currentUserSaved: false,
      currentUserVote: null,
      downvotes: 32,
      saves: 150,
      upvotes: 416,
      views: 2999,
    }
    const sceneResponse = buildSceneDetailResponse({
      engagement: initialEngagement,
      tags: [],
    })
    const recommendedSceneResponse = buildSceneDetailResponse({
      createdAt: '2026-04-08T14:00:00Z',
      engagement: {
        currentUserSaved: false,
        currentUserVote: null,
        downvotes: 0,
        saves: 8,
        upvotes: 50,
        views: 4321,
      },
      name: 'Signal Bloom',
      sceneId: 16,
      tags: [],
      thumbnailRef: 'thumbnails/scene-16.png',
    })
    let recommendationRequestCount = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (input === buildApiUrl('/users/me')) {
        return jsonResponse(storedUser)
      }

      if (input === buildApiUrl('/scenes/12')) {
        return jsonResponse(sceneResponse)
      }

      if (input === buildApiUrl('/scenes/12/views')) {
        return new Promise<Response>(() => undefined)
      }

      if (input === buildApiUrl('/scenes/12/comments')) {
        return jsonResponse([])
      }

      if (input === buildApiUrl('/scenes')) {
        recommendationRequestCount += 1
        return jsonResponse([sceneResponse, recommendedSceneResponse])
      }

      if (input === buildApiUrl('/scenes/12/vote')) {
        const { vote } = JSON.parse(String(init?.body)) as { vote: 'up' | 'down' }

        return jsonResponse({
          ...initialEngagement,
          currentUserVote: vote,
          downvotes: vote === 'down' ? 33 : 32,
          upvotes: vote === 'up' ? 417 : 416,
        })
      }

      if (input === buildApiUrl('/scenes/12/save')) {
        return jsonResponse({
          ...initialEngagement,
          currentUserSaved: true,
          currentUserVote: 'down',
          downvotes: 33,
          saves: 151,
        })
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderSceneDetailPage()

    const thumbnail = await screen.findByRole('img', { name: /signal bloom thumbnail/i })
    const expectStableRecommendation = () => {
      expect(recommendationRequestCount).toBe(1)
      expect(screen.getByRole('img', { name: /signal bloom thumbnail/i })).toBe(thumbnail)
    }

    expectStableRecommendation()

    await user.click(screen.getByRole('button', { name: /upvote 416/i }))
    expect(await screen.findByRole('button', { name: /upvote 417/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expectStableRecommendation()

    await user.click(screen.getByRole('button', { name: /downvote 32/i }))
    expect(await screen.findByRole('button', { name: /downvote 33/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expectStableRecommendation()

    await user.click(screen.getByRole('button', { name: /save 150/i }))
    expect(await screen.findByRole('button', { name: /saved 151/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expectStableRecommendation()
  })
})

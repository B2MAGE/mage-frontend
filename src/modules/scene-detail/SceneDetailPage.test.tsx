import { screen, waitFor } from '@testing-library/react'
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
      initialPlayback,
      sceneBlob,
    }: {
      ariaLabel?: string
      className?: string
      initialPlayback?: string
      sceneBlob: unknown
    }) => (
      <div
        aria-label={ariaLabel}
        className={className}
        data-playback={initialPlayback}
        data-testid="mage-player"
      >
        {sceneBlob ? 'player-ready' : 'no-scene'}
      </div>
    ),
  }
})

describe('SceneDetailPage route states', () => {
  it('loads scene detail on a direct route visit and renders the player', async () => {
    storeSceneDetailSession()

    const storedUser = buildSceneDetailStoredUser()
    const sceneResponse = buildSceneDetailResponse()
    const creatorSceneResponse = buildSceneDetailResponse({
      createdAt: '2026-04-08T14:00:00Z',
      name: 'Signal Bloom',
      sceneId: 16,
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

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
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

    renderSceneDetailPage()

    expect(await screen.findByRole('heading', { name: /aurora drift/i })).toBeInTheDocument()
    expect(screen.getByTestId('mage-player')).toHaveTextContent('player-ready')
    expect(screen.getByTestId('mage-player')).toHaveAttribute('data-playback', 'playing')
    expect(screen.getByRole('heading', { name: /comments/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upvote 416/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^show$/i })).toBeInTheDocument()
    expect(screen.getByText('Soft teal bloom with low-end drift.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /downvote/i }).length).toBeGreaterThan(0)
    expect(screen.getByText(/add a comment as scene artist/i)).toBeInTheDocument()
    expect(screen.getAllByText('Scene Artist').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/2,999 views/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /from scene artist/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^ambient$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^focus-friendly$/i })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /afterglow static/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /unrelated echo/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/after rain \/ windowlight/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/now playing/i)).not.toBeInTheDocument()

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        buildApiUrl('/scenes/12'),
        expect.objectContaining({
          headers: expect.any(Headers),
        }),
      ),
    )

    const sceneRequestHeaders = fetchSpy.mock.calls[1][1]?.headers as Headers

    expect(sceneRequestHeaders.get('Authorization')).toBe('Bearer stored-auth-token')
  })

  it('shows an empty description state when no description is stored', async () => {
    const sceneResponse = buildSceneDetailResponse({
      description: null,
      tags: [],
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/scenes/12')) {
        return Promise.resolve(jsonResponse(sceneResponse))
      }

      if (input === buildApiUrl('/scenes')) {
        return Promise.resolve(jsonResponse([sceneResponse]))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderSceneDetailPage()

    expect(await screen.findByText('No description provided.')).toBeInTheDocument()
    expect(screen.queryByText(/lorem ipsum/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^show$/i })).not.toBeInTheDocument()
  })

  it('does not show the description toggle when a short description has no hidden content', async () => {
    const sceneResponse = buildSceneDetailResponse({
      description: 'Short saved description.',
      tags: [],
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/scenes/12')) {
        return Promise.resolve(jsonResponse(sceneResponse))
      }

      if (input === buildApiUrl('/scenes')) {
        return Promise.resolve(jsonResponse([sceneResponse]))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderSceneDetailPage()

    expect(await screen.findByText('Short saved description.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^show$/i })).not.toBeInTheDocument()
  })

  it('preserves saved description line breaks on the player page', async () => {
    const sceneResponse = buildSceneDetailResponse({
      description: 'First line\nSecond line\n\nSecond paragraph',
      tags: [],
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/scenes/12')) {
        return Promise.resolve(jsonResponse(sceneResponse))
      }

      if (input === buildApiUrl('/scenes')) {
        return Promise.resolve(jsonResponse([sceneResponse]))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderSceneDetailPage()

    expect(await screen.findByRole('heading', { name: /aurora drift/i })).toBeInTheDocument()

    const descriptionParagraphs = document.querySelectorAll('.scene-detail-description-copy p')

    expect(descriptionParagraphs).toHaveLength(2)
    expect(descriptionParagraphs[0]?.textContent).toBe('First lineSecond line')
    expect(descriptionParagraphs[0]?.querySelectorAll('br')).toHaveLength(1)
    expect(descriptionParagraphs[1]?.textContent).toBe('Second paragraph')
    expect(screen.getByRole('button', { name: /^show$/i })).toBeInTheDocument()
  })

  it('shows a clear error state for an invalid scene route id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    renderSceneDetailPage(['/scenes/not-a-number'])

    expect(await screen.findByRole('heading', { name: /invalid scene link/i })).toBeInTheDocument()
    expect(screen.getByText(/missing a valid scene id/i)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows a not-found state when the scene request returns 404', async () => {
    storeSceneDetailSession()

    const storedUser = buildSceneDetailStoredUser()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/scenes/12')) {
        return Promise.resolve(
          jsonResponse(
            {
              message: 'Scene not found.',
            },
            404,
          ),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderSceneDetailPage()

    expect(await screen.findByRole('heading', { name: /scene not found/i })).toBeInTheDocument()
    expect(screen.getByText(/does not exist or is no longer available/i)).toBeInTheDocument()
  })

  it('shows a sign-in-needed state when an unauthenticated scene request is rejected', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/scenes/12')) {
        return Promise.resolve(
          jsonResponse(
            {
              message: 'Authentication is required.',
            },
            401,
          ),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderSceneDetailPage()

    expect(await screen.findByRole('heading', { name: /sign in to view this scene/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to login/i })).toBeInTheDocument()
  })
})

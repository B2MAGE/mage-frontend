import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildApiUrl } from '@shared/lib'
import { jsonResponse } from '@shared/test/http'
import {
  buildMyScenesApiScene,
  buildMyScenesStoredUser,
  renderMyScenesPage,
  storeMyScenesSession,
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

describe('MyScenesPage states', () => {
  it('redirects signed-out visitors to login', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    renderMyScenesPage()

    expect(await screen.findByRole('heading', { name: /login/i })).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows a loading state while scenes are being fetched', async () => {
    storeMyScenesSession()

    let resolveScenesResponse: ((value: Response) => void) | undefined
    const storedUser = buildMyScenesStoredUser()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        return new Promise<Response>((resolve) => {
          resolveScenesResponse = resolve
        })
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderMyScenesPage()

    expect(await screen.findAllByText(/loading your scenes/i)).not.toHaveLength(0)
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('main')).toHaveClass('ui-page-frame', 'ui-page-frame--wide')
    expect(screen.queryByText(/^0 scenes$/i)).not.toBeInTheDocument()
    expect(document.querySelectorAll('.my-scenes-loading__row')).toHaveLength(5)
    expect(document.querySelector('.my-scenes-loading__filter-slot')).toBeInTheDocument()
    expect(document.querySelector('.my-scenes-loader')).not.toBeInTheDocument()
    await waitFor(() => expect(resolveScenesResponse).toBeDefined())

    resolveScenesResponse?.(jsonResponse([]))

    expect(await screen.findByText(/no scenes yet/i)).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveClass('ui-page-frame', 'ui-page-frame--wide')
    expect(screen.getByRole('status')).toHaveClass('ui-page-state', 'ui-page-state--empty')
    expect(screen.getByRole('link', { name: /create scene/i })).toHaveAttribute('href', '/create-scene')
  })

  it('renders owner analytics with one scene-list request and no comment requests', async () => {
    storeMyScenesSession()

    const storedUser = buildMyScenesStoredUser()
    const auroraScene = buildMyScenesApiScene({
      engagement: {
        comments: 3,
        currentUserSaved: false,
        currentUserVote: null,
        downvotes: 1,
        likesRatio: 75,
        saves: 2,
        upvotes: 3,
        views: 777,
      },
      id: 12,
      sceneId: 12,
    })
    const signalScene = buildMyScenesApiScene({
      engagement: {
        comments: 0,
        currentUserSaved: false,
        currentUserVote: null,
        downvotes: 0,
        likesRatio: 0,
        saves: 0,
        upvotes: 0,
        views: 0,
      },
      id: 13,
      name: 'Signal Bloom',
      sceneId: 13,
      sceneData: undefined,
      thumbnailRef: null,
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        return Promise.resolve(jsonResponse([auroraScene, signalScene]))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderMyScenesPage()

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        buildApiUrl('/users/8/scenes'),
        expect.objectContaining({
          headers: expect.any(Headers),
        }),
      ),
    )

    const sceneLink = await screen.findByRole('link', { name: /aurora drift/i })

    expect(screen.getByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(screen.getByText('777')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()

    const auroraRow = sceneLink.closest('tr')
    const signalRow = screen.getByRole('link', { name: /signal bloom/i }).closest('tr')

    expect(auroraRow).not.toBeNull()
    expect(signalRow).not.toBeNull()
    expect(within(auroraRow as HTMLElement).getByText('3')).toBeInTheDocument()
    expect(within(signalRow as HTMLElement).getAllByText('0')).toHaveLength(2)
    expect(within(signalRow as HTMLElement).getByText('0%')).toBeInTheDocument()
    expect(fetchSpy.mock.calls.map(([input]) => input)).toEqual([
      buildApiUrl('/users/me'),
      buildApiUrl('/users/8/scenes'),
    ])
  })

  it('shows empty and error states using simple messages', async () => {
    storeMyScenesSession()

    const storedUser = buildMyScenesStoredUser()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        return Promise.resolve(
          jsonResponse(
            {
              message: 'Something went wrong.',
            },
            500,
          ),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderMyScenesPage()

    expect(
      await screen.findByText(/unable to load scenes right now\. please try again in a moment\./i),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveClass('ui-page-state', 'ui-page-state--error')
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveClass('ui-button', 'ui-button--primary')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    fetchSpy.mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) return Promise.resolve(jsonResponse(storedUser))
      if (input === buildApiUrl('/users/8/scenes')) return Promise.resolve(jsonResponse([]))
      throw new Error('Unexpected request: ' + String(input))
    })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No scenes yet')).toBeInTheDocument()
  })

  it('shows an edit action when no description is stored', async () => {
    storeMyScenesSession()

    const storedUser = buildMyScenesStoredUser()

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        return Promise.resolve(
          jsonResponse([
            buildMyScenesApiScene({
              description: null,
              id: 31,
              name: 'Custom Shader Scene',
              sceneData: {
                visualizer: {
                  shader:
                    'let size = input() let pointerDown = input() time = 0.3*time rotateY(mouse.x * 2 * PI / 2 * (1+nsin(time)))',
                },
              },
              sceneId: 31,
              thumbnailRef: null,
            }),
          ]),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })

    renderMyScenesPage()

    expect(await screen.findByText('Custom Shader Scene')).toBeInTheDocument()
    expect(screen.getByText(/add description/i)).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: /actions for custom shader scene/i })).getByRole(
        'link',
        { name: /edit scene/i },
      ),
    ).toHaveAttribute('href', '/scenes/31/edit')
    expect(screen.queryByText(/let size = input/i)).not.toBeInTheDocument()
  })
})

import { screen } from '@testing-library/react'
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

describe('MyScenesPage sample scene seeding', () => {
  it('adds sample scenes from the empty state and reloads the list', async () => {
    storeMyScenesSession()

    const storedUser = buildMyScenesStoredUser()
    const createdSceneBodies: Array<Record<string, unknown>> = []
    let sceneListRequestCount = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        sceneListRequestCount += 1

        return Promise.resolve(
          jsonResponse(
            sceneListRequestCount === 1
              ? []
              : [
                  buildMyScenesApiScene({
                    id: 21,
                    sceneId: 21,
                  }),
                  buildMyScenesApiScene({
                    id: 22,
                    name: 'Signal Bloom',
                    sceneId: 22,
                    thumbnailRef: null,
                  }),
                  buildMyScenesApiScene({
                    id: 23,
                    name: 'Glacier Echo',
                    sceneId: 23,
                    thumbnailRef: 'thumbnails/scene-23.png',
                  }),
                  buildMyScenesApiScene({
                    id: 24,
                    name: 'Solar Thread',
                    sceneId: 24,
                    thumbnailRef: 'thumbnails/scene-24.png',
                  }),
                ],
          ),
        )
      }

      if (input === buildApiUrl('/scenes')) {
        createdSceneBodies.push(
          JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
        )

        return Promise.resolve(
          jsonResponse(
            {
              sceneId: 20 + createdSceneBodies.length,
            },
            201,
          ),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })
    const user = userEvent.setup()

    renderMyScenesPage()

    expect(await screen.findByText(/no scenes yet/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /add sample scenes/i }))

    expect(await screen.findByRole('link', { name: /aurora drift/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(createdSceneBodies).toHaveLength(4)
    expect(sceneListRequestCount).toBe(2)
  })
})

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

describe('MyScenesPage table behavior', () => {
  it('renders the populated scene state with thumbnails, fallback UI, and navigation', async () => {
    storeMyScenesSession()

    const storedUser = buildMyScenesStoredUser()
    const mockScenes = [
      buildMyScenesApiScene(),
      buildMyScenesApiScene({
        createdAt: '2026-04-06T14:10:00Z',
        description: undefined,
        id: 2,
        name: 'Signal Bloom',
        sceneId: 2,
        thumbnailRef: null,
      }),
      buildMyScenesApiScene({
        createdAt: '2026-04-06T14:20:00Z',
        description: undefined,
        id: 3,
        name: 'Very Long Scene Name To Test Wrapping In The Card Layout',
        sceneId: 3,
        thumbnailRef: 'thumbnails/scene-3.png',
      }),
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        return Promise.resolve(jsonResponse(mockScenes))
      }

      if (input === buildApiUrl('/scenes/1')) {
        return Promise.resolve(jsonResponse(mockScenes[0]))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })
    const user = userEvent.setup()

    renderMyScenesPage()

    const auroraScene = await screen.findByRole('link', { name: /aurora drift/i })

    expect(auroraScene).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /signal bloom/i })).toBeInTheDocument()
    expect(
      screen.getByRole('link', {
        name: /very long scene name to test wrapping in the card layout/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Public')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Public' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /soft teal bloom with low-end drift\./i }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /add description/i })).toHaveLength(2)
    expect(screen.getByAltText('Aurora Drift thumbnail')).toBeInTheDocument()
    expect(
      screen.getByAltText('Very Long Scene Name To Test Wrapping In The Card Layout thumbnail'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Signal Bloom thumbnail unavailable')).toBeInTheDocument()
    expect(screen.getByText('1-3 of 3')).toBeInTheDocument()

    const selectAllCheckbox = screen.getByRole('checkbox', {
      name: /select all scenes on this page/i,
    })

    await user.click(selectAllCheckbox)

    expect(screen.getByRole('checkbox', { name: /select aurora drift/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /select signal bloom/i })).toBeChecked()
    expect(
      screen.getByRole('checkbox', {
        name: /select very long scene name to test wrapping in the card layout/i,
      }),
    ).toBeChecked()

    await user.click(auroraScene)

    expect(await screen.findByTestId('mage-player')).toHaveTextContent('player-ready')
    expect(screen.getByRole('heading', { name: /aurora drift/i })).toBeInTheDocument()
  })

  it('filters the table with the visible status pills', async () => {
    storeMyScenesSession()

    const storedUser = buildMyScenesStoredUser()
    const mockScenes = [
      buildMyScenesApiScene(),
      buildMyScenesApiScene({
        createdAt: '2026-04-06T14:10:00Z',
        id: 2,
        name: 'Signal Bloom',
        sceneId: 2,
        thumbnailRef: null,
      }),
      buildMyScenesApiScene({
        createdAt: '2026-04-06T14:20:00Z',
        id: 3,
        name: 'Glacier Echo',
        sceneId: 3,
      }),
    ]

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        return Promise.resolve(jsonResponse(mockScenes))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })
    const user = userEvent.setup()

    renderMyScenesPage()

    expect(await screen.findByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Public' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Public' }))

    expect(screen.getByText('3 scenes')).toBeInTheDocument()
    expect(screen.getAllByText('Public')).toHaveLength(4)
  })

  it('sorts the table when updated, views, and likes headers are clicked', async () => {
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
              createdAt: '2026-04-06T14:10:00Z',
              id: 7,
              name: 'Signal Bloom',
              sceneId: 7,
            }),
            buildMyScenesApiScene({
              createdAt: '2026-04-06T14:00:00Z',
              id: 2,
              sceneId: 2,
            }),
            buildMyScenesApiScene({
              createdAt: '2026-04-06T14:30:00Z',
              id: 13,
              name: 'Solar Thread',
              sceneId: 13,
            }),
          ]),
        )
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })
    const user = userEvent.setup()

    renderMyScenesPage()

    await screen.findByRole('link', { name: /signal bloom/i })

    const titleLinks = () =>
      screen
        .getAllByRole('link')
        .filter(
          (link) =>
            /\/scenes\/\d+$/.test(link.getAttribute('href') ?? '') &&
            !/Open scene preview/i.test(link.getAttribute('aria-label') ?? ''),
        )

    expect(titleLinks().map((link) => link.textContent)).toEqual([
      'Solar Thread',
      'Signal Bloom',
      'Aurora Drift',
    ])
    expect(screen.getByText('Newest items first')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /sort by views descending/i }))

    expect(titleLinks().map((link) => link.textContent)).toEqual([
      'Solar Thread',
      'Signal Bloom',
      'Aurora Drift',
    ])
    expect(screen.getByText('Highest views first')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /sort by views ascending/i }))

    expect(titleLinks().map((link) => link.textContent)).toEqual([
      'Aurora Drift',
      'Signal Bloom',
      'Solar Thread',
    ])
    expect(screen.getByText('Lowest views first')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: /sort by likes \(vs dislikes\) descending/i }),
    )

    expect(titleLinks().map((link) => link.textContent)).toEqual([
      'Solar Thread',
      'Aurora Drift',
      'Signal Bloom',
    ])
    expect(screen.getByText('Highest likes ratio first')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /sort by updated descending/i }))
    await user.click(screen.getByRole('button', { name: /sort by updated ascending/i }))

    expect(titleLinks().map((link) => link.textContent)).toEqual([
      'Aurora Drift',
      'Signal Bloom',
      'Solar Thread',
    ])
    expect(screen.getByText('Oldest items first')).toBeInTheDocument()
  })

  it('paginates the table and shows the footer controls', async () => {
    storeMyScenesSession()

    const storedUser = buildMyScenesStoredUser()
    const paginatedScenes = Array.from({ length: 31 }, (_, index) => {
      const sceneNumber = index + 1
      const day = String(sceneNumber).padStart(2, '0')

      return buildMyScenesApiScene({
        createdAt: `2026-04-${day}T14:00:00Z`,
        id: sceneNumber,
        name: `Scene ${sceneNumber}`,
        sceneId: sceneNumber,
      })
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (input === buildApiUrl('/users/me')) {
        return Promise.resolve(jsonResponse(storedUser))
      }

      if (input === buildApiUrl('/users/8/scenes')) {
        return Promise.resolve(jsonResponse(paginatedScenes))
      }

      throw new Error(`Unexpected request: ${String(input)}`)
    })
    const user = userEvent.setup()

    renderMyScenesPage()

    expect(await screen.findByText('1-30 of 31')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scene 31' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Scene 1' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /go to next page/i }))

    expect(await screen.findByText('31-31 of 31')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scene 1' })).toBeInTheDocument()
  })
})

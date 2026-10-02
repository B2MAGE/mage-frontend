import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_THEME_STORAGE_KEY, ThemeProvider, type AppThemeId } from '@theme'
import { ScenesPage } from './ScenesPage'

const mockTags = [
  { tagId: 1, name: 'fire' },
  { tagId: 2, name: 'water' },
]

const mockScenes = [
  {
    sceneId: 1,
    ownerUserId: 10,
    creatorDisplayName: 'Sunset Artist',
    engagement: {
      currentUserSaved: false,
      currentUserVote: null,
      downvotes: 2,
      saves: 4,
      upvotes: 10,
      views: 42,
    },
    name: 'Sunset Scene',
    sceneData: {},
    thumbnailRef: null,
    createdAt: new Date().toISOString(),
  },
  {
    sceneId: 2,
    ownerUserId: 10,
    creatorDisplayName: 'Ocean Artist',
    engagement: {
      currentUserSaved: false,
      currentUserVote: null,
      downvotes: 8,
      saves: 9,
      upvotes: 20,
      views: 1500,
    },
    name: 'Ocean Breeze',
    sceneData: {},
    thumbnailRef: 'https://example.com/thumb.png',
    createdAt: new Date().toISOString(),
  },
]

function renderScenesPage(path = '/scenes', themeId: AppThemeId = 'mage-pulse') {
  window.localStorage.setItem(APP_THEME_STORAGE_KEY, themeId)
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <ScenesPage />
        <LocationSearchProbe />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

function LocationSearchProbe() {
  const location = useLocation()
  return <output data-testid="location-search" hidden>{location.search}</output>
}

function mockFetchResponses(
  tagsResponse: unknown[] = mockTags,
  scenesResponse: unknown[] = mockScenes,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = typeof input === 'string' ? input : (input as Request).url

    if (url.includes('/tags')) {
      return Promise.resolve(
        new Response(JSON.stringify(tagsResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }

    return Promise.resolve(
      new Response(JSON.stringify(scenesResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
}

describe('ScenesPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading skeleton initially', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))

    const { container } = renderScenesPage()

    expect(screen.getByText('Loading scenes')).toHaveAttribute('role', 'status')
    expect(screen.getByText('Loading scene filters')).toHaveAttribute('role', 'status')
    expect(container.querySelectorAll('.scene-card--loading')).toHaveLength(6)
    expect(container.querySelector('.tag-filter-bar__loading-placeholder')).toBeInTheDocument()
    expect(container.querySelector('.tag-pill--skeleton')).not.toBeInTheDocument()
  })

  it('renders scene cards after successful fetch', async () => {
    mockFetchResponses()

    renderScenesPage()

    expect(await screen.findByText('Sunset Scene')).toBeInTheDocument()
    expect(screen.getByText('Ocean Breeze')).toBeInTheDocument()
    expect(screen.getByText('Sunset Artist')).toBeInTheDocument()
    expect(screen.getByText('Ocean Artist')).toBeInTheDocument()
    expect(screen.getByText('42 views')).toBeInTheDocument()
    expect(screen.getByText('1.5K views')).toBeInTheDocument()
  })

  it.each([null, 'fire'])('shows newest scenes first with filter %s', async (tag) => {
    mockFetchResponses(mockTags, [
      { ...mockScenes[0], sceneId: 99, name: 'Oldest scene', createdAt: '2026-01-01T00:00:00Z' },
      { ...mockScenes[1], sceneId: 2, name: 'Newest scene', createdAt: '2026-01-03T00:00:00Z' },
      { ...mockScenes[0], sceneId: 3, name: 'Middle scene', createdAt: '2026-01-02T00:00:00Z' },
    ])
    const user = userEvent.setup()
    renderScenesPage()
    if (tag) await user.click(await screen.findByRole('button', { name: tag }))
    await screen.findByText('Newest scene')
    expect(within(screen.getByLabelText('Scene list')).getAllByRole('heading').map(node => node.textContent))
      .toEqual(['Newest scene', 'Middle scene', 'Oldest scene'])
    expect(screen.getByRole('combobox', { name: 'Sort scenes' })).toHaveValue('descending')
    expect(screen.getByRole('combobox', { name: 'Sort scenes' })).toHaveClass('mage-select')
  })

  it('sorts oldest first for ascending and leaves invalid dates last', async () => {
    mockFetchResponses(mockTags, [
      { ...mockScenes[0], sceneId: 9, name: 'Unknown date', createdAt: 'invalid' },
      { ...mockScenes[0], sceneId: 5, name: 'Second tied scene', createdAt: '2026-01-02T00:00:00Z' },
      { ...mockScenes[1], sceneId: 3, name: 'First tied scene', createdAt: '2026-01-02T00:00:00Z' },
      { ...mockScenes[0], sceneId: 1, name: 'Oldest scene', createdAt: '2026-01-01T00:00:00Z' },
    ])

    renderScenesPage('/scenes?sort=ascending')

    await screen.findByText('Oldest scene')
    expect(within(screen.getByLabelText('Scene list')).getAllByRole('heading').map(node => node.textContent))
      .toEqual(['Oldest scene', 'First tied scene', 'Second tied scene', 'Unknown date'])
  })

  it.each([
    ['most-viewed', ['Most watched', 'Newest tie', 'Older tie']],
    ['most-liked', ['Most liked', 'Newest tie', 'Older tie']],
  ] as const)('sorts scenes by %s with newest-first tie breakers', async (sort, expectedNames) => {
    mockFetchResponses(mockTags, [
      {
        ...mockScenes[0],
        sceneId: 1,
        name: sort === 'most-viewed' ? 'Most watched' : 'Most liked',
        createdAt: '2026-01-01T00:00:00Z',
        engagement: { ...mockScenes[0].engagement, views: 100, upvotes: 50 },
      },
      {
        ...mockScenes[1],
        sceneId: 2,
        name: 'Older tie',
        createdAt: '2026-01-02T00:00:00Z',
        engagement: { ...mockScenes[1].engagement, views: 20, upvotes: 10 },
      },
      {
        ...mockScenes[1],
        sceneId: 3,
        name: 'Newest tie',
        createdAt: '2026-01-03T00:00:00Z',
        engagement: { ...mockScenes[1].engagement, views: 20, upvotes: 10 },
      },
    ])

    renderScenesPage(`/scenes?sort=${sort}`)

    await screen.findByText(expectedNames[0])
    expect(within(screen.getByLabelText('Scene list')).getAllByRole('heading').map(node => node.textContent))
      .toEqual(expectedNames)
  })

  it.each(['featured', 'recommended'] as const)(
    'keeps the default newest-first order for the %s placeholder',
    async (sort) => {
      mockFetchResponses(mockTags, [
        { ...mockScenes[0], sceneId: 1, name: 'Old scene', createdAt: '2026-01-01T00:00:00Z' },
        { ...mockScenes[1], sceneId: 2, name: 'New scene', createdAt: '2026-01-02T00:00:00Z' },
      ])
      renderScenesPage(`/scenes?sort=${sort}`)

      await screen.findByText('New scene')
      expect(screen.getByRole('combobox', { name: 'Sort scenes' })).toHaveValue(sort)
      expect(within(screen.getByLabelText('Scene list')).getAllByRole('heading').map(node => node.textContent))
        .toEqual(['New scene', 'Old scene'])
    },
  )

  it('falls back to descending for an invalid sort value', async () => {
    mockFetchResponses(mockTags, [
      { ...mockScenes[0], sceneId: 1, name: 'Old scene', createdAt: '2026-01-01T00:00:00Z' },
      { ...mockScenes[1], sceneId: 2, name: 'New scene', createdAt: '2026-01-02T00:00:00Z' },
    ])
    renderScenesPage('/scenes?sort=unknown')

    await screen.findByText('New scene')
    expect(screen.getByRole('combobox', { name: 'Sort scenes' })).toHaveValue('descending')
    expect(screen.getByRole('combobox', { name: 'Sort scenes' })).toHaveClass('mage-select')
    expect(within(screen.getByLabelText('Scene list')).getAllByRole('heading').map(node => node.textContent))
      .toEqual(['New scene', 'Old scene'])
  })

  it('updates sorting without refetching and preserves the active tag query', async () => {
    const fetchSpy = mockFetchResponses()
    const user = userEvent.setup()
    renderScenesPage('/scenes?tag=fire&sort=ascending')

    await screen.findByText('Sunset Scene')
    const sceneRequestCount = fetchSpy.mock.calls.filter(([input]) =>
      (typeof input === 'string' ? input : (input as Request).url).includes('/scenes'),
    ).length

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort scenes' }), 'most-viewed')

    expect(screen.getByTestId('location-search')).toHaveTextContent('tag=fire')
    expect(screen.getByTestId('location-search')).toHaveTextContent('sort=most-viewed')
    expect(fetchSpy.mock.calls.filter(([input]) =>
      (typeof input === 'string' ? input : (input as Request).url).includes('/scenes'),
    )).toHaveLength(sceneRequestCount)
    expect(screen.queryByText('Loading scenes')).not.toBeInTheDocument()
  })

  it('preserves sorting when changing and clearing the tag filter', async () => {
    mockFetchResponses()
    const user = userEvent.setup()
    renderScenesPage('/scenes?sort=most-liked')

    await user.click(await screen.findByRole('button', { name: 'fire' }))
    expect(screen.getByTestId('location-search')).toHaveTextContent('tag=fire')
    expect(screen.getByTestId('location-search')).toHaveTextContent('sort=most-liked')

    await user.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(screen.getByTestId('location-search')).not.toHaveTextContent('tag='))
    expect(screen.getByTestId('location-search')).toHaveTextContent('sort=most-liked')
  })

  it('uses newest ID for timestamp ties and puts invalid timestamps last', async () => {
    mockFetchResponses(mockTags, [
      { ...mockScenes[0], sceneId: 9, name: 'Unknown date', createdAt: 'invalid' },
      { ...mockScenes[0], sceneId: 2, name: 'Earlier insertion', createdAt: '2026-01-03T00:00:00Z' },
      { ...mockScenes[1], sceneId: 3, name: 'Later insertion', createdAt: '2026-01-03T00:00:00Z' },
    ])
    renderScenesPage()
    await screen.findByText('Later insertion')
    expect(within(screen.getByLabelText('Scene list')).getAllByRole('heading').map(node => node.textContent))
      .toEqual(['Later insertion', 'Earlier insertion', 'Unknown date'])
  })

  it('renders tag filter pills after loading', async () => {
    const fetchSpy = mockFetchResponses()

    renderScenesPage()

    const allFilter = await screen.findByRole('button', { name: 'All' })
    const fireFilter = screen.getByRole('button', { name: 'fire' })
    const waterFilter = screen.getByRole('button', { name: 'water' })
    expect(allFilter).toHaveClass('tag-pill', 'tag-pill--active')
    expect(fireFilter).toHaveClass('tag-pill')
    expect(fireFilter).not.toHaveClass('tag-pill--active')
    expect(waterFilter).toHaveClass('tag-pill')

    const tagCall = fetchSpy.mock.calls.find((call) => {
      const url = typeof call[0] === 'string' ? call[0] : (call[0] as Request).url
      return url.includes('/tags')
    })

    const tagUrl = typeof tagCall?.[0] === 'string' ? tagCall[0] : (tagCall?.[0] as Request).url
    expect(tagUrl).toContain('attachedOnly=true')
  })

  it('shows empty state when no scenes are returned', async () => {
    mockFetchResponses(mockTags, [])

    renderScenesPage()

    expect(await screen.findByRole('heading', { name: 'No scenes here yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create a scene' })).toHaveAttribute('href', '/create-scene')
    expect(screen.queryByRole('button', { name: 'Show all scenes' })).not.toBeInTheDocument()
  })

  it('clears an empty tag filter with the empty-state action', async () => {
    const fetchSpy = mockFetchResponses(mockTags, [])
    const user = userEvent.setup()

    renderScenesPage('/scenes?tag=fire')

    expect(await screen.findByRole('heading', { name: 'No scenes match this tag' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('fire')
    expect(screen.queryByRole('link', { name: 'Create a scene' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show all scenes' }))

    expect(await screen.findByRole('heading', { name: 'No scenes here yet' })).toBeInTheDocument()
    const sceneCalls = fetchSpy.mock.calls.filter(([input]) =>
      (typeof input === 'string' ? input : (input as Request).url).includes('/scenes'),
    )
    const lastInput = sceneCalls.at(-1)?.[0]
    const lastUrl = typeof lastInput === 'string' ? lastInput : (lastInput as Request).url
    expect(lastUrl).not.toContain('tag=')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  })

  it.each([null, 'fire'])('provides the shared Classic Blue empty-state action with filter %s', async (tag) => {
    mockFetchResponses(mockTags, [])
    const user = userEvent.setup()

    renderScenesPage(tag ? `/scenes?tag=${tag}` : '/scenes', 'classic-facebook')

    expect(await screen.findByRole('heading', { name: tag ? 'No scenes match this tag' : 'No scenes here yet' })).toBeInTheDocument()
    if (tag) {
      expect(screen.getByRole('status')).toHaveTextContent(tag)
      expect(screen.queryByRole('link', { name: 'Create a scene' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Show all scenes' }))
      expect(await screen.findByRole('heading', { name: 'No scenes here yet' })).toBeInTheDocument()
      expect(screen.getByTestId('location-search')).not.toHaveTextContent('tag=')
      expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    }
    expect(screen.getByRole('link', { name: 'Create a scene' })).toHaveAttribute('href', '/create-scene')
    expect(screen.queryByRole('button', { name: 'Show all scenes' })).not.toBeInTheDocument()
  })

  it('clicking a tag pill filters scenes by that tag', async () => {
    const fetchSpy = mockFetchResponses()
    const user = userEvent.setup()

    renderScenesPage()

    const fireButton = await screen.findByRole('button', { name: 'fire' })
    await user.click(fireButton)

    await waitFor(() => {
      const sceneCalls = fetchSpy.mock.calls.filter((call) => {
        const url = typeof call[0] === 'string' ? call[0] : (call[0] as Request).url
        return url.includes('/scenes')
      })
      const lastCall = sceneCalls[sceneCalls.length - 1]
      const url = typeof lastCall[0] === 'string' ? lastCall[0] : (lastCall[0] as Request).url
      expect(url).toContain('tag=fire')
    })
  })

  it('clicking All resets the filter', async () => {
    const fetchSpy = mockFetchResponses()
    const user = userEvent.setup()

    renderScenesPage()

    const fireButton = await screen.findByRole('button', { name: 'fire' })
    await user.click(fireButton)

    const allButton = screen.getByRole('button', { name: 'All' })
    await user.click(allButton)

    await waitFor(() => {
      const sceneCalls = fetchSpy.mock.calls.filter((call) => {
        const url = typeof call[0] === 'string' ? call[0] : (call[0] as Request).url
        return url.includes('/scenes')
      })
      const lastCall = sceneCalls[sceneCalls.length - 1]
      const url = typeof lastCall[0] === 'string' ? lastCall[0] : (lastCall[0] as Request).url
      expect(url).not.toContain('tag=')
    })
  })

  it.each(['mage-pulse', 'classic-facebook'] as const)('retries a failed scene request and restores the collection in %s', async (themeId) => {
    let scenesFailed = false
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : (input as Request).url

      if (url.includes('/tags')) {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }

      if (!scenesFailed) {
        scenesFailed = true
        return Promise.resolve(new Response('Internal Server Error', { status: 500 }))
      }

      return Promise.resolve(new Response(JSON.stringify(mockScenes), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    })
    const user = userEvent.setup()

    renderScenesPage('/scenes', themeId)

    expect(await screen.findByRole('alert')).toHaveTextContent('Scenes couldn’t be loaded')
    expect(screen.queryByRole('heading', { name: 'No scenes here yet' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('Sunset Scene')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

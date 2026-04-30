import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

function renderScenesPage() {
  return render(
    <MemoryRouter initialEntries={['/scenes']}>
      <ScenesPage />
    </MemoryRouter>,
  )
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

    renderScenesPage()

    expect(screen.getByLabelText(/loading scenes/i)).toBeInTheDocument()
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

  it('renders tag filter pills after loading', async () => {
    const fetchSpy = mockFetchResponses()

    renderScenesPage()

    expect(await screen.findByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'fire' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'water' })).toBeInTheDocument()

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

    expect(await screen.findByText(/no scenes found/i)).toBeInTheDocument()
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

  it('shows error state with retry button on fetch failure', async () => {
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

      return Promise.resolve(new Response('Internal Server Error', { status: 500 }))
    })

    renderScenesPage()

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})

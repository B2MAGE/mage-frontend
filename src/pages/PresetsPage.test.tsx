import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PresetsPage } from './PresetsPage'

const mockTags = [
  { tagId: 1, name: 'fire' },
  { tagId: 2, name: 'water' },
]

const mockPresets = [
  {
    presetId: 1,
    ownerUserId: 10,
    name: 'Sunset Scene',
    sceneData: {},
    thumbnailRef: null,
    createdAt: new Date().toISOString(),
  },
  {
    presetId: 2,
    ownerUserId: 10,
    name: 'Ocean Breeze',
    sceneData: {},
    thumbnailRef: 'https://example.com/thumb.png',
    createdAt: new Date().toISOString(),
  },
]

function renderPresetsPage() {
  return render(
    <MemoryRouter>
      <PresetsPage />
    </MemoryRouter>,
  )
}

function mockFetchResponses(
  tagsResponse: unknown[] = mockTags,
  presetsResponse: unknown[] = mockPresets,
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
      new Response(JSON.stringify(presetsResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
}

describe('PresetsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading skeleton initially', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {}),
    )

    renderPresetsPage()

    expect(screen.getByLabelText(/loading presets/i)).toBeInTheDocument()
  })

  it('renders preset cards after successful fetch', async () => {
    mockFetchResponses()

    renderPresetsPage()

    expect(await screen.findByText('Sunset Scene')).toBeInTheDocument()
    expect(screen.getByText('Ocean Breeze')).toBeInTheDocument()
  })

  it('renders tag filter pills after loading', async () => {
    mockFetchResponses()

    renderPresetsPage()

    expect(await screen.findByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'fire' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'water' })).toBeInTheDocument()
  })

  it('shows empty state when no presets are returned', async () => {
    mockFetchResponses(mockTags, [])

    renderPresetsPage()

    expect(await screen.findByText(/no presets found/i)).toBeInTheDocument()
  })

  it('clicking a tag pill filters presets by that tag', async () => {
    const fetchSpy = mockFetchResponses()
    const user = userEvent.setup()

    renderPresetsPage()

    const fireButton = await screen.findByRole('button', { name: 'fire' })
    await user.click(fireButton)

    await waitFor(() => {
      const presetCalls = fetchSpy.mock.calls.filter(
        (call) => {
          const url = typeof call[0] === 'string' ? call[0] : (call[0] as Request).url
          return url.includes('/presets')
        },
      )
      const lastCall = presetCalls[presetCalls.length - 1]
      const url = typeof lastCall[0] === 'string' ? lastCall[0] : (lastCall[0] as Request).url
      expect(url).toContain('tag=fire')
    })
  })

  it('clicking All resets the filter', async () => {
    const fetchSpy = mockFetchResponses()
    const user = userEvent.setup()

    renderPresetsPage()

    const fireButton = await screen.findByRole('button', { name: 'fire' })
    await user.click(fireButton)

    const allButton = screen.getByRole('button', { name: 'All' })
    await user.click(allButton)

    await waitFor(() => {
      const presetCalls = fetchSpy.mock.calls.filter(
        (call) => {
          const url = typeof call[0] === 'string' ? call[0] : (call[0] as Request).url
          return url.includes('/presets')
        },
      )
      const lastCall = presetCalls[presetCalls.length - 1]
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

      return Promise.resolve(
        new Response('Internal Server Error', { status: 500 }),
      )
    })

    renderPresetsPage()

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})

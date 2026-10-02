import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@theme'
import { ProfilePage } from './ProfilePage'

type MockUser = {
  authProvider: string
  displayName: string
  email: string
  handle: string
  userId: number | null
}

let authState: {
  authenticatedFetch: ReturnType<typeof vi.fn>
  isAuthenticated: boolean
  isRestoringSession: boolean
  user: MockUser | null
}

vi.mock('@auth', () => ({
  useAuth: () => authState,
}))

function scene(sceneId: number, name: string, views: number, upvotes: number, saves: number) {
  return {
    createdAt: `2026-09-${String(20 + sceneId).padStart(2, '0')}T12:00:00Z`,
    creatorDisplayName: 'Ari Rivera',
    creatorHandle: 'aririvera',
    description: `${name} description`,
    engagement: {
      currentUserSaved: false,
      currentUserVote: null,
      downvotes: 0,
      saves,
      upvotes,
      views,
    },
    name,
    ownerUserId: 1,
    sceneData: {},
    sceneId,
    thumbnailRef: `http://localhost/${sceneId}.png`,
  }
}

function profilePayload(scenes = [
  scene(1, 'Mercury in Bloom', 1200, 20, 8),
  scene(2, 'Copper Reef', 3400, 45, 12),
]) {
  return {
    createdAt: '2026-01-01T12:00:00Z',
    description: 'Slow visual spaces built for late-night listening.',
    displayName: 'Ari Rivera',
    handle: 'aririvera',
    scenes,
    userId: 1,
  }
}

function profileResponse(scenes?: ReturnType<typeof scene>[]) {
  return new Response(JSON.stringify(profilePayload(scenes)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderProfilePage(path = '/@aririvera') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <Routes>
          <Route path="/:profileHandle" element={<ProfilePage />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('ProfilePage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    authState = {
      authenticatedFetch: vi.fn(),
      isAuthenticated: true,
      isRestoringSession: false,
      user: {
        authProvider: 'LOCAL',
        displayName: 'Ari Rivera',
        email: 'ari@pulse.local',
        handle: 'aririvera',
        userId: 1,
      },
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders public-safe profile details, real totals, and searchable scene cards', async () => {
    authState.authenticatedFetch.mockResolvedValue(profileResponse())
    const browserUser = userEvent.setup()

    const { container } = renderProfilePage()
    expect(container.querySelector('.profile-avatar--loading')).not.toHaveClass('user-avatar')

    expect(await screen.findByRole('heading', { name: 'Ari Rivera', level: 1 })).toBeInTheDocument()
    expect(container.querySelector('.profile-avatar')).toHaveClass('user-avatar')
    expect(container.querySelector('.profile-avatar')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('@aririvera')).toBeInTheDocument()
    expect(screen.getByText('Slow visual spaces built for late-night listening.')).toBeInTheDocument()
    expect(screen.queryByText('ari@pulse.local')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit profile' })).toHaveAttribute(
      'href',
      '/settings#profile',
    )
    expect(screen.getByRole('heading', { name: 'Copper Reef', level: 3 })).toBeInTheDocument()

    const stats = screen.getByLabelText('Profile statistics')
    expect(within(stats).getByText('4.6K')).toBeInTheDocument()
    expect(within(stats).getByText('65')).toBeInTheDocument()
    expect(within(stats).getByText('20')).toBeInTheDocument()
    expect(authState.authenticatedFetch).toHaveBeenCalledWith('/profiles/aririvera')

    await browserUser.type(screen.getByRole('searchbox', { name: 'Search scenes' }), 'mercury')

    expect(screen.getByRole('heading', { name: 'Mercury in Bloom', level: 3 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Copper Reef', level: 3 })).not.toBeInTheDocument()

    await browserUser.clear(screen.getByRole('searchbox', { name: 'Search scenes' }))
    await browserUser.type(screen.getByRole('searchbox', { name: 'Search scenes' }), 'missing')

    expect(screen.getByRole('heading', { name: 'No matching scenes' })).toBeInTheDocument()
    await browserUser.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByRole('heading', { name: 'Copper Reef', level: 3 })).toBeInTheDocument()
  })

  it('loads profiles publicly and hides owner-only actions from visitors', async () => {
    authState = {
      authenticatedFetch: vi.fn(),
      isAuthenticated: false,
      isRestoringSession: false,
      user: null,
    }
    const publicFetch = vi.fn().mockResolvedValue(profileResponse([]))
    vi.stubGlobal('fetch', publicFetch)

    renderProfilePage()

    expect(await screen.findByRole('heading', { name: 'No scenes yet' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ari Rivera', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('@aririvera')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create a scene' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore scenes' })).toHaveAttribute('href', '/scenes')
    expect(publicFetch).toHaveBeenCalledWith('/api/profiles/aririvera')
    expect(authState.authenticatedFetch).not.toHaveBeenCalled()
  })

  it('offers create and edit actions on the owner’s empty profile', async () => {
    authState.authenticatedFetch.mockResolvedValue(profileResponse([]))

    renderProfilePage()

    expect(await screen.findByRole('heading', { name: 'No scenes yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit profile' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create a scene' })).toHaveAttribute(
      'href',
      '/create-scene',
    )
  })

  it('shows a clear not-found state for a missing handle', async () => {
    authState.authenticatedFetch.mockResolvedValue(new Response(null, { status: 404 }))

    renderProfilePage('/@missing')

    expect(await screen.findByRole('heading', { name: 'Profile not found' })).toBeInTheDocument()
    expect(screen.getByText(/couldn’t find @missing/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse scenes' })).toHaveAttribute('href', '/scenes')
  })

  it('retries a temporarily unavailable profile request', async () => {
    authState.authenticatedFetch
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(profileResponse([scene(1, 'Paper Sun', 12, 3, 1)]))
    const browserUser = userEvent.setup()

    renderProfilePage()

    expect(await screen.findByRole('heading', { name: 'Profile unavailable' })).toBeInTheDocument()
    await browserUser.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Paper Sun', level: 3 })).toBeInTheDocument()
    expect(authState.authenticatedFetch).toHaveBeenCalledTimes(2)
  })

  it('rejects malformed handle routes before making a request', async () => {
    renderProfilePage('/@not-valid!')

    expect(await screen.findByRole('heading', { name: 'Invalid profile address' })).toBeInTheDocument()
    await waitFor(() => expect(authState.authenticatedFetch).not.toHaveBeenCalled())
  })
})

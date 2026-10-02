import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@theme'
import { ProfilePage } from './ProfilePage'

const authState = vi.hoisted(() => ({
  authenticatedFetch: vi.fn(),
  isAuthenticated: true,
  isRestoringSession: false,
  user: { userId: 1, displayName: 'Ari Rivera', handle: 'aririvera' },
}))

vi.mock('@auth', () => ({ useAuth: () => authState }))

function profileResponse(handle = 'aririvera', count = 30) {
  return new Response(JSON.stringify({
    createdAt: '2026-01-01T00:00:00Z',
    description: null,
    displayName: handle === 'aririvera' ? 'Ari Rivera' : 'Kai Tanaka',
    handle,
    userId: handle === 'aririvera' ? 1 : 2,
    scenes: Array.from({ length: count }, (_, index) => {
      const id = index + 1
      return {
        sceneId: id,
        name: `Scene ${String(id).padStart(2, '0')}`,
        createdAt: new Date(Date.UTC(2026, 0, id)).toISOString(),
        creatorDisplayName: 'Ari Rivera',
        creatorHandle: handle,
        ownerUserId: 1,
        description: null,
        sceneData: {},
        thumbnailRef: `http://localhost/scene-${id}.png`,
        engagement: {
          currentUserSaved: false,
          currentUserVote: null,
          downvotes: 0,
          saves: 0,
          upvotes: id === 7 ? 8_000 : id,
          views: id === 3 ? 90_000 : id * 10,
        },
      }
    }),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/@aririvera']}>
      <ThemeProvider>
        <Link to="/@kaitanaka">Visit Kai</Link>
        <Routes><Route path="/:profileHandle" element={<ProfilePage />} /></Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

function sceneTitles() {
  return screen.queryAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
}

async function waitForProfile() {
  expect(await screen.findByRole('heading', { name: 'Ari Rivera', level: 1 })).toBeInTheDocument()
}

describe('profile sort and pagination controls', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    authState.authenticatedFetch.mockReset()
    authState.authenticatedFetch.mockImplementation((path: string) => Promise.resolve(profileResponse(path.endsWith('kaitanaka') ? 'kaitanaka' : 'aririvera')))
  })

  it('starts newest first with 12 cards and navigates bounded pages without refetching the profile', async () => {
    const browserUser = userEvent.setup()
    renderProfile()
    await waitForProfile()

    expect(screen.getByRole('combobox', { name: 'Sort scenes' })).toHaveValue('descending')
    expect(screen.getByRole('combobox', { name: 'Scenes per page' })).toHaveValue('12')
    expect(sceneTitles()).toHaveLength(12)
    expect(sceneTitles()[0]).toBe('Scene 30')
    const pagination = screen.getByRole('navigation', { name: 'Profile scene pagination' })
    expect(within(pagination).getByText('1–12 of 30 scenes')).toBeInTheDocument()
    expect(within(pagination).getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled()

    await browserUser.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(sceneTitles()[0]).toBe('Scene 18')
    expect(within(pagination).getByText('13–24 of 30 scenes')).toBeInTheDocument()
    await browserUser.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(sceneTitles()).toEqual(['Scene 06', 'Scene 05', 'Scene 04', 'Scene 03', 'Scene 02', 'Scene 01'])
    expect(within(pagination).getByText('25–30 of 30 scenes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled()
    await browserUser.click(screen.getByRole('button', { name: 'Go to previous page' }))
    expect(within(pagination).getByText('Page 2 of 3')).toBeInTheDocument()
    expect(authState.authenticatedFetch).toHaveBeenCalledTimes(1)
  })

  it('sorts all scenes before slicing and returns to the first page when sort changes', async () => {
    const browserUser = userEvent.setup()
    renderProfile()
    await waitForProfile()
    await browserUser.click(screen.getByRole('button', { name: 'Go to next page' }))
    const sort = screen.getByRole('combobox', { name: 'Sort scenes' })

    expect(within(sort).getAllByRole('option').map((option) => option.textContent)).toEqual(['Newest first', 'Oldest first', 'Most viewed', 'Most liked'])
    await browserUser.selectOptions(sort, 'ascending')
    expect(sceneTitles()[0]).toBe('Scene 01')
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    await browserUser.click(screen.getByRole('button', { name: 'Go to next page' }))
    await browserUser.selectOptions(sort, 'most-viewed')
    expect(sceneTitles()[0]).toBe('Scene 03')
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    await browserUser.selectOptions(sort, 'most-liked')
    expect(sceneTitles()[0]).toBe('Scene 07')
    expect(authState.authenticatedFetch).toHaveBeenCalledTimes(1)
  })

  it('searches scenes from outside the visible page, resets pagination, and keeps profile totals unchanged', async () => {
    const browserUser = userEvent.setup()
    renderProfile()
    await waitForProfile()
    const stats = screen.getByLabelText('Profile statistics').textContent
    await browserUser.click(screen.getByRole('button', { name: 'Go to next page' }))
    const search = screen.getByRole('searchbox', { name: 'Search scenes' })
    await browserUser.type(search, 'sCeNe 01')

    expect(sceneTitles()).toEqual(['Scene 01'])
    expect(screen.getByText('1–1 of 1 scenes')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled()
    expect(screen.getByLabelText('Profile statistics').textContent).toBe(stats)
    await browserUser.clear(search)
    expect(sceneTitles()[0]).toBe('Scene 30')
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(authState.authenticatedFetch).toHaveBeenCalledTimes(1)
  })

  it('changes scenes per page using the shared dropdown style and resets to the first page', async () => {
    const browserUser = userEvent.setup()
    renderProfile()
    await waitForProfile()
    await browserUser.click(screen.getByRole('button', { name: 'Go to next page' }))
    const pageSize = screen.getByRole('combobox', { name: 'Scenes per page' })

    expect(pageSize).toHaveClass('mage-select')
    expect(screen.getByRole('combobox', { name: 'Sort scenes' })).toHaveClass('mage-select')
    await browserUser.selectOptions(pageSize, '24')
    expect(sceneTitles()).toHaveLength(24)
    expect(sceneTitles()[0]).toBe('Scene 30')
    expect(screen.getByText('1–24 of 30 scenes')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    await browserUser.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(sceneTitles()).toHaveLength(6)
    await browserUser.selectOptions(pageSize, '48')
    expect(sceneTitles()).toHaveLength(30)
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled()
    expect(authState.authenticatedFetch).toHaveBeenCalledTimes(1)
  })

  it('shows an empty, bounded page for unmatched searches and restores the first page when cleared', async () => {
    const browserUser = userEvent.setup()
    renderProfile()
    await waitForProfile()
    await browserUser.click(screen.getByRole('button', { name: 'Go to next page' }))
    await browserUser.type(screen.getByRole('searchbox', { name: 'Search scenes' }), 'missing')

    expect(screen.getByRole('heading', { name: 'No matching scenes' })).toBeInTheDocument()
    expect(sceneTitles()).toEqual([])
    expect(screen.getByText('0 of 0 scenes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled()
    await browserUser.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByRole('searchbox', { name: 'Search scenes' })).toHaveValue('')
    expect(sceneTitles()[0]).toBe('Scene 30')
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
  })

  it('disables sort and search without showing pagination for a profile with no scenes', async () => {
    authState.authenticatedFetch.mockResolvedValue(profileResponse('aririvera', 0))
    renderProfile()
    await waitForProfile()

    expect(screen.getByRole('heading', { name: 'No scenes yet' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sort scenes' })).toBeDisabled()
    expect(screen.getByRole('searchbox', { name: 'Search scenes' })).toBeDisabled()
    expect(screen.queryByRole('navigation', { name: 'Profile scene pagination' })).not.toBeInTheDocument()
  })

  it('resets search, sort, page size, and page when navigating to another user profile', async () => {
    const browserUser = userEvent.setup()
    renderProfile()
    await waitForProfile()
    await browserUser.selectOptions(screen.getByRole('combobox', { name: 'Sort scenes' }), 'ascending')
    await browserUser.selectOptions(screen.getByRole('combobox', { name: 'Scenes per page' }), '24')
    await browserUser.type(screen.getByRole('searchbox', { name: 'Search scenes' }), 'Scene')
    await browserUser.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()

    await browserUser.click(screen.getByRole('link', { name: 'Visit Kai' }))

    expect(await screen.findByRole('heading', { name: 'Kai Tanaka', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sort scenes' })).toHaveValue('descending')
    expect(screen.getByRole('combobox', { name: 'Scenes per page' })).toHaveValue('12')
    expect(screen.getByRole('searchbox', { name: 'Search scenes' })).toHaveValue('')
    expect(sceneTitles()).toHaveLength(12)
    expect(sceneTitles()[0]).toBe('Scene 30')
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(authState.authenticatedFetch).toHaveBeenCalledTimes(2)
    expect(authState.authenticatedFetch).toHaveBeenLastCalledWith('/profiles/kaitanaka')
  })
})

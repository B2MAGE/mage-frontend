import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_THEME_STORAGE_KEY, ThemeProvider, type AppThemeId } from '@theme'
import { ScenesPage } from './ScenesPage'

const mockTags = [{ tagId: 1, name: 'fire', sceneCount: 26 }, { tagId: 2, name: 'water', sceneCount: 14 }]
function scene(sceneId: number, name = `Scene ${sceneId}`) {
  return {
    sceneId, ownerUserId: 10, creatorDisplayName: 'Scene Artist', creatorHandle: 'artist', name,
    thumbnailRef: null, createdAt: '2026-10-01T12:00:00Z',
    engagement: { views: sceneId * 10, comments: 0, likesRatio: 0, upvotes: 0, downvotes: 0, saves: 0, currentUserVote: null, currentUserSaved: false },
  }
}
const mockScenes = [scene(1, 'Sunset Scene'), scene(2, 'Ocean Breeze')]
function scenes(start: number, count: number) { return Array.from({ length: count }, (_, index) => scene(start + index)) }
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }) }
function page(url: URL, items = mockScenes, totalElements = items.length) {
  const pageIndex = Number(url.searchParams.get('page'))
  const size = Number(url.searchParams.get('size'))
  return { items, page: pageIndex, size, totalElements, totalPages: Math.ceil(totalElements / size) }
}
function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return <>
    <output data-testid="location-search" hidden>{location.pathname}{location.search}</output>
    <button onClick={() => navigate(-1)}>Browser back</button>
    <button onClick={() => navigate(1)}>Browser forward</button>
  </>
}
function renderScenesPage(path = '/scenes', themeId: AppThemeId = 'mage-pulse', previousPath?: string) {
  window.localStorage.setItem(APP_THEME_STORAGE_KEY, themeId)
  return render(<MemoryRouter initialEntries={previousPath ? [previousPath, path] : [path]}>
    <ThemeProvider>
      <Routes><Route path="/scenes" element={<ScenesPage />} /><Route path="/before" element={<p>Before page</p>} /></Routes>
      <LocationProbe />
    </ThemeProvider>
  </MemoryRouter>)
}
function mockRequests(respond: (url: URL, init?: RequestInit) => Response | Promise<Response> = url => json(page(url))) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = new URL(typeof input === 'string' ? input : (input as Request).url, 'http://localhost')
    if (url.pathname === '/api/tags') return Promise.resolve(json(mockTags))
    if (url.pathname === '/api/scene-availability') return Promise.resolve(json(
      url.searchParams.get('ids')!.split(',').map(id => ({ sceneId: Number(id), available: true, code: 'AVAILABLE', message: null })),
    ))
    if (url.pathname === '/api/scenes/discovery') return Promise.resolve(respond(url, init))
    throw new Error(`Unexpected request: ${url}`)
  })
}
function discoveryCalls(fetchSpy: ReturnType<typeof mockRequests>) {
  return fetchSpy.mock.calls.filter(([input]) => String(input).includes('/scenes/discovery')).map(([input]) => new URL(String(input), 'http://localhost'))
}
function currentQuery() { return new URL(screen.getByTestId('location-search').textContent!, 'http://localhost').searchParams }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('ScenesPage server pagination', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  })

  it('uses shared loading placeholders while the first request is pending', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    const { container } = renderScenesPage()
    expect(screen.getByText('Loading scenes')).toHaveAttribute('role', 'status')
    expect(screen.getByText('Loading scene filters')).toHaveAttribute('role', 'status')
    expect(container.querySelectorAll('.scene-card--loading')).toHaveLength(8)
    expect(screen.getByRole('region', { name: 'Scene results' })).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('main.scenes-page')).toHaveClass('ui-page-frame', 'ui-page-frame--wide')
    expect(screen.getByRole('region', { name: 'Scene filters' })).toHaveClass('ui-panel', 'ui-panel--nested')
  })

  it('renders only the summary response in server order without fetching scene documents', async () => {
    const fetchSpy = mockRequests(url => json(page(url, [mockScenes[0], mockScenes[1]])))
    renderScenesPage()
    await screen.findByText('Sunset Scene')
    expect(within(screen.getByLabelText('Scene list')).getAllByRole('heading').map(node => node.textContent))
      .toEqual(['Sunset Scene', 'Ocean Breeze'])
    expect(screen.getByText('10 views')).toBeInTheDocument()
    expect(screen.getByText('20 views')).toBeInTheDocument()
    expect(screen.getByText('1–2 of 2 scenes')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled()
    expect(fetchSpy.mock.calls.map(([input]) => String(input)).filter(url => !url.includes('/scene-availability'))).toEqual([
      '/api/tags?attachedOnly=true', '/api/scenes/discovery?page=0&size=12&sort=descending',
    ])
  })

  it('loads a linked last page using the URL and displays server totals', async () => {
    const fetchSpy = mockRequests(url => json(page(url, scenes(25, 2), 26)))
    renderScenesPage('/scenes?page=3&size=12&sort=most-viewed&tag=fire&campaign=demo')
    await screen.findByText('Scene 25')
    expect(screen.getByText('25–26 of 26 scenes')).toBeInTheDocument()
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Sort scenes' })).toHaveValue('most-viewed')
    expect(discoveryCalls(fetchSpy)[0].searchParams.toString()).toBe('page=2&size=12&sort=most-viewed&tag=fire')
    expect(currentQuery().get('campaign')).toBe('demo')
  })

  it('loads next/previous pages and follows browser Back and Forward', async () => {
    const fetchSpy = mockRequests(url => {
      const index = Number(url.searchParams.get('page'))
      return json(page(url, scenes(index * 12 + 1, index === 2 ? 2 : 12), 26))
    })
    const user = userEvent.setup()
    renderScenesPage('/scenes?tag=fire&sort=ascending&campaign=demo')
    await screen.findByText('Scene 1')
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    await screen.findByText('Scene 13')
    expect(screen.getByRole('region', { name: 'Scene results' })).toHaveFocus()
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    expect(screen.queryByText('Scene 1')).not.toBeInTheDocument()
    expect(currentQuery().get('page')).toBe('2')
    expect(currentQuery().get('campaign')).toBe('demo')
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    await screen.findByText('Scene 25')
    await user.click(screen.getByRole('button', { name: 'Go to previous page' }))
    await screen.findByText('Scene 13')
    await user.click(screen.getByRole('button', { name: 'Browser back' }))
    await screen.findByText('Scene 25')
    expect(screen.getByRole('button', { name: 'Browser back' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Browser forward' }))
    await screen.findByText('Scene 13')
    expect(discoveryCalls(fetchSpy).map(url => url.searchParams.get('page'))).toEqual(['0', '1', '2', '1', '2', '1'])
    expect(discoveryCalls(fetchSpy).every(url => url.searchParams.get('tag') === 'fire' && url.searchParams.get('sort') === 'ascending')).toBe(true)
  })

  it.each(['sort', 'tag', 'size'] as const)('resets to page one when %s changes and retains other query parameters', async key => {
    const fetchSpy = mockRequests(url => {
      const start = Number(url.searchParams.get('page')) * Number(url.searchParams.get('size'))
      return json(page(url, scenes(start + 1, Math.min(Number(url.searchParams.get('size')), 49 - start)), 49))
    })
    const user = userEvent.setup()
    renderScenesPage('/scenes?page=2&tag=fire&sort=ascending&size=12&campaign=demo')
    await screen.findByText('Scene 13')
    if (key === 'sort') await user.selectOptions(screen.getByRole('combobox', { name: 'Sort scenes' }), 'most-liked')
    if (key === 'tag') await user.click(screen.getByRole('button', { name: 'water' }))
    if (key === 'size') await user.selectOptions(screen.getByRole('combobox', { name: 'Scenes per page' }), '24')
    await screen.findByText('Scene 1')
    const last = discoveryCalls(fetchSpy).at(-1)!.searchParams
    expect(last.get('page')).toBe('0')
    expect(last.get('sort')).toBe(key === 'sort' ? 'most-liked' : 'ascending')
    expect(last.get('tag')).toBe(key === 'tag' ? 'water' : 'fire')
    expect(last.get('size')).toBe(key === 'size' ? '24' : '12')
    expect(currentQuery().get('page')).toBe('1')
    expect(currentQuery().get('campaign')).toBe('demo')
    if (key === 'size') expect(screen.getByRole('region', { name: 'Scene results' })).toHaveFocus()
    else expect(screen.getByRole('region', { name: 'Scene results' })).not.toHaveFocus()
  })

  it('normalizes malformed parameters by replacing history before requesting', async () => {
    const fetchSpy = mockRequests()
    const user = userEvent.setup()
    renderScenesPage('/scenes?page=-8&size=999&sort=invalid&tag=%20fire%20&campaign=demo', 'mage-pulse', '/before')
    await screen.findByText('Sunset Scene')
    expect(currentQuery().toString()).toBe('page=1&size=12&sort=descending&tag=fire&campaign=demo')
    expect(discoveryCalls(fetchSpy)).toHaveLength(1)
    expect(discoveryCalls(fetchSpy)[0].searchParams.toString()).toBe('page=0&size=12&sort=descending&tag=fire')
    await user.click(screen.getByRole('button', { name: 'Browser back' }))
    expect(await screen.findByText('Before page')).toBeInTheDocument()
  })

  it('replaces an out-of-range page with the final valid page, then refetches once', async () => {
    const fetchSpy = mockRequests(url => json(page(url, url.searchParams.get('page') === '8' ? [] : scenes(13, 1), 13)))
    const user = userEvent.setup()
    renderScenesPage('/scenes?page=9&tag=fire&campaign=demo', 'mage-pulse', '/before')
    await screen.findByText('Scene 13')
    expect(discoveryCalls(fetchSpy).map(url => url.searchParams.get('page'))).toEqual(['8', '1'])
    expect(currentQuery().get('page')).toBe('2')
    expect(currentQuery().get('campaign')).toBe('demo')
    expect(screen.getByText('13–13 of 13 scenes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Browser back' }))
    expect(await screen.findByText('Before page')).toBeInTheDocument()
  })

  it('returns to page one after deletion removes the final page', async () => {
    let calls = 0
    const fetchSpy = mockRequests(url => {
      calls += 1
      return json(page(url, calls === 1 ? scenes(1, 12) : calls === 2 ? [] : scenes(1, 10), calls === 1 ? 13 : 10))
    })
    const user = userEvent.setup()
    renderScenesPage()
    await screen.findByText('Scene 1')
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    await screen.findByText('1–10 of 10 scenes')
    expect(currentQuery().get('page')).toBe('1')
    expect(discoveryCalls(fetchSpy).map(url => url.searchParams.get('page'))).toEqual(['0', '1', '0'])
  })

  it('bounds automatic page correction if totals keep changing', async () => {
    let calls = 0
    const fetchSpy = mockRequests(url => json(page(url, [], ++calls === 1 ? 25 : 13)))
    renderScenesPage('/scenes?page=9')
    expect(await screen.findByRole('alert')).toHaveTextContent('Scenes couldn’t be loaded')
    expect(discoveryCalls(fetchSpy).map(url => url.searchParams.get('page'))).toEqual(['8', '2'])
  })

  it.each(['mage-pulse', 'classic-facebook'] as const)('shows an empty filtered page and clears its filter in %s', async themeId => {
    const fetchSpy = mockRequests(url => json(page(url, [], 0)))
    const user = userEvent.setup()
    renderScenesPage('/scenes?page=8&tag=fire&sort=most-liked', themeId)
    expect(await screen.findByRole('heading', { name: 'No scenes match this tag' })).toBeInTheDocument()
    expect(screen.getByText('0 of 0 scenes')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
    expect(currentQuery().get('page')).toBe('1')
    await user.click(screen.getByRole('button', { name: 'Show all scenes' }))
    expect(await screen.findByRole('heading', { name: 'No scenes here yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create a scene' })).toHaveAttribute('href', '/create-scene')
    expect(currentQuery().has('tag')).toBe(false)
    expect(currentQuery().get('sort')).toBe('most-liked')
    expect(discoveryCalls(fetchSpy)).toHaveLength(3)
  })

  it('keeps unknown active tags visible until the user clears them', async () => {
    mockRequests(url => json(page(url, [], 0)))
    renderScenesPage('/scenes?tag=unlisted')
    expect(await screen.findByRole('button', { name: 'unlisted' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('retries the same failed query without presenting an empty result', async () => {
    let calls = 0
    const fetchSpy = mockRequests(url => ++calls === 1 ? json({}, 500) : json(page(url)))
    const user = userEvent.setup()
    renderScenesPage('/scenes?tag=fire&sort=most-viewed')
    expect(await screen.findByRole('alert')).toHaveTextContent('Scenes couldn’t be loaded')
    expect(screen.queryByRole('heading', { name: 'No scenes match this tag' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Sunset Scene')).toBeInTheDocument()
    expect(discoveryCalls(fetchSpy).map(url => url.search)).toEqual([
      '?page=0&size=12&sort=most-viewed&tag=fire', '?page=0&size=12&sort=most-viewed&tag=fire',
    ])
  })

  it.each(['resolve', 'reject'] as const)('aborts superseded work and ignores a stale %s even if abort is ignored', async finish => {
    const stale = deferred<Response>()
    const current = deferred<Response>()
    let oldSignal: AbortSignal | undefined
    const fetchSpy = mockRequests((url, init) => {
      if (!url.searchParams.has('tag')) return json(page(url))
      if (url.searchParams.get('tag') === 'fire') { oldSignal = init?.signal as AbortSignal; return stale.promise }
      return current.promise
    })
    const user = userEvent.setup()
    renderScenesPage()
    await screen.findByText('Sunset Scene')
    await user.click(screen.getByRole('button', { name: 'fire' }))
    expect(screen.getByText('Loading scenes')).toBeInTheDocument()
    expect(screen.queryByText('Sunset Scene')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'water' }))
    expect(oldSignal?.aborted).toBe(true)
    await act(async () => current.resolve(json(page(discoveryCalls(fetchSpy).at(-1)!, [scene(3, 'Current water scene')]))))
    await screen.findByText('Current water scene')
    await act(async () => {
      if (finish === 'resolve') stale.resolve(json(page(discoveryCalls(fetchSpy)[1], [scene(4, 'Stale fire scene')])))
      else stale.reject(new Error('Old request failed'))
    })
    expect(screen.getByText('Current water scene')).toBeInTheDocument()
    expect(screen.queryByText('Stale fire scene')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(currentQuery().get('tag')).toBe('water')
  })

  it('aborts the outstanding request on unmount', async () => {
    let signal: AbortSignal | undefined
    mockRequests((_url, init) => { signal = init?.signal as AbortSignal; return new Promise(() => {}) })
    const mounted = renderScenesPage()
    await waitFor(() => expect(signal).toBeDefined())
    mounted.unmount()
    expect(signal?.aborted).toBe(true)
  })
})

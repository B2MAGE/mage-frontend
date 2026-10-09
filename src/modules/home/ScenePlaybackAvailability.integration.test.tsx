import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@theme'
import { HomePage } from './HomePage'
import { SceneDetailPage } from '../scene-detail/SceneDetailPage'
import { sceneAvailabilityStore } from '../player/availability/sceneAvailability'
import { sceneRecovery } from '../player/recovery/sceneRecovery'
import type { createIsolatedPlaybackHost } from '../player/isolation/playbackHost'

const boundary = vi.hoisted(() => ({ host: vi.fn(), parentEngine: vi.fn() }))
const auth = vi.hoisted(() => ({ isAuthenticated: false, isRestoringSession: false, user: null, authenticatedFetch: vi.fn() }))
vi.mock('@auth', () => ({ useAuth: () => auth }))
vi.mock('@modules/scene-artwork', () => ({ BrandScene: () => null }))
vi.mock('@notrac/mage', () => ({ initMAGE: boundary.parentEngine }))
vi.mock('../player/isolation/rendererConfig', () => ({ getIsolatedRendererUrl: () => 'https://renderer.example.net/index.html' }))
vi.mock('../player/isolation/playbackHost', () => ({ createIsolatedPlaybackHost: boundary.host }))

// Keep page loaders, validation, MagePlayer, availability/recovery, adapter and
// parent audio/controller real. Only the final cross-site transport is replaced;
// jsdom cannot execute WebGL inside an opaque child. No scene source runs here.
function transport(options: Parameters<typeof createIsolatedPlaybackHost>[0]) {
  const frame = document.createElement('iframe')
  frame.title = 'Isolated scene player'
  frame.setAttribute('sandbox', 'allow-scripts')
  options.container.append(frame)
  return { ready: Promise.resolve(), frame, loadScene: vi.fn(async (_scene: unknown) => { void _scene }),
    getCapabilities: vi.fn(async () => ({ supportedTargets: ['size'] })),
    resize: vi.fn(), setPlayback: vi.fn(), setSynthetic: vi.fn(), setAudioResponse: vi.fn(), setZoom: vi.fn(), update: vi.fn(),
    capture: vi.fn(async () => new Blob()), dispose: vi.fn(() => frame.remove()) }
}

const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
const custom = { schemaVersion: 1, kind: 'custom', scene: { visualizer: { shader: 'sphere(0.7); // cached-source-must-not-run-in-parent' } } }
const privateReason = 'PRIVATE operator 9821 investigated account details'
const engagement = { views: 18, upvotes: 2, downvotes: 0, saves: 1, currentUserVote: null, currentUserSaved: false }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
type Page = 'home' | 'detail'
let nextId = 800
let id: number, disabled: boolean, customEnabled: boolean, sourceWithheld: boolean, statusFails: boolean
let detailFailure: 'network' | 'invalid' | null, currentSource: typeof template | typeof custom, thumbnail: string | null
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, hosts: ReturnType<typeof transport>[]

function detail() {
  return { sceneId: id, ownerUserId: 8, creatorDisplayName: 'Scene Artist', creatorHandle: 'artist',
    name: 'Availability integration scene', description: 'The scene description stays visible.',
    sceneData: sourceWithheld ? null : currentSource, thumbnailRef: thumbnail, tags: ['ambient'],
    createdAt: '2026-10-03T00:00:00Z', engagement,
    availability: { sceneId: id, available: !sourceWithheld, code: sourceWithheld ? 'SCENE_DISABLED' : 'AVAILABLE', message: privateReason } }
}

function show(page: Page) {
  return render(<MemoryRouter initialEntries={[page === 'home' ? '/' : `/scenes/${id}`]}><ThemeProvider><Routes>
    <Route path="/" element={<HomePage />} /><Route path="/scenes/:id" element={<SceneDetailPage />} />
  </Routes></ThemeProvider></MemoryRouter>)
}

function assertNoParentRenderer(container: HTMLElement) {
  expect(container.querySelector('canvas')).toBeNull()
  expect(boundary.parentEngine).not.toHaveBeenCalled()
  expect(container.textContent).not.toContain(privateReason)
  expect(container.textContent).not.toContain('cached-source-must-not-run-in-parent')
}

beforeEach(() => {
  id = ++nextId; disabled = false; customEnabled = true; sourceWithheld = false; statusFails = false
  detailFailure = null; currentSource = template; thumbnail = '/scene-poster.png'; hosts = []
  vi.clearAllMocks()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  sceneRecovery.setSafeMode(false)
  sceneAvailabilityStore.invalidate()
  window.localStorage.setItem('mage.home.create-prompt.hidden', 'true')
  vi.stubEnv('VITE_HOME_FEATURED_SCENE_ID', String(id))
  boundary.parentEngine.mockImplementation(() => { throw new Error('Untrusted parent renderer fallback is forbidden.') })
  boundary.host.mockImplementation(options => {
    // The real guards must grant permission before any child can be allocated.
    const target = currentSource.kind === 'template' ? `template:${id}` as const : id
    expect(sceneAvailabilityStore.isAllowed(target)).toBe(true)
    const host = transport(options); hosts.push(host); return host
  })
  fetchMock = vi.fn<typeof fetch>(async input => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
    if (url.pathname === '/api/rendering-status') {
      if (statusFails) throw new TypeError('Status service offline')
      return json({ enabled: customEnabled, code: customEnabled ? 'AVAILABLE' : 'CUSTOM_RENDERING_DISABLED', message: privateReason })
    }
    if (url.pathname === '/api/scene-availability') {
      if (statusFails) throw new TypeError('Status service offline')
      return json((url.searchParams.get('ids') ?? '').split(',').map(Number).map(sceneId => ({
        sceneId, available: !disabled, code: disabled ? 'SCENE_DISABLED' : 'AVAILABLE', message: privateReason, reason: privateReason,
      })))
    }
    if (url.pathname === `/api/scenes/${id}`) {
      if (detailFailure === 'network') return json({ message: privateReason }, 503)
      if (detailFailure === 'invalid') return json({ ...detail(), sceneData: null, availability: { sceneId: id, available: true, code: 'AVAILABLE' } })
      return json(detail())
    }
    if (url.pathname === `/api/scenes/${id}/view`) return json(engagement)
    if (url.pathname.endsWith('/comments') || url.pathname === '/api/tags') return json([])
    if (url.pathname === '/api/scenes') return json([detail()])
    throw new Error(`Unexpected request in availability integration: ${url.pathname}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  cleanup()
  sceneAvailabilityStore.invalidate()
  await act(async () => {})
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe.each(['home', 'detail'] as const)('%s page through the real playback permission boundary', page => {
  it.each([null, '/scene-poster.png'])('keeps disabled metadata and a static state with thumbnail %s, without retry or source fallback', async poster => {
    disabled = true; sourceWithheld = true; thumbnail = poster
    const view = show(page)
    await waitFor(() => expect(view.container.querySelector('[data-state="unavailable"]')).toHaveTextContent('Playback unavailable'))
    expect(screen.getByText('The scene description stays visible.')).toBeInTheDocument()
    expect(screen.getAllByText('Availability integration scene').length).toBeGreaterThan(0)
    if (poster) expect(view.container.querySelector('.mage-player__recovery-poster')).toHaveAttribute('src', poster)
    else expect(view.container.querySelector('.mage-player__recovery-poster')).toBeNull()
    expect(screen.queryByRole('button', { name: /^(Check again|Retry scene|Resume scene)$/ })).not.toBeInTheDocument()
    expect(boundary.host).not.toHaveBeenCalled()
    expect(view.container.querySelector('iframe')).toBeNull()
    assertNoParentRenderer(view.container)
  })

  it('refuses cached custom source when the live global switch is disabled', async () => {
    currentSource = custom; customEnabled = false
    const view = show(page)
    expect(await screen.findByText('Scene playback is temporarily disabled.')).toBeInTheDocument()
    expect(screen.getByText('The scene description stays visible.')).toBeInTheDocument()
    expect(boundary.host).not.toHaveBeenCalled()
    expect(view.container.querySelector('iframe')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument()
    assertNoParentRenderer(view.container)
  })

  it('refetches withheld source only after re-enable, then removes the isolated player on a fresh disable', async () => {
    disabled = true; sourceWithheld = true
    const view = show(page)
    await waitFor(() => expect(view.container.querySelector('.mage-player[data-state="unavailable"]')).toHaveTextContent('Playback unavailable'))
    expect(boundary.host).not.toHaveBeenCalled()
    const detailRequests = () => fetchMock.mock.calls.filter(([url]) => new URL(String(url), 'http://localhost').pathname === `/api/scenes/${id}`).length
    const before = detailRequests()
    disabled = false; sourceWithheld = false
    await act(async () => { await sceneAvailabilityStore.refresh() })
    await waitFor(() => expect(hosts[0]?.loadScene).toHaveBeenCalledOnce())
    expect(detailRequests()).toBeGreaterThan(before)
    expect(view.container.querySelector('iframe')).toBe(hosts[0].frame)
    expect(hosts[0].loadScene.mock.calls[0][0]).toMatchObject(template)
    disabled = true
    await act(async () => { await sceneAvailabilityStore.refresh() })
    await waitFor(() => expect(view.container.querySelector('.mage-player[data-state="unavailable"]')).toHaveTextContent('Playback unavailable'))
    expect(hosts[0].dispose).toHaveBeenCalledOnce()
    expect(view.container.querySelector('iframe')).toBeNull()
    expect(screen.getByText('The scene description stays visible.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry scene' })).not.toBeInTheDocument()
    assertNoParentRenderer(view.container)
  })

  it('fails closed after a status network failure and requires a successful check to allocate a replacement', async () => {
    const view = show(page)
    await waitFor(() => expect(hosts[0]?.loadScene).toHaveBeenCalledOnce())
    statusFails = true
    await act(async () => { await sceneAvailabilityStore.refresh() })
    expect(await screen.findByText('Playback is paused until scene availability can be checked.')).toBeInTheDocument()
    expect(hosts[0].dispose).toHaveBeenCalledOnce()
    expect(view.container.querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check again' })).toBeEnabled())
    expect(hosts).toHaveLength(1)
    statusFails = false
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(hosts[1]?.loadScene).toHaveBeenCalledOnce())
    expect(view.container.querySelector('iframe')).toBe(hosts[1].frame)
    assertNoParentRenderer(view.container)
  })

  it('distinguishes a failed scene request from a policy block and retries through real loaders', async () => {
    detailFailure = 'network'
    const view = show(page)
    const retry = await screen.findByRole('button', { name: 'Try again' })
    expect(screen.queryByText('Playback unavailable')).not.toBeInTheDocument()
    expect(boundary.host).not.toHaveBeenCalled()
    detailFailure = null
    fireEvent.click(retry)
    await waitFor(() => expect(hosts[0]?.loadScene).toHaveBeenCalledOnce())
    assertNoParentRenderer(view.container)
  })

  it('keeps a genuinely incomplete scene response separate from policy denial with no renderer fallback', async () => {
    detailFailure = 'invalid'
    const view = show(page)
    await waitFor(() => expect(view.container.querySelector('[role="alert"]')).toBeInTheDocument())
    expect(screen.queryByText('Playback unavailable')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(view.container.textContent).not.toMatch(/backend|payload|live player flow/i)
    expect(boundary.host).not.toHaveBeenCalled()
    expect(view.container.querySelector('iframe')).toBeNull()
    assertNoParentRenderer(view.container)
  })
})

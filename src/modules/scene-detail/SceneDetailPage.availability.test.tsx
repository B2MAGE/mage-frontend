import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeSceneDetail } from './dto'
import { fetchRecommendedSceneGroups, fetchSceneComments, fetchSceneDetail, recordSceneView, SceneDetailRequestError } from './loaders'
import { SceneDetailPage } from './SceneDetailPage'
import type { SceneDetail } from './types'

const auth = vi.hoisted(() => ({ authenticatedFetch: vi.fn(), isAuthenticated: false, isRestoringSession: false, user: null }))
vi.mock('@auth', () => ({ useAuth: () => auth }))
vi.mock('./loaders', async original => ({
  ...await original<typeof import('./loaders')>(),
  fetchSceneDetail: vi.fn(), fetchSceneComments: vi.fn(), fetchRecommendedSceneGroups: vi.fn(), recordSceneView: vi.fn(),
}))
vi.mock('@modules/player', async original => ({
  ...await original<typeof import('@modules/player')>(),
  SceneAvailabilityAdminControls: ({sceneId}: {sceneId:number}) => <div data-testid="operator-controls" data-scene-id={sceneId}/>,
  MagePlayer: ({ sceneBlob, sceneKey, posterUrl, onAvailabilityRestored }: {
    sceneBlob: unknown; sceneKey: number; posterUrl?: string | null; onAvailabilityRestored?: () => Promise<void>
  }) => <div data-testid="detail-player" data-scene-id={sceneKey}>
    {sceneBlob ? 'Player has scene source' : <><span>Playback temporarily unavailable</span>{posterUrl && <img src={posterUrl} alt="Scene poster"/>}</>}
    <button type="button" onClick={() => void onAvailabilityRestored?.()}>Restore verified playback</button>
  </div>,
}))

function unavailableScene(id = 23): SceneDetail {
  return normalizeSceneDetail({
    sceneId: id, ownerUserId: 8, creatorDisplayName: 'Scene Artist', creatorHandle: 'artist',
    name: `Signal Bloom ${id}`, description: 'Soft movement.', sceneData: null,
    createdAt: '2026-10-03T00:00:00Z', thumbnailRef: '/signal.png', tags: ['ambient'],
    availability: { sceneId: id, available: false, code: 'SCENE_DISABLED', message: 'Scene playback is unavailable.' },
  })!
}

function show() {
  return render(<MemoryRouter initialEntries={['/scenes/23']}>
    <Link to="/scenes/24">Next scene</Link>
    <Routes><Route path="/scenes/:id" element={<SceneDetailPage/>}/></Routes>
  </MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchSceneDetail).mockResolvedValue(unavailableScene())
  vi.mocked(fetchSceneComments).mockResolvedValue([])
  vi.mocked(fetchRecommendedSceneGroups).mockResolvedValue({ all: [], creator: [], byTag: {} })
  vi.mocked(recordSceneView).mockResolvedValue(unavailableScene().engagement)
})

describe('unavailable scene details', () => {
  it('retains title, creator, thumbnail, description, tags and controls around the player', async () => {
    show()
    expect(await screen.findByRole('heading', { name: 'Signal Bloom 23' })).toBeInTheDocument()
    expect(screen.getByText('Playback temporarily unavailable')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Scene poster' })).toHaveAttribute('src', '/signal.png')
    expect(screen.getByRole('link', { name: /Scene Artist/ })).toHaveAttribute('href', '/@artist')
    expect(screen.getByText('Soft movement.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ambient' })).toBeInTheDocument()
    expect(screen.getByTestId('detail-player')).toHaveAttribute('data-scene-id', '23')
    expect(screen.getByTestId('operator-controls')).toHaveAttribute('data-scene-id', '23')
    expect(screen.queryByText(/backend|payload|live player flow/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('refreshes source after re-enablement while leaving metadata visible', async () => {
    show()
    await screen.findByRole('heading', { name: 'Signal Bloom 23' })
    let resolveRefresh!: (value: SceneDetail) => void
    vi.mocked(fetchSceneDetail).mockImplementationOnce(() => new Promise(resolve => { resolveRefresh = resolve }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore verified playback' }))
    expect(screen.getByRole('heading', { name: 'Signal Bloom 23' })).toBeInTheDocument()
    expect(screen.queryByText('Loading scene')).not.toBeInTheDocument()
    await act(async () => resolveRefresh({ ...unavailableScene(), sceneData: { visualizer: { shader: 'repaired' } } }))
    expect(await screen.findByText('Player has scene source')).toBeInTheDocument()
  })

  it('ignores an older restore response after navigating to another scene', async () => {
    show()
    await screen.findByRole('heading', { name: 'Signal Bloom 23' })
    let resolveRefresh!: (value: SceneDetail) => void
    vi.mocked(fetchSceneDetail).mockImplementationOnce(() => new Promise(resolve => { resolveRefresh = resolve }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore verified playback' }))
    vi.mocked(fetchSceneDetail).mockResolvedValueOnce(unavailableScene(24))
    fireEvent.click(screen.getByRole('link', { name: 'Next scene' }))
    await screen.findByRole('heading', { name: 'Signal Bloom 24' })
    await act(async () => resolveRefresh({ ...unavailableScene(), sceneData: { visualizer: { shader: 'stale' } } }))
    expect(screen.getByRole('heading', { name: 'Signal Bloom 24' })).toBeInTheDocument()
    expect(screen.getByTestId('detail-player')).toHaveAttribute('data-scene-id', '24')
    expect(screen.queryByText('Player has scene source')).not.toBeInTheDocument()
  })

  it('keeps genuinely malformed scene responses separate from disabled playback', async () => {
    vi.mocked(fetchSceneDetail).mockRejectedValueOnce(new SceneDetailRequestError('invalid-payload', 'Unexpected missing source'))
    show()
    expect(await screen.findByRole('heading', { name: 'This scene couldn’t be loaded' })).toBeInTheDocument()
    expect(screen.queryByTestId('detail-player')).not.toBeInTheDocument()
    expect(screen.queryByText(/backend|payload|live player flow/i)).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('There’s a problem loading this scene. You can explore other scenes.')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    await waitFor(() => expect(fetchSceneComments).not.toHaveBeenCalled())
  })

  it('allows a failed scene request to be retried from the keyboard', async () => {
    vi.mocked(fetchSceneDetail).mockRejectedValueOnce(new Error('Private server details'))
    show()
    expect(await screen.findByRole('heading', { name: 'Unable to load this scene' })).toBeInTheDocument()
    expect(screen.queryByText('Private server details')).not.toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Try again' })
    retry.focus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: 'Signal Bloom 23' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(fetchSceneDetail).toHaveBeenCalledTimes(2)
  })

  it('ignores a pending retry after navigating to another scene', async () => {
    vi.mocked(fetchSceneDetail).mockRejectedValueOnce(new Error('Offline'))
    show()
    await screen.findByRole('heading', { name: 'Unable to load this scene' })
    let resolveRetry!: (value: SceneDetail) => void
    vi.mocked(fetchSceneDetail).mockImplementationOnce(() => new Promise(resolve => { resolveRetry = resolve }))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    vi.mocked(fetchSceneDetail).mockResolvedValueOnce(unavailableScene(24))
    fireEvent.click(screen.getByRole('link', { name: 'Next scene' }))
    await screen.findByRole('heading', { name: 'Signal Bloom 24' })
    await act(async () => resolveRetry(unavailableScene()))
    expect(screen.getByRole('heading', { name: 'Signal Bloom 24' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Signal Bloom 23' })).not.toBeInTheDocument()
  })

  it.each([
    ['not-found', 'Scene not found'],
    ['auth-required', 'Sign in to view this scene'],
  ] as const)('gives a useful destination instead of retrying a %s response', async (code, title) => {
    vi.mocked(fetchSceneDetail).mockRejectedValueOnce(new SceneDetailRequestError(code, 'Private server details'))
    show()
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.queryByText('Private server details')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: code === 'auth-required' ? 'Go to Login' : 'Explore scenes' }))
      .toHaveAttribute('href', code === 'auth-required' ? '/login' : '/scenes')
    expect(fetchSceneDetail).toHaveBeenCalledTimes(1)
  })
})

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    await waitFor(() => expect(fetchSceneComments).not.toHaveBeenCalled())
  })
})

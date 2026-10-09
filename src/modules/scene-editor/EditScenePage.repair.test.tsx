import { act, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse } from '@shared/test/http'
import { EditScenePage } from './EditScenePage'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), editor: vi.fn() }))
let authState = { authenticatedFetch: mocks.fetch, isAuthenticated: true, isRestoringSession: false, user: { userId: 8 } }
vi.mock('@auth', () => ({ useAuth: () => authState }))
vi.mock('./SceneEditorShell', () => ({ SceneEditorShell: (props: {
  initialState: { name: string; sceneData: unknown }; mode: { type: string; sceneId: number }
}) => {
  mocks.editor(props)
  return <div data-testid="editor" data-scene-id={props.mode.sceneId} data-source={JSON.stringify(props.initialState.sceneData)}>{props.initialState.name}</div>
} }))

const availability = { sceneId: 23, available: false, code: 'SCENE_DISABLED', message: 'Scene playback is unavailable.' }
const metadata = {
  sceneId: 23, ownerUserId: 8, creatorDisplayName: 'Scene Artist', name: 'Saved scene',
  description: 'Original description', sceneData: null, availability, thumbnailRef: '/saved.png',
  createdAt: '2026-10-03T00:00:00Z', tags: ['ambient'],
}
const source = { schemaVersion: 1, kind: 'custom', scene: { visualizer: { shader: 'sphere(1)' }, audioResponse: 'mapped-v1', state: { size: 0.3 } } }
const repair = { sceneId: 23, ownerUserId: 8, name: 'Saved scene', description: 'Original description',
  sceneData: source, thumbnailRef: '/saved.png', availability, playable: false }

function page() {
  return <MemoryRouter initialEntries={['/scenes/23/edit']}>
    <Link to="/scenes/24/edit">Next scene</Link>
    <Routes>
      <Route path="/scenes/:id/edit" element={<EditScenePage/>}/>
      <Route path="/login" element={<div>Sign in</div>}/>
    </Routes>
  </MemoryRouter>
}

beforeEach(() => {
  vi.clearAllMocks()
  authState = { authenticatedFetch: mocks.fetch, isAuthenticated: true, isRestoringSession: false, user: { userId: 8 } }
  mocks.fetch.mockImplementation((path: string) => {
    if (path === '/scenes/23') return Promise.resolve(jsonResponse(metadata))
    if (path === '/scenes/23/repair') return Promise.resolve(jsonResponse(repair))
    throw new Error(`Unexpected request: ${path}`)
  })
})

describe('owner repair loading', () => {
  it('opens builder repair data in the object editor', async () => {
    const builder = { schemaVersion: 1, kind: 'builder', builderVersion: 1,
      objects: [{ id: 'ball', operation: { type: 'sphere', radius: 0.7 } }] }
    const status = { ...availability, code: 'BUILDER_RENDERING_UNAVAILABLE', message: 'Builder scene playback is not available yet.' }
    mocks.fetch.mockImplementation(path => Promise.resolve(jsonResponse(path.endsWith('/repair')
      ? { ...repair, sceneData: builder, availability: status } : { ...metadata, sceneMode: 'builder-v1', availability: status })))
    render(page())
    expect(await screen.findByTestId('editor')).toHaveAttribute('data-source', JSON.stringify(builder))
    expect(mocks.editor).toHaveBeenCalledWith(expect.objectContaining({
      initialState: expect.objectContaining({ sceneData: builder }),
      mode: { type: 'edit', sceneId: 23 },
    }))
  })

  it('loads withheld source for its owner while preserving metadata and the saved scene ID', async () => {
    render(page())
    expect(await screen.findByTestId('editor')).toHaveAttribute('data-source', JSON.stringify(source))
    expect(mocks.fetch).toHaveBeenNthCalledWith(1, '/scenes/23')
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, '/scenes/23/repair', { cache: 'no-store' })
    expect(mocks.editor).toHaveBeenLastCalledWith(expect.objectContaining({
      initialState: { name: 'Saved scene', description: 'Original description', sceneData: source,
        tagNames: ['ambient'], thumbnailPreviewUrl: '/saved.png' },
      mode: { type: 'edit', sceneId: 23 },
    }))
  })

  it('uses ordinary scene source directly when it is already available', async () => {
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ...metadata, sceneData: source,
      availability: { ...availability, available: true, code: 'AVAILABLE' } }))
    render(page())
    await screen.findByTestId('editor')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('retains a custom envelope for recovery identity while providing it to the compatible editor', async () => {
    const custom = source
    mocks.fetch.mockImplementation(path => Promise.resolve(jsonResponse(path.endsWith('/repair')
      ? { ...repair, sceneData: custom } : { ...metadata, sceneMode: 'custom-v1' })))
    render(page())
    expect(await screen.findByTestId('editor')).toHaveAttribute('data-source', JSON.stringify(custom))
    expect(screen.getByTestId('editor')).toHaveAttribute('data-scene-id', '23')
  })

  it('rejects historical scenes without requesting a repair or mounting an editor', async () => {
    const legacy = { ...availability, code: 'SCENE_UPGRADE_REQUIRED', message: 'Upgrade required' }
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ...metadata, availability: legacy, sceneMode: 'legacy-custom' }))
    render(page())
    expect(await screen.findByText(/historical scene format is no longer supported/)).toBeInTheDocument()
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.editor).not.toHaveBeenCalled()
  })

  it('rejects raw historical source returned under a current scene label', async () => {
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ...metadata, sceneMode: 'custom-v1', sceneData: source.scene, availability: { ...availability, available: true, code: 'AVAILABLE' } }))
    render(page())
    expect(await screen.findByRole('heading', { name: /format is not supported/ })).toBeInTheDocument()
    expect(mocks.editor).not.toHaveBeenCalled()
  })

  it('opens a disabled template for owner editing while preserving its original document and scene ID', async () => {
    const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-0', templateVersion: 1 }
    mocks.fetch.mockImplementation(path => Promise.resolve(jsonResponse(path.endsWith('/repair')
      ? { ...repair, sceneData: template } : { ...metadata, sceneMode: 'template-v1' })))
    render(page())
    expect(await screen.findByTestId('editor')).toHaveAttribute('data-source', JSON.stringify(template))
    expect(screen.getByTestId('editor')).toHaveAttribute('data-scene-id', '23')
    expect(mocks.fetch).toHaveBeenCalledWith('/scenes/23/repair', { cache: 'no-store' })
  })

  it('opens a playable template directly without requesting owner repair or inserting shader source', async () => {
    const template = { schemaVersion: 1, kind: 'template', templateId: 'embedded-scene-1', templateVersion: 1,
      parameters: { speed: 0.5, scale: 8 }, settings: { skybox: 3 } }
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ...metadata, sceneData: template, sceneMode: 'template-v1',
      availability: { ...availability, available: true, code: 'AVAILABLE' } }))
    render(page())
    expect(await screen.findByTestId('editor')).toHaveAttribute('data-source', JSON.stringify(template))
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed document markers before creating an editor or preview', async () => {
    mocks.fetch.mockImplementation(path => Promise.resolve(jsonResponse(path.endsWith('/repair')
      ? { ...repair, sceneData: { schemaVersion: 99, kind: 'custom', scene: source } } : metadata)))
    render(page())
    expect(await screen.findByRole('heading', { name: 'This scene’s format is not supported' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download scene JSON' })).toBeInTheDocument()
    expect(mocks.editor).not.toHaveBeenCalled()
  })

  it('accepts owner repair when the scene is re-enabled between metadata and repair requests', async () => {
    mocks.fetch.mockImplementation(path => Promise.resolve(jsonResponse(path.endsWith('/repair')
      ? { ...repair, availability: { sceneId: 23, available: true, code: 'AVAILABLE', message: null } }
      : metadata)))
    render(page())
    expect(await screen.findByTestId('editor')).toHaveAttribute('data-source', JSON.stringify(source))
    expect(screen.getByTestId('editor')).toHaveAttribute('data-scene-id', '23')
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('does not request repair source for another creator’s scene', async () => {
    mocks.fetch.mockResolvedValueOnce(jsonResponse({ ...metadata, ownerUserId: 9 }))
    render(page())
    expect(await screen.findByText('You can only edit scenes created by your account.')).toBeInTheDocument()
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.editor).not.toHaveBeenCalled()
  })

  it.each([
    { ...metadata, sceneId: 24 },
    { ...metadata, availability: undefined },
    { ...metadata, sceneData: undefined },
    { ...metadata, sceneData: [] },
  ])('does not substitute defaults or request repair for malformed metadata: %j', async payload => {
    mocks.fetch.mockResolvedValueOnce(jsonResponse(payload))
    render(page())
    expect(await screen.findByRole('heading', { name: 'Unable to edit scene' })).toBeInTheDocument()
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.editor).not.toHaveBeenCalled()
  })

  it.each([
    { ...repair, sceneId: 24 },
    { ...repair, ownerUserId: 9 },
    { ...repair, playable: true },
    { ...repair, playable: undefined },
    { ...repair, sceneData: null },
    { ...repair, sceneData: [] },
    { ...repair, availability: undefined },
    { ...repair, availability: { ...availability, sceneId: 24 } },
  ])('rejects malformed or mismatched repair responses: %j', async payload => {
    mocks.fetch.mockImplementation(path => Promise.resolve(jsonResponse(path.endsWith('/repair') ? payload : metadata)))
    render(page())
    expect(await screen.findByText('This scene could not be opened for repair.')).toBeInTheDocument()
    expect(mocks.editor).not.toHaveBeenCalled()
  })

  it('shows a safe error if owner repair access is rejected', async () => {
    mocks.fetch.mockImplementation(path => Promise.resolve(path.endsWith('/repair')
      ? jsonResponse({ message: 'Private operator detail' }, 403) : jsonResponse(metadata)))
    render(page())
    expect(await screen.findByText('Unable to load this scene for repair. Please try again later.')).toBeInTheDocument()
    expect(screen.queryByText('Private operator detail')).not.toBeInTheDocument()
    expect(mocks.editor).not.toHaveBeenCalled()
  })

  it('ignores a late repair response after navigating to a different saved scene', async () => {
    let resolveRepair!: (response: Response) => void
    mocks.fetch.mockImplementation(path => {
      if (path === '/scenes/23/repair') return new Promise(resolve => { resolveRepair = resolve })
      if (path === '/scenes/24') return Promise.resolve(jsonResponse({ ...metadata, sceneId: 24, name: 'Next saved scene',
        sceneData: source, availability: { ...availability, sceneId: 24, available: true, code: 'AVAILABLE' } }))
      return Promise.resolve(jsonResponse(metadata))
    })
    render(page())
    await screen.findByText('Loading scene editor')
    await act(async () => {})
    fireEvent.click(screen.getByRole('link', { name: 'Next scene' }))
    expect(await screen.findByTestId('editor')).toHaveAttribute('data-scene-id', '24')
    await act(async () => resolveRepair(jsonResponse(repair)))
    expect(screen.getByTestId('editor')).toHaveTextContent('Next saved scene')
    expect(screen.getByTestId('editor')).toHaveAttribute('data-scene-id', '24')
  })

  it('ignores owner repair source from a previous account', async () => {
    let resolveRepair!: (response: Response) => void
    mocks.fetch.mockImplementation(path => path.endsWith('/repair')
      ? new Promise(resolve => { resolveRepair = resolve }) : Promise.resolve(jsonResponse(metadata)))
    const view = render(page())
    await act(async () => {})
    authState = { ...authState, user: { userId: 9 } }
    view.rerender(page())
    expect(await screen.findByText('You can only edit scenes created by your account.')).toBeInTheDocument()
    await act(async () => resolveRepair(jsonResponse(repair)))
    expect(mocks.editor).not.toHaveBeenCalled()
  })

  it('does not fetch repair source after an earlier account’s metadata request finishes', async () => {
    let resolveMetadata!: (response: Response) => void
    mocks.fetch.mockImplementationOnce(() => new Promise(resolve => { resolveMetadata = resolve }))
    const view = render(page())
    authState = { ...authState, user: { userId: 9 } }
    view.rerender(page())
    await screen.findByText('You can only edit scenes created by your account.')
    await act(async () => resolveMetadata(jsonResponse(metadata)))
    expect(mocks.fetch).not.toHaveBeenCalledWith('/scenes/23/repair', expect.anything())
    expect(mocks.editor).not.toHaveBeenCalled()
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModerationLoadingState } from './ModerationLoadingState'
import { ModerationPage } from './ModerationPage'
import { ModerationMenuLink } from './ModeratorSettingsLink'

const auth = vi.hoisted(() => ({ accessToken: 'staff-token', user: { userId: 1 }, isAuthenticated: true,
  isRestoringSession: false, authenticatedFetch: vi.fn() }))
vi.mock('@auth', () => ({ useAuth: () => auth }))
vi.mock('./CustomShaderControls', () => ({ CustomShaderControls: () => <div>Private custom shader tool</div> }))
vi.mock('./ModeratorsPage', () => ({ ModeratorsPage: () => <div>Private moderator management</div> }))

const admin = { canModerateScenes: true, canManageModerators: true, canManageCustomRendering: true }
const moderator = { canModerateScenes: true, canManageModerators: false, canManageCustomRendering: false }
const regular = { canModerateScenes: false, canManageModerators: false, canManageCustomRendering: false }

function SceneDestination() { const { id } = useParams(); return <h1>Opened scene {id}</h1> }
function show(path = '/moderation') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/moderation" element={<ModerationPage />} />
    <Route path="/moderation/playback" element={<ModerationPage section="playback" />} />
    <Route path="/moderation/moderators" element={<ModerationPage section="moderators" />} />
    <Route path="/scenes/:id" element={<SceneDestination />} />
  </Routes></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.accessToken = 'staff-token'
  auth.authenticatedFetch.mockResolvedValue(new Response(JSON.stringify(admin)))
})

describe('moderation area', () => {
  it('gives administrators navigation to both site-wide tools', async () => {
    show()
    const heading = await screen.findByRole('heading', { name: 'Moderation' })
    expect(heading.closest('main')).toHaveClass('ui-page-frame', 'ui-page-frame--form')
    expect(screen.queryByText('Admin workspace')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Moderation sections' })).toHaveClass(
      'ui-section-nav__list',
    )
    expect(screen.getByRole('heading', { name: 'Manage a scene' }).closest('section')).toHaveClass(
      'ui-panel',
    )
    expect(await screen.findByRole('link', { name: 'Custom shaders' })).toHaveAttribute('href', '/moderation/playback')
    expect(screen.getByRole('link', { name: 'Moderator access' })).toHaveAttribute('href', '/moderation/moderators')
    fireEvent.click(screen.getByRole('link', { name: 'Custom shaders' }))
    expect(await screen.findByText('Private custom shader tool')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Moderator access' }))
    expect(await screen.findByText('Private moderator management')).toBeInTheDocument()
    expect(screen.queryByText('Private custom shader tool')).not.toBeInTheDocument()
  })

  it('uses a route-specific shared loading shell while authentication restores', () => {
    render(<ModerationLoadingState />)
    expect(screen.getByRole('status')).toHaveTextContent('Restoring your session before loading moderation')
    expect(screen.getByRole('main')).toHaveClass('ui-page-frame', 'ui-page-frame--form')
  })

  it.each(['/moderation/playback', '/moderation/moderators'])('does not mount administrator tools for moderators visiting %s directly', async path => {
    auth.authenticatedFetch.mockResolvedValue(new Response(JSON.stringify(moderator)))
    show(path)
    expect(await screen.findByRole('heading', { name: 'Administrator access required' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scenes' })).toHaveAttribute('href', '/moderation')
    expect(screen.queryByRole('link', { name: 'Custom shaders' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Moderator access' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Private (custom shader tool|moderator management)/)).not.toBeInTheDocument()
    expect(auth.authenticatedFetch.mock.calls.every(([path]) => path === '/admin/capabilities')).toBe(true)
  })

  it('lets a moderator find scenes and open a scene by ID', async () => {
    auth.authenticatedFetch.mockResolvedValue(new Response(JSON.stringify(moderator)))
    show()
    expect(await screen.findByRole('link', { name: 'Browse scenes' })).toHaveAttribute('href', '/scenes')
    fireEvent.change(screen.getByLabelText('Or open a scene by ID'), { target: { value: '26' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open scene' }))
    expect(await screen.findByRole('heading', { name: 'Opened scene 26' })).toBeInTheDocument()
  })

  it('hides the entire staff area for regular users', async () => {
    auth.authenticatedFetch.mockResolvedValue(new Response(JSON.stringify(regular)))
    show()
    expect(await screen.findByRole('heading', { name: 'Moderator access required' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Moderation sections' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('offers a retry without exposing tools when permissions cannot be checked', async () => {
    auth.authenticatedFetch.mockRejectedValueOnce(new Error('offline'))
    show('/moderation/playback')
    expect(await screen.findByRole('heading', { name: 'Permissions couldn’t be checked' })).toBeInTheDocument()
    expect(screen.queryByText('Private custom shader tool')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Private custom shader tool')).toBeInTheDocument()
  })

  it('shows the account menu entry only for verified staff and closes the menu on navigation', async () => {
    const onNavigate = vi.fn()
    const view = render(<MemoryRouter><ModerationMenuLink onNavigate={onNavigate} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Moderation' }))
    expect(onNavigate).toHaveBeenCalledOnce()
    auth.accessToken = 'regular-token'
    auth.authenticatedFetch.mockResolvedValue(new Response(JSON.stringify(regular)))
    view.rerender(<MemoryRouter><ModerationMenuLink onNavigate={onNavigate} /></MemoryRouter>)
    expect(screen.queryByRole('menuitem', { name: 'Moderation' })).not.toBeInTheDocument()
    await waitFor(() => expect(auth.authenticatedFetch).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('menuitem', { name: 'Moderation' })).not.toBeInTheDocument()
  })
})

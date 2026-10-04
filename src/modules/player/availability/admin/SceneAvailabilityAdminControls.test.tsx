import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneAvailabilityAdminControls } from './SceneAvailabilityAdminControls'

const mocks = vi.hoisted(() => ({
  fetcher: vi.fn(), invalidate: vi.fn(),
  auth: { accessToken: 'operator-token' as string | null, isAuthenticated: true, isRestoringSession: false, user: { userId: 7 } as { userId: number } | null },
}))
vi.mock('@auth', () => ({ useAuth: () => ({ ...mocks.auth, authenticatedFetch: mocks.fetcher }) }))
vi.mock('../sceneAvailability', () => ({ sceneAvailabilityStore: { invalidate: mocks.invalidate } }))

const audit = { changedByUserId: 7, changedAt: '2026-10-03T12:00:00Z', reason: 'Private investigation' }
const custom = { ...audit, enabled: true, releaseApproved: true }
const scene = { ...audit, sceneId: 23, disabled: false }
const adminCapabilities = { canModerateScenes: true, canManageModerators: true, canManageCustomRendering: true }
const moderatorCapabilities = { canModerateScenes: true, canManageModerators: false, canManageCustomRendering: false }
const regularCapabilities = { canModerateScenes: false, canManageModerators: false, canManageCustomRendering: false }
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }) }
function readResponse(path: string, sceneControl = scene, customControl = custom, capabilities = adminCapabilities) {
  return response(path === '/admin/capabilities' ? capabilities : path === '/admin/rendering/custom' ? customControl : sceneControl)
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
async function openControls() {
  await userEvent.click(await screen.findByText('Manage playback availability'))
}

describe('SceneAvailabilityAdminControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth = { accessToken: 'operator-token', isAuthenticated: true, isRestoringSession: false, user: { userId: 7 } }
    mocks.fetcher.mockImplementation(async (path: string) => readResponse(path))
  })

  it('makes no operator request or owner inference for guests', () => {
    mocks.auth.isAuthenticated = false
    mocks.auth.accessToken = null
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    expect(screen.queryByText('Manage playback availability')).not.toBeInTheDocument()
    expect(mocks.fetcher).not.toHaveBeenCalled()
  })

  it.each([401, 403])('keeps management and audit invisible when server returns %s', async (status) => {
    mocks.fetcher.mockResolvedValue(response({ reason: 'Never display this' }, status))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await waitFor(() => expect(mocks.fetcher).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Manage playback availability')).not.toBeInTheDocument()
    expect(screen.queryByText('Never display this')).not.toBeInTheDocument()
  })

  it('shows private audit only after server permission and requires an explicit reason', async () => {
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    expect(screen.getAllByText('Reason: Private investigation')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Disable scene' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Reason for this scene change'), '   ')
    expect(screen.getByRole('button', { name: 'Disable scene' })).toBeDisabled()
    expect(mocks.fetcher).toHaveBeenCalledWith('/admin/rendering/custom', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }))
  })

  it('submits the reason, prevents duplicates, invalidates before refetch and shows saved audit', async () => {
    const saving = deferred<Response>()
    let saved = false
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { saved = true; return saving.promise }
      return readResponse(path, { ...scene, disabled: saved, reason: saved ? 'Confirmed GPU failure' : audit.reason })
    })
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Reason for this scene change'), ' Confirmed GPU failure ')
    const button = screen.getByRole('button', { name: 'Disable scene' })
    await userEvent.dblClick(button)
    expect(button).toBeDisabled()
    expect(mocks.fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
    expect(mocks.fetcher).toHaveBeenCalledWith('/admin/scenes/23/availability', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ disabled: true, reason: 'Confirmed GPU failure' }) }))
    await act(async () => saving.resolve(response({ ...scene, disabled: true })))
    expect(await screen.findByText('Scene availability updated.')).toBeInTheDocument()
    expect(screen.getByText('Reason: Confirmed GPU failure')).toBeInTheDocument()
    expect(screen.getByLabelText('Reason for this scene change')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Re-enable scene' })).toBeDisabled()
    expect(mocks.invalidate).toHaveBeenCalledWith(23)
    const invalidateOrder = mocks.invalidate.mock.invocationCallOrder[0]
    const firstRefresh = mocks.fetcher.mock.calls.findIndex(([path], index) => index > 4 && path === '/admin/capabilities')
    expect(mocks.fetcher.mock.invocationCallOrder[firstRefresh]).toBeGreaterThan(invalidateOrder)
  })

  it('gates global enabling on release approval', async () => {
    mocks.fetcher.mockImplementation(async (path: string) => readResponse(path, scene, { ...custom, enabled: false, releaseApproved: false }))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Reason for the platform change'), 'Ready')
    expect(screen.getByRole('button', { name: 'Enable custom rendering' })).toBeDisabled()
    expect(screen.getByText('Enabling is unavailable until the isolation release checks are approved.')).toBeInTheDocument()
  })

  it('handles a revoked release gate and refetches status after a 409', async () => {
    let conflicted = false
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { conflicted = true; return response({}, 409) }
      return readResponse(path, scene, { ...custom, enabled: false, releaseApproved: !conflicted })
    })
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Reason for the platform change'), 'Release checks passed')
    await userEvent.click(screen.getByRole('button', { name: 'Enable custom rendering' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot be enabled until the isolation release checks are approved')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enable custom rendering' })).toBeDisabled())
    expect(mocks.invalidate).toHaveBeenCalledWith(undefined)
  })

  it.each([401, 403])('clears operator controls and audit when mutation returns %s', async (status) => {
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => init?.method === 'PUT' ? response({}, status) : readResponse(path))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Reason for this scene change'), 'Private new reason')
    await userEvent.click(screen.getByRole('button', { name: 'Disable scene' }))
    await waitFor(() => expect(screen.queryByText('Manage playback availability')).not.toBeInTheDocument())
    expect(screen.queryByText('Reason: Private investigation')).not.toBeInTheDocument()
  })

  it('clears private state on logout and ignores a late mutation response', async () => {
    const saving = deferred<Response>()
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => init?.method === 'PUT' ? saving.promise : readResponse(path))
    const view = render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Reason for this scene change'), 'Private pending reason')
    await userEvent.click(screen.getByRole('button', { name: 'Disable scene' }))
    const mutationSignal = mocks.fetcher.mock.calls.find(([, init]) => init?.method === 'PUT')?.[1]?.signal
    mocks.auth = { ...mocks.auth, isAuthenticated: false, accessToken: null, user: null }
    view.rerender(<SceneAvailabilityAdminControls sceneId={23} />)
    expect(mutationSignal.aborted).toBe(true)
    await act(async () => saving.resolve(response({ ...scene, disabled: true })))
    expect(screen.queryByText('Manage playback availability')).not.toBeInTheDocument()
    expect(screen.queryByText('Scene availability updated.')).not.toBeInTheDocument()
    expect(mocks.fetcher).toHaveBeenCalledTimes(5)
    expect(mocks.invalidate).toHaveBeenCalledWith(23)
  })

  it('ignores a previous account discovery response after switching accounts', async () => {
    const oldRequest = deferred<Response>()
    mocks.fetcher.mockReturnValueOnce(oldRequest.promise).mockResolvedValue(response({}, 403))
    const view = render(<SceneAvailabilityAdminControls sceneId={23} />)
    mocks.auth = { ...mocks.auth, accessToken: 'different-account', user: { userId: 99 } }
    view.rerender(<SceneAvailabilityAdminControls sceneId={23} />)
    await act(async () => oldRequest.resolve(response(adminCapabilities)))
    expect(screen.queryByText('Manage playback availability')).not.toBeInTheDocument()
    expect(mocks.fetcher).toHaveBeenCalledTimes(2)
  })

  it('rejects an oversized reason even when a form is submitted directly', async () => {
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    const reason = screen.getByLabelText('Reason for this scene change')
    fireEvent.change(reason, { target: { value: 'x'.repeat(1001) } })
    fireEvent.submit(reason.closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('between 1 and 1000')
    expect(mocks.fetcher).toHaveBeenCalledTimes(3)
  })

  it('discovers a regular account without reading any private scene or global audit', async () => {
    mocks.fetcher.mockResolvedValue(response(regularCapabilities))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await waitFor(() => expect(mocks.fetcher).toHaveBeenCalledOnce())
    expect(mocks.fetcher).toHaveBeenCalledWith('/admin/capabilities', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }))
    expect(screen.queryByText('Manage playback availability')).not.toBeInTheDocument()
  })

  it('gives a moderator scene controls and audit only, including after a scene mutation', async () => {
    let disabled = false
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { disabled = true; return response({ ...scene, disabled }) }
      return readResponse(path, { ...scene, disabled }, custom, moderatorCapabilities)
    })
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    expect(screen.getAllByText('Reason: Private investigation')).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: 'Custom rendering across MAGE' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Reason for the platform change')).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Reason for this scene change'), 'Broken scene confirmed')
    await userEvent.click(screen.getByRole('button', { name: 'Disable scene' }))
    expect(await screen.findByText('Scene availability updated.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Re-enable scene' })).toBeDisabled()
    expect(mocks.fetcher.mock.calls.some(([path]) => path === '/admin/rendering/custom')).toBe(false)
    expect(mocks.invalidate).toHaveBeenCalledWith(23)
  })

  it('rechecks capabilities before submitting and never sends a write after a moderator is revoked', async () => {
    let capabilities = moderatorCapabilities
    mocks.fetcher.mockImplementation(async (path: string) => readResponse(path, scene, custom, capabilities))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Reason for this scene change'), 'Pending private reason')
    capabilities = regularCapabilities
    await userEvent.click(screen.getByRole('button', { name: 'Disable scene' }))
    await waitFor(() => expect(screen.queryByText('Manage playback availability')).not.toBeInTheDocument())
    expect(mocks.fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
    expect(screen.queryByText('Reason: Private investigation')).not.toBeInTheDocument()
    expect(mocks.invalidate).not.toHaveBeenCalled()
  })

  it('removes an old administrator global scope before a global write when only scene moderation remains', async () => {
    let capabilities = adminCapabilities
    mocks.fetcher.mockImplementation(async (path: string) => readResponse(path, scene, custom, capabilities))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Reason for the platform change'), 'Private platform reason')
    const originalGlobalReads = mocks.fetcher.mock.calls.filter(([path]) => path === '/admin/rendering/custom').length
    capabilities = moderatorCapabilities
    await userEvent.click(screen.getByRole('button', { name: 'Disable custom rendering for everyone' }))
    await waitFor(() => expect(screen.queryByLabelText('Reason for the platform change')).not.toBeInTheDocument())
    expect(screen.getByText('Manage playback availability')).toBeInTheDocument()
    expect(mocks.fetcher.mock.calls.filter(([path]) => path === '/admin/rendering/custom')).toHaveLength(originalGlobalReads)
    expect(mocks.fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('clears revoked private controls on a focus recheck without a user attempting a mutation', async () => {
    let capabilities = moderatorCapabilities
    mocks.fetcher.mockImplementation(async (path: string) => readResponse(path, scene, custom, capabilities))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    capabilities = regularCapabilities
    fireEvent.focus(window)
    await waitFor(() => expect(screen.queryByText('Manage playback availability')).not.toBeInTheDocument())
    expect(screen.queryByText('Reason: Private investigation')).not.toBeInTheDocument()
  })

  it.each(['network', 'malformed'] as const)('does not authorize private reads from %s capability discovery', async kind => {
    if (kind === 'network') mocks.fetcher.mockRejectedValue(new TypeError('Network error'))
    else mocks.fetcher.mockResolvedValue(response({ canModerateScenes: 'true', canManageCustomRendering: true }))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await act(async () => {})
    expect(screen.queryByText('Manage playback availability')).not.toBeInTheDocument()
    expect(mocks.fetcher).toHaveBeenCalledOnce()
  })

  it('does not submit from stale UI when fresh capability discovery fails', async () => {
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Reason for this scene change'), 'Waiting on permission')
    mocks.fetcher.mockRejectedValue(new TypeError('Network error'))
    await userEvent.click(screen.getByRole('button', { name: 'Disable scene' }))
    await waitFor(() => expect(screen.queryByText('Manage playback availability')).not.toBeInTheDocument())
    expect(mocks.fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('clears previous private state when refreshing capabilities fails instead of retaining active controls', async () => {
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    mocks.fetcher.mockRejectedValue(new TypeError('Network error'))
    await userEvent.click(screen.getByRole('button', { name: 'Refresh status' }))
    await waitFor(() => expect(screen.queryByText('Manage playback availability')).not.toBeInTheDocument())
    expect(screen.queryByText('Reason: Private investigation')).not.toBeInTheDocument()
  })

  it('does not publish old private scene data or continue a global read after an account change', async () => {
    const oldScene = deferred<Response>()
    mocks.fetcher.mockImplementation(async (path: string) => path === '/admin/capabilities'
      ? response(adminCapabilities) : oldScene.promise)
    const view = render(<SceneAvailabilityAdminControls sceneId={23} />)
    await waitFor(() => expect(mocks.fetcher).toHaveBeenCalledWith('/admin/scenes/23/availability', expect.anything()))
    mocks.auth = { ...mocks.auth, accessToken: 'ordinary-account', user: { userId: 99 } }
    mocks.fetcher.mockResolvedValue(response(regularCapabilities))
    view.rerender(<SceneAvailabilityAdminControls sceneId={23} />)
    await act(async () => oldScene.resolve(response(scene)))
    expect(screen.queryByText('Manage playback availability')).not.toBeInTheDocument()
    expect(screen.queryByText('Reason: Private investigation')).not.toBeInTheDocument()
    expect(mocks.fetcher.mock.calls.some(([path]) => path === '/admin/rendering/custom')).toBe(false)
  })

  it('clears stale private state when the capability refresh after a committed change fails', async () => {
    let saved = false
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { saved = true; return response({ ...scene, disabled: true }) }
      if (saved) throw new TypeError('Permission refresh unavailable')
      return readResponse(path)
    })
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Reason for this scene change'), 'Confirmed failure')
    await userEvent.click(screen.getByRole('button', { name: 'Disable scene' }))
    await waitFor(() => expect(screen.queryByText('Manage playback availability')).not.toBeInTheDocument())
    expect(screen.queryByText('Reason: Private investigation')).not.toBeInTheDocument()
    expect(screen.queryByText('Scene availability updated.')).not.toBeInTheDocument()
    expect(mocks.invalidate).toHaveBeenCalledWith(23)
  })
})

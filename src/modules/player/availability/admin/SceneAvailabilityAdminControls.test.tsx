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
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }) }
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
    mocks.fetcher.mockImplementation(async (path: string) => response(path === '/admin/rendering/custom' ? custom : scene))
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
      return response(path === '/admin/rendering/custom' ? custom : { ...scene, disabled: saved, reason: saved ? 'Confirmed GPU failure' : audit.reason })
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
    expect(mocks.fetcher.mock.invocationCallOrder[3]).toBeGreaterThan(invalidateOrder)
  })

  it('gates global enabling on release approval', async () => {
    mocks.fetcher.mockImplementation(async (path: string) => response(path === '/admin/rendering/custom' ? { ...custom, enabled: false, releaseApproved: false } : scene))
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
      return response(path === '/admin/rendering/custom' ? { ...custom, enabled: false, releaseApproved: !conflicted } : scene)
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
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => response(init?.method === 'PUT' ? {} : path === '/admin/rendering/custom' ? custom : scene, init?.method === 'PUT' ? status : 200))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Reason for this scene change'), 'Private new reason')
    await userEvent.click(screen.getByRole('button', { name: 'Disable scene' }))
    await waitFor(() => expect(screen.queryByText('Manage playback availability')).not.toBeInTheDocument())
    expect(screen.queryByText('Reason: Private investigation')).not.toBeInTheDocument()
  })

  it('clears private state on logout and ignores a late mutation response', async () => {
    const saving = deferred<Response>()
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => init?.method === 'PUT' ? saving.promise : response(path === '/admin/rendering/custom' ? custom : scene))
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
    expect(mocks.fetcher).toHaveBeenCalledTimes(3)
    expect(mocks.invalidate).toHaveBeenCalledWith(23)
  })

  it('ignores a previous account discovery response after switching accounts', async () => {
    const oldRequest = deferred<Response>()
    mocks.fetcher.mockReturnValueOnce(oldRequest.promise).mockResolvedValue(response({}, 403))
    const view = render(<SceneAvailabilityAdminControls sceneId={23} />)
    mocks.auth = { ...mocks.auth, accessToken: 'different-account', user: { userId: 99 } }
    view.rerender(<SceneAvailabilityAdminControls sceneId={23} />)
    await act(async () => oldRequest.resolve(response(custom)))
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
    expect(mocks.fetcher).toHaveBeenCalledTimes(2)
  })
})

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneAvailabilityAdminControls } from './SceneAvailabilityAdminControls'

const mocks = vi.hoisted(() => ({
  fetcher: vi.fn(), invalidate: vi.fn(),
  auth: { accessToken: 'operator-token' as string | null, isAuthenticated: true, isRestoringSession: false, user: { userId: 7 } as { userId: number } | null },
}))
vi.mock('@auth', () => ({ useAuth: () => ({ ...mocks.auth, authenticatedFetch: mocks.fetcher }) }))
vi.mock('../sceneAvailability', () => ({ sceneAvailabilityStore: { invalidate: mocks.invalidate } }))

const audit = { changedByUserId: 7, changedAt: '2026-10-03T12:00:00Z', reason: 'Private investigation' }
const scene = { ...audit, sceneId: 23, disabled: false }
const adminCapabilities = { canModerateScenes: true, canManageModerators: true, canManageCustomRendering: true }
const moderatorCapabilities = { canModerateScenes: true, canManageModerators: false, canManageCustomRendering: false }
const regularCapabilities = { canModerateScenes: false, canManageModerators: false, canManageCustomRendering: false }
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }) }
function readResponse(path: string, sceneControl = scene, capabilities = adminCapabilities) {
  if (path === '/admin/capabilities') return response(capabilities)
  if (path === '/admin/scenes/23/availability') return response(sceneControl)
  throw new Error(`Unexpected scene management request: ${path}`)
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
async function openControls() {
  await userEvent.click(await screen.findByRole('button', { name: 'Manage this scene' }))
  return screen.findByRole('dialog', { name: 'Manage this scene' })
}

describe('SceneAvailabilityAdminControls', () => {
  const nativeDialogMethods = {
    showModal: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal'),
    close: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close'),
  }
  // JSDOM has no native dialog methods. Model opening/closing only; browser QA
  // verifies the native focus trap, inert background, and Escape-to-cancel behavior.
  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) {
      this.open = true
      this.querySelector<HTMLElement>('button:not([disabled]), textarea:not([disabled])')?.focus()
    } })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) {
      this.open = false
      this.dispatchEvent(new Event('close'))
    } })
  })
  afterAll(() => {
    for (const name of ['showModal', 'close'] as const) {
      const descriptor = nativeDialogMethods[name]
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor)
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name)
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth = { accessToken: 'operator-token', isAuthenticated: true, isRestoringSession: false, user: { userId: 7 } }
    mocks.fetcher.mockImplementation(async (path: string) => readResponse(path))
  })

  it('makes no operator request or owner inference for guests', () => {
    mocks.auth.isAuthenticated = false
    mocks.auth.accessToken = null
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    expect(screen.queryByRole('button', { name: 'Manage this scene' })).not.toBeInTheDocument()
    expect(mocks.fetcher).not.toHaveBeenCalled()
  })

  it.each([401, 403])('keeps management and audit invisible when server returns %s', async (status) => {
    mocks.fetcher.mockResolvedValue(response({ reason: 'Never display this' }, status))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await waitFor(() => expect(mocks.fetcher).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: 'Manage this scene' })).not.toBeInTheDocument()
    expect(screen.queryByText('Never display this')).not.toBeInTheDocument()
  })

  it('keeps private audit and forms out of the page until the availability dialog is opened', async () => {
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    const trigger = await screen.findByRole('button', { name: 'Manage this scene' })
    expect(screen.queryByRole('dialog', { name: 'Manage this scene' })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Private investigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Block|Unblock) scene$/ })).not.toBeInTheDocument()
    await userEvent.click(trigger)
    expect(await screen.findByRole('dialog', { name: 'Manage this scene' })).toHaveAttribute('open')
    expect(screen.getAllByText('Previous reason: Private investigation')).toHaveLength(1)
  })

  it.each(['close button', 'native Escape cancellation'] as const)('dismisses the dialog with %s and returns focus without changing availability', async method => {
    const user = userEvent.setup()
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    const trigger = await screen.findByRole('button', { name: 'Manage this scene' })
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Manage this scene' })
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))
    await user.type(screen.getByLabelText('Why are you making this change?'), 'Unsubmitted private reason')
    if (method === 'close button') await user.click(screen.getByRole('button', { name: 'Close scene controls' }))
    else fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog', { name: 'Manage this scene' })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Private investigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Block|Unblock) scene$/ })).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(mocks.fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
    expect(mocks.invalidate).not.toHaveBeenCalled()
    await user.click(trigger)
    expect(await screen.findByRole('dialog', { name: 'Manage this scene' })).toBeInTheDocument()
    expect(screen.getByLabelText('Why are you making this change?')).toHaveValue('')
  })

  it('shows an administrator only scene controls and never reads site-wide status or audit', async () => {
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    expect(screen.getAllByText('Previous reason: Private investigation')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Block scene' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), '   ')
    expect(screen.getByRole('button', { name: 'Block scene' })).toBeDisabled()
    expect(mocks.fetcher).toHaveBeenCalledWith('/admin/scenes/23/availability', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }))
    expect(mocks.fetcher.mock.calls.some(([path]) => path === '/admin/rendering/custom')).toBe(false)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Turn (on|off) custom shaders$/ })).not.toBeInTheDocument()
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
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), ' Confirmed GPU failure ')
    const button = screen.getByRole('button', { name: 'Block scene' })
    await userEvent.dblClick(button)
    expect(button).toBeDisabled()
    expect(screen.getByLabelText('Why are you making this change?')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^Turn (on|off) custom shaders$/ })).not.toBeInTheDocument()
    expect(mocks.fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
    expect(mocks.fetcher).toHaveBeenCalledWith('/admin/scenes/23/availability', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ disabled: true, reason: 'Confirmed GPU failure' }) }))
    await act(async () => saving.resolve(response({ ...scene, disabled: true })))
    expect(await screen.findByText('Scene blocked.')).toBeInTheDocument()
    expect(screen.getByText('Previous reason: Confirmed GPU failure')).toBeInTheDocument()
    expect(screen.getByLabelText('Why are you making this change?')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Unblock scene' })).toBeDisabled()
    expect(mocks.invalidate).toHaveBeenCalledWith(23)
    expect(mocks.fetcher.mock.calls.some(([path]) => path === '/admin/rendering/custom')).toBe(false)
    const invalidateOrder = mocks.invalidate.mock.invocationCallOrder[0]
    const firstRefresh = mocks.fetcher.mock.calls.findIndex(([path], index) => index > 3 && path === '/admin/capabilities')
    expect(mocks.fetcher.mock.invocationCallOrder[firstRefresh]).toBeGreaterThan(invalidateOrder)
  })

  it('unblocks the same scene without reading or changing site-wide controls', async () => {
    let disabled = true
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { disabled = false; return response({ ...scene, disabled }) }
      return readResponse(path, { ...scene, disabled })
    })
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Scene repaired')
    await userEvent.click(screen.getByRole('button', { name: 'Unblock scene' }))
    expect(await screen.findByText('Scene unblocked.')).toBeInTheDocument()
    expect(mocks.fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toEqual([
      ['/admin/scenes/23/availability', expect.objectContaining({ body: JSON.stringify({ disabled: false, reason: 'Scene repaired' }) })],
    ])
    expect(mocks.fetcher.mock.calls.some(([path]) => path === '/admin/rendering/custom')).toBe(false)
    expect(screen.getByRole('button', { name: 'Block scene' })).toBeDisabled()
    expect(mocks.invalidate).toHaveBeenCalledWith(23)
  })

  it.each([409, 500])('shows a scene-specific save failure for status %s without claiming success', async status => {
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => init?.method === 'PUT' ? response({}, status) : readResponse(path))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Scene issue')
    await userEvent.click(screen.getByRole('button', { name: 'Block scene' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't save the change. Check the current status and try again.")
    expect(screen.queryByText('Scene blocked.')).not.toBeInTheDocument()
    expect(screen.queryByText(/safety checks/i)).not.toBeInTheDocument()
    expect(mocks.fetcher.mock.calls.some(([path]) => path === '/admin/rendering/custom')).toBe(false)
    expect(mocks.invalidate).toHaveBeenCalledWith(23)
  })

  it.each([401, 403])('clears operator controls and audit when mutation returns %s', async (status) => {
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => init?.method === 'PUT' ? response({}, status) : readResponse(path))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Private new reason')
    await userEvent.click(screen.getByRole('button', { name: 'Block scene' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Manage this scene' })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: 'Manage this scene' })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Private investigation')).not.toBeInTheDocument()
  })

  it('clears private state on logout and ignores a late mutation response', async () => {
    const saving = deferred<Response>()
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => init?.method === 'PUT' ? saving.promise : readResponse(path))
    const view = render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Private pending reason')
    await userEvent.click(screen.getByRole('button', { name: 'Block scene' }))
    const mutationSignal = mocks.fetcher.mock.calls.find(([, init]) => init?.method === 'PUT')?.[1]?.signal
    mocks.auth = { ...mocks.auth, isAuthenticated: false, accessToken: null, user: null }
    view.rerender(<SceneAvailabilityAdminControls sceneId={23} />)
    expect(mutationSignal.aborted).toBe(true)
    await act(async () => saving.resolve(response({ ...scene, disabled: true })))
    expect(screen.queryByRole('button', { name: 'Manage this scene' })).not.toBeInTheDocument()
    expect(screen.queryByText('Scene blocked.')).not.toBeInTheDocument()
    expect(mocks.fetcher).toHaveBeenCalledTimes(4)
    expect(mocks.invalidate).toHaveBeenCalledWith(23)
  })

  it('ignores a previous account discovery response after switching accounts', async () => {
    const oldRequest = deferred<Response>()
    mocks.fetcher.mockReturnValueOnce(oldRequest.promise).mockResolvedValue(response({}, 403))
    const view = render(<SceneAvailabilityAdminControls sceneId={23} />)
    mocks.auth = { ...mocks.auth, accessToken: 'different-account', user: { userId: 99 } }
    view.rerender(<SceneAvailabilityAdminControls sceneId={23} />)
    await act(async () => oldRequest.resolve(response(adminCapabilities)))
    expect(screen.queryByRole('button', { name: 'Manage this scene' })).not.toBeInTheDocument()
    expect(mocks.fetcher).toHaveBeenCalledTimes(2)
  })

  it('rejects an oversized reason even when a form is submitted directly', async () => {
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    const reason = screen.getByLabelText('Why are you making this change?')
    fireEvent.change(reason, { target: { value: 'x'.repeat(1001) } })
    fireEvent.submit(reason.closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Add a reason (up to 1,000 characters).')
    expect(mocks.fetcher).toHaveBeenCalledTimes(2)
  })

  it.each([regularCapabilities, { canModerateScenes: false, canManageModerators: true, canManageCustomRendering: true }])('requires scene moderation permission before showing any scene controls (%j)', async capabilities => {
    mocks.fetcher.mockResolvedValue(response(capabilities))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await waitFor(() => expect(mocks.fetcher).toHaveBeenCalledOnce())
    expect(mocks.fetcher).toHaveBeenCalledWith('/admin/capabilities', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }))
    expect(screen.queryByRole('button', { name: 'Manage this scene' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Manage this scene' })).not.toBeInTheDocument()
  })

  it('gives a moderator scene controls and audit only, including after a scene mutation', async () => {
    let disabled = false
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { disabled = true; return response({ ...scene, disabled }) }
      return readResponse(path, { ...scene, disabled }, moderatorCapabilities)
    })
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    expect(screen.getAllByText('Previous reason: Private investigation')).toHaveLength(1)
    expect(screen.queryByRole('option', { name: 'All custom shader scenes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Turn (on|off) custom shaders$/ })).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Broken scene confirmed')
    await userEvent.click(screen.getByRole('button', { name: 'Block scene' }))
    expect(await screen.findByText('Scene blocked.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unblock scene' })).toBeDisabled()
    expect(mocks.fetcher.mock.calls.some(([path]) => path === '/admin/rendering/custom')).toBe(false)
    expect(mocks.invalidate).toHaveBeenCalledWith(23)
  })

  it('rechecks capabilities before submitting and never sends a write after a moderator is revoked', async () => {
    let capabilities = moderatorCapabilities
    mocks.fetcher.mockImplementation(async (path: string) => readResponse(path, scene, capabilities))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Pending private reason')
    capabilities = regularCapabilities
    await userEvent.click(screen.getByRole('button', { name: 'Block scene' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Manage this scene' })).not.toBeInTheDocument())
    expect(mocks.fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
    expect(screen.queryByRole('dialog', { name: 'Manage this scene' })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Private investigation')).not.toBeInTheDocument()
    expect(mocks.invalidate).not.toHaveBeenCalled()
  })

  it('clears revoked private controls on a focus recheck without a user attempting a mutation', async () => {
    let capabilities = moderatorCapabilities
    mocks.fetcher.mockImplementation(async (path: string) => readResponse(path, scene, capabilities))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    capabilities = regularCapabilities
    fireEvent.focus(window)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Manage this scene' })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: 'Manage this scene' })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Private investigation')).not.toBeInTheDocument()
  })

  it.each(['network', 'malformed'] as const)('does not authorize private reads from %s capability discovery', async kind => {
    if (kind === 'network') mocks.fetcher.mockRejectedValue(new TypeError('Network error'))
    else mocks.fetcher.mockResolvedValue(response({ canModerateScenes: 'true', canManageCustomRendering: true }))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'Manage this scene' })).not.toBeInTheDocument()
    expect(mocks.fetcher).toHaveBeenCalledOnce()
  })

  it('does not submit from stale UI when fresh capability discovery fails', async () => {
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Waiting on permission')
    mocks.fetcher.mockRejectedValue(new TypeError('Network error'))
    await userEvent.click(screen.getByRole('button', { name: 'Block scene' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Manage this scene' })).not.toBeInTheDocument())
    expect(mocks.fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('clears previous private state when refreshing capabilities fails instead of retaining active controls', async () => {
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    mocks.fetcher.mockRejectedValue(new TypeError('Network error'))
    await userEvent.click(screen.getByRole('button', { name: 'Check current status' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Manage this scene' })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: 'Manage this scene' })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Private investigation')).not.toBeInTheDocument()
  })

  it('does not publish old private scene data after an account change', async () => {
    const oldScene = deferred<Response>()
    mocks.fetcher.mockImplementation(async (path: string) => path === '/admin/capabilities'
      ? response(adminCapabilities) : oldScene.promise)
    const view = render(<SceneAvailabilityAdminControls sceneId={23} />)
    await waitFor(() => expect(mocks.fetcher).toHaveBeenCalledWith('/admin/scenes/23/availability', expect.anything()))
    mocks.auth = { ...mocks.auth, accessToken: 'ordinary-account', user: { userId: 99 } }
    mocks.fetcher.mockResolvedValue(response(regularCapabilities))
    view.rerender(<SceneAvailabilityAdminControls sceneId={23} />)
    await act(async () => oldScene.resolve(response(scene)))
    expect(screen.queryByRole('button', { name: 'Manage this scene' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Manage this scene' })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Private investigation')).not.toBeInTheDocument()
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
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Confirmed failure')
    await userEvent.click(screen.getByRole('button', { name: 'Block scene' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Manage this scene' })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: 'Manage this scene' })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Private investigation')).not.toBeInTheDocument()
    expect(screen.queryByText('Scene blocked.')).not.toBeInTheDocument()
    expect(mocks.invalidate).toHaveBeenCalledWith(23)
  })
})

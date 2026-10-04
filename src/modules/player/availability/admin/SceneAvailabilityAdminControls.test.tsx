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
  await userEvent.click(await screen.findByRole('button', { name: 'Open moderation tools' }))
  return screen.findByRole('dialog', { name: 'Moderation tools' })
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
    expect(screen.queryByRole('button', { name: 'Open moderation tools' })).not.toBeInTheDocument()
    expect(mocks.fetcher).not.toHaveBeenCalled()
  })

  it.each([401, 403])('keeps management and audit invisible when server returns %s', async (status) => {
    mocks.fetcher.mockResolvedValue(response({ reason: 'Never display this' }, status))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await waitFor(() => expect(mocks.fetcher).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: 'Open moderation tools' })).not.toBeInTheDocument()
    expect(screen.queryByText('Never display this')).not.toBeInTheDocument()
  })

  it('keeps private audit and forms out of the page until the availability dialog is opened', async () => {
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    const trigger = await screen.findByRole('button', { name: 'Open moderation tools' })
    expect(screen.queryByRole('dialog', { name: 'Moderation tools' })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Private investigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Block|Unblock) scene$/ })).not.toBeInTheDocument()
    await userEvent.click(trigger)
    expect(await screen.findByRole('dialog', { name: 'Moderation tools' })).toHaveAttribute('open')
    expect(screen.getAllByText('Previous reason: Private investigation')).toHaveLength(1)
  })

  it.each(['close button', 'native Escape cancellation'] as const)('dismisses the dialog with %s and returns focus without changing availability', async method => {
    const user = userEvent.setup()
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    const trigger = await screen.findByRole('button', { name: 'Open moderation tools' })
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Moderation tools' })
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Manage' }), 'global')
    await user.type(screen.getByLabelText('Why are you making this change?'), 'Unsubmitted private reason')
    if (method === 'close button') await user.click(screen.getByRole('button', { name: 'Close moderation tools' }))
    else fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog', { name: 'Moderation tools' })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Private investigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Block|Unblock) scene$/ })).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(mocks.fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
    expect(mocks.invalidate).not.toHaveBeenCalled()
    await user.click(trigger)
    expect(await screen.findByRole('dialog', { name: 'Moderation tools' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Manage' })).toHaveValue('scene')
    expect(screen.getByLabelText('Why are you making this change?')).toHaveValue('')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Manage' }), 'global')
    expect(screen.getByLabelText('Why are you making this change?')).toHaveValue('')
  })

  it('shows private audit only after server permission and requires an explicit reason', async () => {
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    expect(screen.getAllByText('Previous reason: Private investigation')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Block scene' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), '   ')
    expect(screen.getByRole('button', { name: 'Block scene' })).toBeDisabled()
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
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), ' Confirmed GPU failure ')
    const button = screen.getByRole('button', { name: 'Block scene' })
    await userEvent.dblClick(button)
    expect(button).toBeDisabled()
    const tool = screen.getByRole('combobox', { name: 'Manage' })
    expect(tool).toBeDisabled()
    await userEvent.selectOptions(tool, 'global')
    expect(tool).toHaveValue('scene')
    expect(screen.queryByRole('button', { name: /^Turn (on|off) custom shaders$/ })).not.toBeInTheDocument()
    expect(mocks.fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
    expect(mocks.fetcher).toHaveBeenCalledWith('/admin/scenes/23/availability', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ disabled: true, reason: 'Confirmed GPU failure' }) }))
    await act(async () => saving.resolve(response({ ...scene, disabled: true })))
    expect(await screen.findByText('Scene blocked.')).toBeInTheDocument()
    expect(screen.getByText('Previous reason: Confirmed GPU failure')).toBeInTheDocument()
    expect(screen.getByLabelText('Why are you making this change?')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Unblock scene' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Manage' })).toBeEnabled()
    expect(mocks.invalidate).toHaveBeenCalledWith(23)
    const invalidateOrder = mocks.invalidate.mock.invocationCallOrder[0]
    const firstRefresh = mocks.fetcher.mock.calls.findIndex(([path], index) => index > 4 && path === '/admin/capabilities')
    expect(mocks.fetcher.mock.invocationCallOrder[firstRefresh]).toBeGreaterThan(invalidateOrder)
  })

  it('gates global enabling on release approval', async () => {
    mocks.fetcher.mockImplementation(async (path: string) => readResponse(path, scene, { ...custom, enabled: false, releaseApproved: false }))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Manage' }), 'global')
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Ready')
    expect(screen.getByRole('button', { name: 'Turn on custom shaders' })).toBeDisabled()
    expect(screen.getByText("Custom shaders are locked off until MAGE's safety checks are approved. This can't be changed from this window.")).toBeInTheDocument()
  })

  it('handles a revoked release gate and refetches status after a 409', async () => {
    let conflicted = false
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { conflicted = true; return response({}, 409) }
      return readResponse(path, scene, { ...custom, enabled: false, releaseApproved: !conflicted })
    })
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Manage' }), 'global')
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Release checks passed')
    await userEvent.click(screen.getByRole('button', { name: 'Turn on custom shaders' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Custom shaders can't be turned on until MAGE's safety checks are approved.")
    await waitFor(() => expect(screen.getByRole('button', { name: 'Turn on custom shaders' })).toBeDisabled())
    expect(mocks.invalidate).toHaveBeenCalledWith(undefined)
  })

  it.each([401, 403])('clears operator controls and audit when mutation returns %s', async (status) => {
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => init?.method === 'PUT' ? response({}, status) : readResponse(path))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Private new reason')
    await userEvent.click(screen.getByRole('button', { name: 'Block scene' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open moderation tools' })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: 'Moderation tools' })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: 'Open moderation tools' })).not.toBeInTheDocument()
    expect(screen.queryByText('Scene blocked.')).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: 'Open moderation tools' })).not.toBeInTheDocument()
    expect(mocks.fetcher).toHaveBeenCalledTimes(2)
  })

  it('rejects an oversized reason even when a form is submitted directly', async () => {
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    const reason = screen.getByLabelText('Why are you making this change?')
    fireEvent.change(reason, { target: { value: 'x'.repeat(1001) } })
    fireEvent.submit(reason.closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Add a reason (up to 1,000 characters).')
    expect(mocks.fetcher).toHaveBeenCalledTimes(3)
  })

  it('discovers a regular account without reading any private scene or global audit', async () => {
    mocks.fetcher.mockResolvedValue(response(regularCapabilities))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await waitFor(() => expect(mocks.fetcher).toHaveBeenCalledOnce())
    expect(mocks.fetcher).toHaveBeenCalledWith('/admin/capabilities', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }))
    expect(screen.queryByRole('button', { name: 'Open moderation tools' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Moderation tools' })).not.toBeInTheDocument()
  })

  it('gives a moderator scene controls and audit only, including after a scene mutation', async () => {
    let disabled = false
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') { disabled = true; return response({ ...scene, disabled }) }
      return readResponse(path, { ...scene, disabled }, custom, moderatorCapabilities)
    })
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    expect(screen.getAllByText('Previous reason: Private investigation')).toHaveLength(1)
    expect(screen.getByRole('combobox', { name: 'Manage' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Manage' })).toHaveValue('scene')
    expect(screen.queryByRole('option', { name: 'All custom shader scenes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Turn (on|off) custom shaders$/ })).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Broken scene confirmed')
    await userEvent.click(screen.getByRole('button', { name: 'Block scene' }))
    expect(await screen.findByText('Scene blocked.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unblock scene' })).toBeDisabled()
    expect(mocks.fetcher.mock.calls.some(([path]) => path === '/admin/rendering/custom')).toBe(false)
    expect(mocks.invalidate).toHaveBeenCalledWith(23)
  })

  it('shows one tool at a time and never carries drafts or a saved notice into another tool', async () => {
    const user = userEvent.setup()
    let globallyEnabled = true
    mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        globallyEnabled = false
        return response({ ...custom, enabled: false })
      }
      return readResponse(path, { ...scene, reason: 'Scene audit' }, { ...custom, enabled: globallyEnabled, reason: 'Global audit' })
    })
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    const tool = screen.getByRole('combobox', { name: 'Manage' })
    expect(tool).toHaveValue('scene')
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByText('Previous reason: Scene audit')).toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Global audit')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Why are you making this change?'), 'Scene draft')
    await user.selectOptions(tool, 'global')
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByLabelText('Why are you making this change?')).toHaveValue('')
    expect(screen.queryByRole('button', { name: /^(Block|Unblock) scene$/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Scene audit')).not.toBeInTheDocument()
    expect(screen.getByText('Previous reason: Global audit')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Why are you making this change?'), 'Global draft')
    await user.selectOptions(tool, 'scene')
    expect(screen.getByLabelText('Why are you making this change?')).toHaveValue('')
    expect(mocks.fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
    await user.selectOptions(tool, 'global')
    expect(screen.getByLabelText('Why are you making this change?')).toHaveValue('')
    await user.type(screen.getByLabelText('Why are you making this change?'), 'Platform incident')
    await user.click(screen.getByRole('button', { name: 'Turn off custom shaders' }))
    expect(await screen.findByText('Custom shader playback turned off.')).toBeInTheDocument()
    expect(mocks.fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')).toEqual([
      ['/admin/rendering/custom', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ enabled: false, reason: 'Platform incident' }) })],
    ])
    expect(mocks.invalidate).toHaveBeenCalledWith(undefined)
    await user.selectOptions(tool, 'scene')
    expect(screen.queryByText('Custom shader playback turned off.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Why are you making this change?')).toHaveValue('')
  })

  it('selects the sole global tool without requesting or displaying scene controls', async () => {
    const capabilities = { canModerateScenes: false, canManageModerators: false, canManageCustomRendering: true }
    mocks.fetcher.mockImplementation(async (path: string) => readResponse(path, scene, custom, capabilities))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    expect(screen.getByRole('combobox', { name: 'Manage' })).toHaveValue('global')
    expect(screen.getByRole('combobox', { name: 'Manage' })).toBeDisabled()
    expect(screen.queryByRole('option', { name: 'This scene' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByLabelText('Why are you making this change?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Block|Unblock) scene$/ })).not.toBeInTheDocument()
    expect(mocks.fetcher.mock.calls.some(([path]) => path === '/admin/scenes/23/availability')).toBe(false)
  })

  it('falls back to the scene tool and clears the private global draft when a refresh removes global permission', async () => {
    let capabilities = adminCapabilities
    mocks.fetcher.mockImplementation(async (path: string) => readResponse(path, scene, { ...custom, reason: 'Global-only audit' }, capabilities))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Manage' }), 'global')
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Private platform draft')
    const originalGlobalReads = mocks.fetcher.mock.calls.filter(([path]) => path === '/admin/rendering/custom').length
    capabilities = moderatorCapabilities
    await userEvent.click(screen.getByRole('button', { name: 'Check current status' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Manage' })).toHaveValue('scene'))
    expect(screen.getByRole('dialog', { name: 'Moderation tools' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Manage' })).toBeDisabled()
    expect(screen.queryByRole('option', { name: 'All custom shader scenes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Turn (on|off) custom shaders$/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Global-only audit')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Why are you making this change?')).toHaveValue('')
    expect(mocks.fetcher.mock.calls.filter(([path]) => path === '/admin/rendering/custom')).toHaveLength(originalGlobalReads)
    expect(mocks.fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('rechecks capabilities before submitting and never sends a write after a moderator is revoked', async () => {
    let capabilities = moderatorCapabilities
    mocks.fetcher.mockImplementation(async (path: string) => readResponse(path, scene, custom, capabilities))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Pending private reason')
    capabilities = regularCapabilities
    await userEvent.click(screen.getByRole('button', { name: 'Block scene' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open moderation tools' })).not.toBeInTheDocument())
    expect(mocks.fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
    expect(screen.queryByRole('dialog', { name: 'Moderation tools' })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Private investigation')).not.toBeInTheDocument()
    expect(mocks.invalidate).not.toHaveBeenCalled()
  })

  it('removes an old administrator global scope before a global write when only scene moderation remains', async () => {
    let capabilities = adminCapabilities
    mocks.fetcher.mockImplementation(async (path: string) => readResponse(path, scene, custom, capabilities))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Manage' }), 'global')
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Private platform reason')
    const originalGlobalReads = mocks.fetcher.mock.calls.filter(([path]) => path === '/admin/rendering/custom').length
    capabilities = moderatorCapabilities
    await userEvent.click(screen.getByRole('button', { name: 'Turn off custom shaders' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Turn (on|off) custom shaders$/ })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Open moderation tools' })).toBeInTheDocument()
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
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open moderation tools' })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: 'Moderation tools' })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Private investigation')).not.toBeInTheDocument()
  })

  it.each(['network', 'malformed'] as const)('does not authorize private reads from %s capability discovery', async kind => {
    if (kind === 'network') mocks.fetcher.mockRejectedValue(new TypeError('Network error'))
    else mocks.fetcher.mockResolvedValue(response({ canModerateScenes: 'true', canManageCustomRendering: true }))
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'Open moderation tools' })).not.toBeInTheDocument()
    expect(mocks.fetcher).toHaveBeenCalledOnce()
  })

  it('does not submit from stale UI when fresh capability discovery fails', async () => {
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    await userEvent.type(screen.getByLabelText('Why are you making this change?'), 'Waiting on permission')
    mocks.fetcher.mockRejectedValue(new TypeError('Network error'))
    await userEvent.click(screen.getByRole('button', { name: 'Block scene' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open moderation tools' })).not.toBeInTheDocument())
    expect(mocks.fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('clears previous private state when refreshing capabilities fails instead of retaining active controls', async () => {
    render(<SceneAvailabilityAdminControls sceneId={23} />)
    await openControls()
    mocks.fetcher.mockRejectedValue(new TypeError('Network error'))
    await userEvent.click(screen.getByRole('button', { name: 'Check current status' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open moderation tools' })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: 'Moderation tools' })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Private investigation')).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: 'Open moderation tools' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Moderation tools' })).not.toBeInTheDocument()
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
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open moderation tools' })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog', { name: 'Moderation tools' })).not.toBeInTheDocument()
    expect(screen.queryByText('Previous reason: Private investigation')).not.toBeInTheDocument()
    expect(screen.queryByText('Scene blocked.')).not.toBeInTheDocument()
    expect(mocks.invalidate).toHaveBeenCalledWith(23)
  })
})

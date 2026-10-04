import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_THEME_STORAGE_KEY, ThemeProvider } from '@theme'
import { CustomShaderControls } from './CustomShaderControls'

const mocks = vi.hoisted(() => ({ fetcher: vi.fn(), invalidate: vi.fn(), auth: {
  accessToken: 'admin-token' as string | null, isAuthenticated: true, isRestoringSession: false,
  user: { userId: 7 } as { userId: number } | null,
} }))
vi.mock('@auth', () => ({ useAuth: () => ({ ...mocks.auth, authenticatedFetch: mocks.fetcher }) }))
vi.mock('@modules/player', async () => ({
  ...await import('../player/availability/admin/adminApi'),
  sceneAvailabilityStore: { invalidate: mocks.invalidate },
}))

const admin = { canModerateScenes: true, canManageModerators: true, canManageCustomRendering: true }
const initial = { enabled: true, releaseApproved: true, changedByUserId: 7, changedAt: '2026-10-03T12:00:00Z', reason: 'Private review completed' }
let capabilities: typeof admin
let current: typeof initial
let mutate: (body: { enabled: boolean; reason: string }) => Promise<Response>
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const writes = () => mocks.fetcher.mock.calls.filter(([, init]) => init?.method === 'PUT')
const privateReads = () => mocks.fetcher.mock.calls.filter(([path, init]) => path === '/admin/rendering/custom' && init?.method !== 'PUT')
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
function show(theme: 'mage-pulse' | 'classic-facebook' = 'mage-pulse') {
  localStorage.setItem(APP_THEME_STORAGE_KEY, theme)
  return render(<ThemeProvider><CustomShaderControls /></ThemeProvider>)
}
async function prepareChange() {
  const toggle = await screen.findByRole('switch', { name: 'Allow custom shader playback' })
  fireEvent.click(toggle)
  fireEvent.change(screen.getByRole('textbox', { name: 'Why are you making this change?' }), { target: { value: 'Investigating an unsafe custom scene' } })
  return screen.getByRole('button', { name: 'Save change' })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth = { accessToken: 'admin-token', isAuthenticated: true, isRestoringSession: false, user: { userId: 7 } }
  capabilities = { ...admin }
  current = { ...initial }
  mutate = async body => { current = { ...current, ...body }; return response(current) }
  mocks.fetcher.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/admin/capabilities') return response(capabilities)
    if (path === '/admin/rendering/custom' && init?.method === 'PUT') return mutate(JSON.parse(String(init.body)))
    if (path === '/admin/rendering/custom') return response(current)
    throw new Error(`Unexpected request ${path}`)
  })
})

describe('global custom shader controls', () => {
  it('makes no private requests while signed out or restoring a session', () => {
    mocks.auth.isAuthenticated = false
    const view = show()
    expect(mocks.fetcher).not.toHaveBeenCalled()
    mocks.auth.isAuthenticated = true; mocks.auth.isRestoringSession = true
    view.rerender(<ThemeProvider><CustomShaderControls /></ThemeProvider>)
    expect(mocks.fetcher).not.toHaveBeenCalled()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it.each([
    { canModerateScenes: false, canManageModerators: false, canManageCustomRendering: false },
    { canModerateScenes: true, canManageModerators: false, canManageCustomRendering: false },
    { canModerateScenes: true, canManageModerators: true, canManageCustomRendering: false },
  ])('only the global capability permits private status reads: %j', async claims => {
    capabilities = claims
    show()
    await screen.findByText('Administrator permission is required to manage custom shader playback.')
    expect(privateReads()).toHaveLength(0)
    expect(writes()).toHaveLength(0)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByText(/Private review completed/)).not.toBeInTheDocument()
  })

  it('fails closed on a malformed capability response without reading private status', async () => {
    mocks.fetcher.mockResolvedValueOnce(response({ canManageCustomRendering: 'true' }))
    show()
    await screen.findByText('The current playback settings couldn’t be verified. Please check again.')
    expect(privateReads()).toHaveLength(0)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it.each(['mage-pulse', 'classic-facebook'] as const)('keeps the switch a draft until a reason and explicit keyboard save in %s', async theme => {
    show(theme)
    const toggle = await screen.findByRole('switch', { name: 'Allow custom shader playback' })
    expect(toggle).toBeChecked()
    expect(screen.getByText('Saved status: On')).toBeInTheDocument()
    expect(screen.getByText(/built-in templates are not affected/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save change' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Why are you making this change?' })).not.toBeInTheDocument()
    toggle.focus()
    await userEvent.keyboard(' ')
    expect(toggle).not.toBeChecked()
    expect(screen.getByText('Saved status: On')).toBeInTheDocument()
    expect(writes()).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Save change' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Why are you making this change?' }), { target: { value: '  Investigating an unsafe custom scene  ' } })
    const save = screen.getByRole('button', { name: 'Save change' })
    save.focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByText('Custom shader playback turned off.')
    expect(screen.getByText('Saved status: Off')).toBeInTheDocument()
    expect(JSON.parse(writes()[0][1].body)).toEqual({ enabled: false, reason: 'Investigating an unsafe custom scene' })
    expect(mocks.invalidate).toHaveBeenCalledWith()
    expect(screen.queryByRole('textbox', { name: 'Why are you making this change?' })).not.toBeInTheDocument()
  })

  it('enables playback after release approval and a reasoned save', async () => {
    current.enabled = false
    show()
    fireEvent.click(await prepareChange())
    await screen.findByText('Custom shader playback turned on.')
    expect(screen.getByRole('switch', { name: 'Allow custom shader playback' })).toBeChecked()
    expect(JSON.parse(writes()[0][1].body).enabled).toBe(true)
  })

  it('shows a locked-off saved setting without unusable reason and save controls', async () => {
    current = { ...initial, enabled: false, releaseApproved: false }
    show()
    const toggle = await screen.findByRole('switch', { name: 'Allow custom shader playback' })
    expect(toggle).not.toBeChecked()
    expect(toggle).toBeDisabled()
    expect(screen.getByText('Saved status: Off')).toBeInTheDocument()
    expect(screen.queryByText('Saved status: On')).not.toBeInTheDocument()
    expect(screen.getByText(/Custom shaders are locked off/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save change' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Why are you making this change?' })).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(writes()).toHaveLength(0)
    current = { ...current, enabled: false, releaseApproved: true }
    fireEvent.click(screen.getByRole('button', { name: 'Check current status' }))
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Allow custom shader playback' })).toBeEnabled())
    expect(screen.getByRole('switch', { name: 'Allow custom shader playback' })).not.toBeChecked()
  })

  it('can cancel a stored on setting while the gate keeps effective playback off', async () => {
    current = { ...initial, enabled: true, releaseApproved: false }
    show()
    const toggle = await screen.findByRole('switch', { name: 'Allow custom shader playback' })
    expect(toggle).toBeChecked()
    expect(toggle).toBeEnabled()
    expect(screen.getByText('Saved status: Off')).toBeInTheDocument()
    expect(screen.queryByText('Saved status: On')).not.toBeInTheDocument()
    expect(screen.getByText('An on setting is saved, but playback is locked off. Turn this off and save to cancel it.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Why are you making this change?' })).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(toggle).toBeDisabled()
    const reason = screen.getByRole('textbox', { name: 'Why are you making this change?' })
    expect(reason).toBeEnabled()
    fireEvent.change(reason, { target: { value: 'Keep playback disabled after approval' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }))
    await screen.findByText('Custom shader playback turned off.')
    expect(JSON.parse(writes()[0][1].body)).toEqual({ enabled: false, reason: 'Keep playback disabled after approval' })
    current.releaseApproved = true
    fireEvent.click(screen.getByRole('button', { name: 'Check current status' }))
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled())
    expect(screen.getByRole('switch')).not.toBeChecked()
    expect(screen.getByText('Saved status: Off')).toBeInTheDocument()
  })

  it('rechecks approval just before writing, refusing a newly locked gate', async () => {
    current.enabled = false
    show()
    const save = await prepareChange()
    current.releaseApproved = false
    fireEvent.click(save)
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Allow custom shader playback' })).toBeDisabled())
    expect(writes()).toHaveLength(0)
    expect(screen.getByText('Saved status: Off')).toBeInTheDocument()
  })

  it('requires fresh authorization before writing and erases private audit on revocation', async () => {
    show()
    const save = await prepareChange()
    capabilities.canManageCustomRendering = false
    fireEvent.click(save)
    await screen.findByText('Administrator permission is required to manage custom shader playback.')
    expect(writes()).toHaveLength(0)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByText(/Private review completed/)).not.toBeInTheDocument()
  })

  it('ignores stale authorization after an account switch, before any write', async () => {
    const view = show()
    const save = await prepareChange()
    const delayed = deferred<Response>()
    mocks.fetcher.mockImplementationOnce(() => delayed.promise)
    fireEvent.click(save)
    mocks.auth.accessToken = 'other-session'; mocks.auth.user = { userId: 9 }; capabilities.canManageCustomRendering = false
    view.rerender(<ThemeProvider><CustomShaderControls /></ThemeProvider>)
    expect(screen.queryByText(/Private review completed/)).not.toBeInTheDocument()
    await screen.findByText('Administrator permission is required to manage custom shader playback.')
    await act(async () => delayed.resolve(response(admin)))
    expect(writes()).toHaveLength(0)
  })

  it('prevents duplicate saves while the server reply is pending', async () => {
    const delayed = deferred<Response>()
    mutate = () => delayed.promise
    show()
    const save = await prepareChange()
    fireEvent.click(save); fireEvent.click(save)
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('switch')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Check current status' })).toBeDisabled()
    current.enabled = false
    await act(async () => delayed.resolve(response(current)))
    await screen.findByText('Custom shader playback turned off.')
  })

  it('invalidates all playback checks after an uncertain mutation and requires status refresh before retry', async () => {
    mutate = async () => { throw new Error('Private transport detail') }
    show()
    fireEvent.click(await prepareChange())
    await screen.findByText("We couldn't confirm whether your change was saved. Check the current status before trying again.")
    expect(mocks.invalidate).toHaveBeenCalledWith()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByText('Private transport detail')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check current status' }))
    await screen.findByRole('switch')
    expect(screen.queryByRole('button', { name: 'Save change' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Why are you making this change?' })).not.toBeInTheDocument()
  })

  it('removes private state on denied writes while invalidating global playback', async () => {
    mutate = async () => response({ message: 'Never show this private value' }, 403)
    show()
    fireEvent.click(await prepareChange())
    await screen.findByText('Administrator permission is required to manage custom shader playback.')
    expect(mocks.invalidate).toHaveBeenCalledWith()
    expect(screen.queryByText(/Private review completed|Never show this/)).not.toBeInTheDocument()
  })

  it('refreshes the release gate after a 409 instead of retaining an enabled draft', async () => {
    current.enabled = false
    mutate = async () => { current.releaseApproved = false; return response({ message: 'Private release detail' }, 409) }
    show()
    fireEvent.click(await prepareChange())
    await waitFor(() => expect(screen.getByRole('switch')).toBeDisabled())
    expect(screen.getByRole('switch')).not.toBeChecked()
    expect(screen.getByText('Saved status: Off')).toBeInTheDocument()
    expect(screen.queryByText('Private release detail')).not.toBeInTheDocument()
    expect(mocks.invalidate).toHaveBeenCalledWith()
  })

  it('does not report stale success when the fresh status differs after saving', async () => {
    mutate = async () => response({ ...current, enabled: false }) // Another administrator has already restored playback.
    show()
    fireEvent.click(await prepareChange())
    await screen.findByText('The status changed again. The latest saved status is shown.')
    expect(screen.getByText('Saved status: On')).toBeInTheDocument()
    expect(screen.queryByText('Custom shader playback turned off.')).not.toBeInTheDocument()
  })

  it('hides private audit on focus when current authorization cannot be verified', async () => {
    show()
    await screen.findByText(/Previous reason: Private review completed/)
    mocks.fetcher.mockRejectedValueOnce(new Error('Offline'))
    fireEvent.focus(window)
    await screen.findByText('The current playback settings couldn’t be verified. Please check again.')
    expect(screen.queryByText(/Private review completed/)).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('ignores old success after logout but still invalidates an attempted global write', async () => {
    const delayed = deferred<Response>()
    mutate = () => delayed.promise
    const view = show()
    fireEvent.click(await prepareChange())
    await waitFor(() => expect(writes()).toHaveLength(1))
    const writeSignal = writes()[0][1].signal as AbortSignal
    mocks.auth.isAuthenticated = false; mocks.auth.accessToken = null; mocks.auth.user = null
    view.rerender(<ThemeProvider><CustomShaderControls /></ThemeProvider>)
    expect(writeSignal.aborted).toBe(true)
    await act(async () => delayed.resolve(response({ ...current, enabled: false })))
    expect(mocks.invalidate).toHaveBeenCalledWith()
    expect(screen.queryByText(/Custom shader playback turned off|Private review completed/)).not.toBeInTheDocument()
  })
})


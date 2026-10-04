import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, APP_THEME_STORAGE_KEY } from '@theme'
import { ModeratorsPage } from './ModeratorsPage'
import { ModeratorSettingsLink } from './ModeratorSettingsLink'
import type { AdminCapabilities, ModeratorUser } from './api'

const auth = vi.hoisted(() => ({ accessToken: 'admin-session', user: { userId: 1 }, isAuthenticated: true,
  isRestoringSession: false, authenticatedFetch: vi.fn() }))
vi.mock('@auth', () => ({ useAuth: () => auth }))
const admin: AdminCapabilities = { canManageModerators: true, canModerateScenes: true, canManageCustomRendering: true }
const account: ModeratorUser = { userId: 8, displayName: 'Ari Rivera', handle: 'ari', email: 'ari@example.com', sceneModerator: false, isAdministrator: false, revision: 0 }
const auditEntry = { id: 12, administratorUserId: 1, targetUserId: 8, previousEnabled: false, enabled: true, revision: 1,
  reason: 'Trusted scene reviewer', requestId: '10000000-0000-4000-8000-000000000000', changedAt: '2026-10-03T12:00:00Z', source: 'administrator' }
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
let caps: AdminCapabilities
let current: ModeratorUser
let put: (body: Record<string, unknown>) => Promise<Response>
let lookup: () => Promise<Response>
let audit: (path: string) => Promise<Response>

function show(theme: 'mage-pulse' | 'classic-facebook' = 'mage-pulse') {
  localStorage.setItem(APP_THEME_STORAGE_KEY, theme)
  return render(<MemoryRouter><ThemeProvider><ModeratorsPage /></ThemeProvider></MemoryRouter>)
}
async function findAccount(query = '@ari') {
  await screen.findByRole('heading', { name: 'Find an account' })
  fireEvent.change(screen.getByRole('textbox', { name: 'Account ID, @handle, or email' }), { target: { value: query } })
  fireEvent.click(screen.getByRole('button', { name: 'Find account' }))
  return screen.findByRole('region', { name: 'Ari Rivera' })
}
async function reviewChange() {
  const result = await findAccount()
  fireEvent.change(within(result).getByRole('textbox', { name: 'Reason for this change' }), { target: { value: 'Trusted scene reviewer' } })
  fireEvent.click(within(result).getByRole('button', { name: current.sceneModerator ? 'Review removal' : 'Review grant' }))
  return screen.findByRole('button', { name: current.sceneModerator ? 'Confirm removal' : 'Confirm grant' })
}
const changes = () => auth.authenticatedFetch.mock.calls.filter(([, init]) => init?.method === 'PUT')

beforeEach(() => {
  vi.clearAllMocks()
  auth.accessToken = 'admin-session'; auth.user = { userId: 1 }; auth.isAuthenticated = true; auth.isRestoringSession = false
  caps = { ...admin }; current = { ...account }
  put = async body => {
    current = { ...current, sceneModerator: body.enabled as boolean, revision: current.revision + 1 }
    return response(current)
  }
  lookup = async () => response({ users: [current], nextCursor: null })
  audit = async () => response({ entries: [], nextCursor: null })
  auth.authenticatedFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === '/admin/capabilities') return response(caps)
    if (path.startsWith('/admin/moderators/audit?')) return audit(path)
    if (path.startsWith('/admin/moderators/users?')) return lookup()
    if (path === '/admin/moderators/users/8' && init?.method === 'PUT') return put(JSON.parse(String(init.body)))
    throw new Error(`Unexpected request: ${path}`)
  })
})

describe('moderator management', () => {
  it.each([
    { canManageModerators: false, canModerateScenes: false, canManageCustomRendering: false },
    { canManageModerators: false, canModerateScenes: true, canManageCustomRendering: false },
  ])('does not expose accounts or history without the administrator capability: %j', async denied => {
    caps = denied
    show()
    await screen.findByRole('heading', { name: 'Administrator access required' })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(auth.authenticatedFetch.mock.calls.every(([path]) => path === '/admin/capabilities')).toBe(true)
  })

  it('fails closed on an unverified capability response and supports retry', async () => {
    auth.authenticatedFetch.mockRejectedValueOnce(new Error('Private connection detail'))
    show()
    await screen.findByRole('heading', { name: 'Permissions couldn’t be checked' })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Private connection detail')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'Find an account' })
  })

  it.each(['mage-pulse', 'classic-facebook'] as const)('identifies an account and confirms a grant with keyboard access in %s', async theme => {
    show(theme)
    const confirm = await reviewChange()
    expect(screen.getByText('ari@example.com')).toBeInTheDocument()
    expect(screen.getByText('@ari')).toBeInTheDocument()
    expect(screen.getByText('Not a scene moderator')).toBeInTheDocument()
    expect(changes()).toHaveLength(0)
    expect(confirm).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await screen.findByText('Granted scene-moderator permission for Ari Rivera (account 8).')
    expect(screen.getByText('Scene moderator')).toBeInTheDocument()
    expect(changes()).toHaveLength(1)
    expect(JSON.parse(changes()[0][1].body)).toMatchObject({ enabled: true, expectedRevision: 0, reason: 'Trusted scene reviewer' })
    expect(JSON.parse(changes()[0][1].body).requestId).toMatch(/^[\da-f-]{36}$/i)
  })

  it('requires a reason and separate confirmation before revoking permission', async () => {
    current.sceneModerator = true; current.revision = 3
    show()
    const result = await findAccount('8')
    expect(within(result).getByRole('button', { name: 'Review removal' })).toBeDisabled()
    fireEvent.change(within(result).getByRole('textbox', { name: 'Reason for this change' }), { target: { value: 'No longer reviewing scenes' } })
    fireEvent.click(within(result).getByRole('button', { name: 'Review removal' }))
    expect(changes()).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
    await screen.findByText('Removed scene-moderator permission for Ari Rivera (account 8).')
    expect(JSON.parse(changes()[0][1].body)).toMatchObject({ enabled: false, expectedRevision: 3 })
  })

  it('does not offer role changes for an administrator account', async () => {
    current.isAdministrator = true
    show()
    await findAccount()
    expect(screen.getByText('Administrator')).toBeInTheDocument()
    expect(screen.getByText('Administrator access is managed separately. It cannot be changed here.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Reason for this change' })).not.toBeInTheDocument()
    expect(changes()).toHaveLength(0)
  })

  it('rejects partial account names before sending a private lookup', async () => {
    show()
    await screen.findByRole('heading', { name: 'Find an account' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Account ID, @handle, or email' }), { target: { value: 'Ari' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an exact account ID, @handle, or email address.')
    expect(auth.authenticatedFetch.mock.calls.some(([path]) => path.includes('/users?'))).toBe(false)
  })

  it('refreshes a stale account and requires a newly reviewed change after a conflict', async () => {
    put = async () => { current = { ...current, sceneModerator: true, revision: 2 }; return response({ message: 'Private conflicting write' }, 409) }
    show()
    fireEvent.click(await reviewChange())
    await screen.findByText('The latest status is shown below. Review the account and confirm a new change if needed.')
    expect(screen.getByText('Scene moderator')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm grant' })).not.toBeInTheDocument()
    const firstBody = JSON.parse(changes()[0][1].body)
    put = async body => { current = { ...current, sceneModerator: body.enabled as boolean, revision: 3 }; return response(current) }
    fireEvent.click(screen.getByRole('button', { name: 'Review removal' }))
    expect(changes()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
    await screen.findByText('Removed scene-moderator permission for Ari Rivera (account 8).')
    const nextBody = JSON.parse(changes()[1][1].body)
    expect(nextBody.expectedRevision).toBe(2)
    expect(nextBody.requestId).not.toBe(firstBody.requestId)
    expect(screen.queryByText('Private conflicting write')).not.toBeInTheDocument()
  })

  it('reuses the exact confirmed request after an uncertain result and shows newer status after replay', async () => {
    const originalResult = { ...account, sceneModerator: true, revision: 1 }
    let attempts = 0
    put = async () => {
      attempts += 1
      if (attempts === 1) throw new Error('Response was lost')
      current = { ...account, sceneModerator: false, revision: 2 }
      return response(originalResult)
    }
    show()
    fireEvent.click(await reviewChange())
    await screen.findByRole('button', { name: 'Retry same change' })
    expect(screen.getByRole('textbox', { name: 'Account ID, @handle, or email' })).toBeDisabled()
    expect(screen.queryByRole('textbox', { name: 'Reason for this change' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry same change' }))
    await screen.findByText('This change was recorded, but the account has changed since then. Review its latest status below.')
    expect(changes()[1][1].body).toBe(changes()[0][1].body)
    expect(screen.getByText('Not a scene moderator')).toBeInTheDocument()
    expect(screen.queryByText(/Granted scene-moderator permission/)).not.toBeInTheDocument()
  })

  it('blocks duplicate confirmation clicks while saving', async () => {
    let resolve!: (value: Response) => void
    put = () => new Promise(done => { resolve = done })
    show()
    const confirm = await reviewChange()
    fireEvent.click(confirm); fireEvent.click(confirm)
    await waitFor(() => expect(changes()).toHaveLength(1))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    current = { ...account, sceneModerator: true, revision: 1 }
    await act(async () => resolve(response(current)))
    await screen.findByText(/Granted scene-moderator permission/)
  })

  it('clears private account and audit data when the authenticated identity changes, ignoring old replies', async () => {
    audit = async () => response({ entries: [auditEntry], nextCursor: null })
    const view = show()
    await findAccount()
    await screen.findByText('Trusted scene reviewer')
    let resolve!: (value: Response) => void
    lookup = () => new Promise(done => { resolve = done })
    fireEvent.click(screen.getByRole('button', { name: 'Find account' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Searching…' })).toBeDisabled())
    auth.accessToken = 'different-session'; auth.user = { userId: 9 }; caps = { ...admin, canManageModerators: false }
    view.rerender(<MemoryRouter><ThemeProvider><ModeratorsPage /></ThemeProvider></MemoryRouter>)
    expect(screen.queryByText('ari@example.com')).not.toBeInTheDocument()
    expect(screen.queryByText('Trusted scene reviewer')).not.toBeInTheDocument()
    await act(async () => resolve(response({ users: [account], nextCursor: null })))
    await screen.findByRole('heading', { name: 'Administrator access required' })
    expect(screen.queryByText('Ari Rivera')).not.toBeInTheDocument()
  })

  it('rechecks authority before a mutation and clears private state when access is revoked', async () => {
    show()
    const confirm = await reviewChange()
    caps = { ...admin, canManageModerators: false }
    fireEvent.click(confirm)
    await screen.findByRole('heading', { name: 'Administrator access required' })
    expect(changes()).toHaveLength(0)
    expect(screen.queryByText('ari@example.com')).not.toBeInTheDocument()
  })

  it('never sends a confirmed change after switching sessions during the permission check', async () => {
    const view = show()
    const confirm = await reviewChange()
    let resolve!: (value: Response) => void
    auth.authenticatedFetch.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    fireEvent.click(confirm)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    auth.accessToken = 'new-session'; auth.user = { userId: 9 }; caps = { ...admin, canManageModerators: false }
    view.rerender(<MemoryRouter><ThemeProvider><ModeratorsPage /></ThemeProvider></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Administrator access required' })
    await act(async () => resolve(response(admin)))
    expect(changes()).toHaveLength(0)
    expect(screen.queryByText('ari@example.com')).not.toBeInTheDocument()
  })

  it('shows no-match feedback without exposing a permission form', async () => {
    lookup = async () => response({ users: [], nextCursor: null })
    show()
    await screen.findByRole('heading', { name: 'Find an account' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Account ID, @handle, or email' }), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find account' }))
    expect(await screen.findByText('No account matches that identifier.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Reason for this change' })).not.toBeInTheDocument()
    expect(changes()).toHaveLength(0)
  })

  it('removes private state after the backend denies a permission mutation', async () => {
    put = async () => { caps = { ...admin, canManageModerators: false }; return response({ reason: 'secret' }, 403) }
    show()
    fireEvent.click(await reviewChange())
    await screen.findByRole('heading', { name: 'Administrator access required' })
    expect(screen.queryByText('ari@example.com')).not.toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('shows administrator audit records and replaces the bounded page when loading older history', async () => {
    audit = async path => response(path.includes('beforeId=12')
      ? { entries: [{ ...auditEntry, id: 10, administratorUserId: null, source: 'legacy-allowlist', reason: 'Existing scene moderator migrated' }], nextCursor: null }
      : { entries: [auditEntry], nextCursor: 12 })
    show()
    await screen.findByText('Trusted scene reviewer')
    expect(screen.getByText(/Administrator 1/)).toBeInTheDocument()
    expect(screen.getByText('Account 8: Not a scene moderator → Scene moderator')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Older changes' }))
    await screen.findByText('Existing scene moderator migrated')
    expect(screen.getByText(/Server migration/)).toBeInTheDocument()
    expect(screen.queryByText('Trusted scene reviewer')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Latest changes' })).toBeInTheDocument()
  })
})

describe('moderator settings navigation', () => {
  it('shows the link only after the administrator capability is verified and removes it on account change', async () => {
    const view = render(<ModeratorSettingsLink />)
    expect(screen.queryByRole('link', { name: 'Scene moderators' })).not.toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Scene moderators' })).toHaveAttribute('href', '/settings/moderators')
    auth.accessToken = 'regular-session'; caps = { ...admin, canManageModerators: false }
    view.rerender(<ModeratorSettingsLink />)
    expect(screen.queryByRole('link', { name: 'Scene moderators' })).not.toBeInTheDocument()
    await waitFor(() => expect(auth.authenticatedFetch).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('link', { name: 'Scene moderators' })).not.toBeInTheDocument()
  })
})

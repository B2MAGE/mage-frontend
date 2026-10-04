import { describe, expect, it, vi } from 'vitest'
import { fetchAdminCapabilities, fetchModeratorAudit, findModeratorUsers, isExactModeratorQuery, isModerationAccessDenied, updateModerator } from './api'

const signal = () => new AbortController().signal
const respond = (value: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status }))
const user = { userId: 8, displayName: 'Ari', handle: 'ari', email: 'ari@example.com', sceneModerator: false, isAdministrator: false, revision: 0 }
const change = { enabled: true, expectedRevision: 0, requestId: '10000000-0000-4000-8000-000000000000', reason: 'Scene reviewer' }

describe('moderator API boundaries', () => {
  it('accepts only exact bounded identifiers, including supported long email addresses', async () => {
    for (const query of ['8', '@ari', 'ari@example.com', `${'a'.repeat(290)}@example.com`]) expect(isExactModeratorQuery(query)).toBe(true)
    for (const query of ['', 'Ari Rivera', 'ari', '0', '9007199254740992', '@a', 'a b@example.com', `${'a'.repeat(320)}@example.com`]) expect(isExactModeratorQuery(query)).toBe(false)
    const fetcher = respond({ users: [{ ...user, email: `${'a'.repeat(290)}@example.com` }], nextCursor: null })
    expect(await findModeratorUsers(fetcher, '8', signal())).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledWith('/admin/moderators/users?query=8', expect.objectContaining({ cache: 'no-store' }))
  })

  it.each([{}, { canManageModerators: true }, { canManageModerators: 'true', canModerateScenes: true, canManageCustomRendering: true }])('does not trust incomplete or malformed capability claims %j', async value => {
    await expect(fetchAdminCapabilities(respond(value), signal())).rejects.toThrow('Permissions could not be verified.')
  })

  it.each([401, 403])('returns a recognizable safe access error for %s', async status => {
    try { await fetchAdminCapabilities(respond({ message: 'Private operator information' }, status), signal()) }
    catch (error) {
      expect(isModerationAccessDenied(error)).toBe(true)
      expect(String(error)).not.toContain('Private operator information')
    }
  })

  it('rejects malformed, broad or unmatched account responses', async () => {
    await expect(findModeratorUsers(respond({ users: [user, user], nextCursor: null }), '@ari', signal())).rejects.toThrow()
    await expect(findModeratorUsers(respond({ users: [{ ...user, isAdministrator: undefined }], nextCursor: null }), '@ari', signal())).rejects.toThrow()
    await expect(updateModerator(respond({ ...user, userId: 9, sceneModerator: true }), 8, change, signal())).rejects.toThrow()
    await expect(updateModerator(respond(user), 8, change, signal())).rejects.toThrow()
  })

  it('rejects invalid mutation fields without sending a request', async () => {
    const fetcher = vi.fn()
    await expect(updateModerator(fetcher, 8, { ...change, requestId: 'not-a-uuid' }, signal())).rejects.toThrow()
    await expect(updateModerator(fetcher, 8, { ...change, reason: ' ' }, signal())).rejects.toThrow()
    await expect(updateModerator(fetcher, 8, { ...change, expectedRevision: -1 }, signal())).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects unbounded or non-progressing audit pages', async () => {
    await expect(fetchModeratorAudit(respond({ entries: [], nextCursor: 5 }), signal())).rejects.toThrow()
    await expect(fetchModeratorAudit(respond({ entries: Array(21).fill({}), nextCursor: null }), signal())).rejects.toThrow()
    const fetcher = vi.fn()
    await expect(fetchModeratorAudit(fetcher, signal(), 0)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})

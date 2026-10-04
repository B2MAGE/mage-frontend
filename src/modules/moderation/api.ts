import type { AuthenticatedFetch } from '@auth'

export type AdminCapabilities = {
  canModerateScenes: boolean
  canManageModerators: boolean
  canManageCustomRendering: boolean
}

export type ModeratorUser = {
  userId: number
  displayName: string
  handle: string | null
  email: string
  sceneModerator: boolean
  isAdministrator: boolean
  revision: number
}

export type ModeratorChange = {
  enabled: boolean
  expectedRevision: number
  requestId: string
  reason: string
}

export type ModeratorAuditEntry = {
  id: number
  administratorUserId: number | null
  targetUserId: number
  previousEnabled: boolean
  enabled: boolean
  revision: number
  reason: string
  requestId: string
  changedAt: string
  source: 'administrator' | 'legacy-allowlist'
}
export type ModeratorAuditPage = { entries: ModeratorAuditEntry[]; nextCursor: number | null }

export class ModerationRequestError extends Error {
  readonly status: number
  constructor(status: number) {
    super(status === 409 ? 'This account’s permission changed. Review the latest status before confirming again.'
      : status === 401 || status === 403 ? 'You do not have permission to manage moderators.'
        : 'The request could not be completed. Please try again.')
    this.status = status
  }
}

export function isModerationAccessDenied(error: unknown) {
  return error instanceof ModerationRequestError && (error.status === 401 || error.status === 403)
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const revision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const boundedText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)

export function isExactModeratorQuery(query: string) {
  const value = query.trim()
  return value.length <= 320 && (
    (/^[1-9]\d*$/.test(value) && positiveId(Number(value))) ||
    /^@[a-z][a-z0-9_]{2,29}$/i.test(value) ||
    /^[^\s@]+@[^\s@]+$/.test(value)
  )
}

function readUser(value: unknown): ModeratorUser {
  if (!record(value) || !positiveId(value.userId) || !boundedText(value.displayName, 200)
    || !(value.handle === null || boundedText(value.handle, 30)) || !boundedText(value.email, 320)
    || typeof value.sceneModerator !== 'boolean' || typeof value.isAdministrator !== 'boolean' || !revision(value.revision)) {
    throw new Error('Moderator account details could not be verified.')
  }
  return { userId: value.userId, displayName: value.displayName, handle: value.handle, email: value.email,
    sceneModerator: value.sceneModerator, isAdministrator: value.isAdministrator, revision: value.revision }
}

async function request(fetcher: AuthenticatedFetch, path: string, signal: AbortSignal, body?: ModeratorChange): Promise<unknown> {
  const response = await fetcher(path, { signal, cache: 'no-store',
    ...(body ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new ModerationRequestError(response.status)
  return response.json()
}

export async function fetchAdminCapabilities(fetcher: AuthenticatedFetch, signal: AbortSignal): Promise<AdminCapabilities> {
  const value = await request(fetcher, '/admin/capabilities', signal)
  if (!record(value) || typeof value.canModerateScenes !== 'boolean' || typeof value.canManageModerators !== 'boolean'
    || typeof value.canManageCustomRendering !== 'boolean') throw new Error('Permissions could not be verified.')
  return { canModerateScenes: value.canModerateScenes, canManageModerators: value.canManageModerators,
    canManageCustomRendering: value.canManageCustomRendering }
}

export async function findModeratorUsers(fetcher: AuthenticatedFetch, query: string, signal: AbortSignal): Promise<ModeratorUser[]> {
  if (!isExactModeratorQuery(query)) throw new Error('Enter an exact account ID, @handle, or email address.')
  const value = await request(fetcher, `/admin/moderators/users?query=${encodeURIComponent(query.trim())}`, signal)
  if (!record(value) || !Array.isArray(value.users) || value.users.length > 1 || value.nextCursor !== null) {
    throw new Error('Moderator account details could not be verified.')
  }
  return value.users.map(readUser)
}

export async function updateModerator(fetcher: AuthenticatedFetch, userId: number, body: ModeratorChange, signal: AbortSignal): Promise<ModeratorUser> {
  if (!positiveId(userId) || typeof body.enabled !== 'boolean' || !revision(body.expectedRevision) || !uuid(body.requestId)
    || !boundedText(body.reason, 1000) || !body.reason.trim()) throw new Error('Review the permission change before confirming.')
  const result = readUser(await request(fetcher, `/admin/moderators/users/${userId}`, signal, body))
  if (result.userId !== userId || result.sceneModerator !== body.enabled || result.revision < body.expectedRevision) {
    throw new Error('The updated permission could not be verified.')
  }
  return result
}

export async function fetchModeratorAudit(fetcher: AuthenticatedFetch, signal: AbortSignal, beforeId?: number): Promise<ModeratorAuditPage> {
  if (beforeId !== undefined && !positiveId(beforeId)) throw new Error('Invalid history page.')
  const value = await request(fetcher, `/admin/moderators/audit?limit=20${beforeId === undefined ? '' : `&beforeId=${beforeId}`}`, signal)
  if (!record(value) || !Array.isArray(value.entries) || value.entries.length > 20
    || !(value.nextCursor === null || positiveId(value.nextCursor))) throw new Error('Permission history could not be verified.')
  const entries = value.entries.map((entry: unknown): ModeratorAuditEntry => {
    if (!record(entry) || !positiveId(entry.id) || !positiveId(entry.targetUserId)
      || !(entry.administratorUserId === null || positiveId(entry.administratorUserId))
      || typeof entry.previousEnabled !== 'boolean' || typeof entry.enabled !== 'boolean' || !revision(entry.revision)
      || !boundedText(entry.reason, 1000) || !uuid(entry.requestId) || !boundedText(entry.changedAt, 64)
      || !Number.isFinite(Date.parse(entry.changedAt)) || !['administrator', 'legacy-allowlist'].includes(String(entry.source))
      || (entry.source === 'administrator' && entry.administratorUserId === null)) throw new Error('Permission history could not be verified.')
    return { id: entry.id, administratorUserId: entry.administratorUserId, targetUserId: entry.targetUserId,
      previousEnabled: entry.previousEnabled, enabled: entry.enabled, revision: entry.revision, reason: entry.reason,
      requestId: entry.requestId, changedAt: entry.changedAt, source: entry.source as ModeratorAuditEntry['source'] }
  })
  if (entries.some((entry, index) => (beforeId !== undefined && entry.id >= beforeId) || (index > 0 && entry.id >= entries[index - 1].id))
    || (value.nextCursor !== null && (!entries.length || value.nextCursor !== entries[entries.length - 1].id))) {
    throw new Error('Permission history could not be verified.')
  }
  return { entries, nextCursor: value.nextCursor }
}

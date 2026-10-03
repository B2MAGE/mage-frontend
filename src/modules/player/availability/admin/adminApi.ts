import type { AuthenticatedFetch } from '@auth'

type Audit = { changedByUserId: number | null; changedAt: string | null; reason: string | null }
export type SceneControl = Audit & { sceneId: number; disabled: boolean }
export type CustomRenderingControl = Audit & { enabled: boolean; releaseApproved: boolean }

export class OperatorRequestError extends Error {
  readonly status: number
  constructor(status: number) {
    super(status === 409
      ? 'Custom rendering cannot be enabled until the isolation release checks are approved.'
      : 'Could not update playback availability. Refresh the status and try again.')
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasAudit(value: Record<string, unknown>) {
  return (value.changedByUserId === null || (Number.isSafeInteger(value.changedByUserId) && Number(value.changedByUserId) > 0))
    && (value.changedAt === null || (typeof value.changedAt === 'string' && Number.isFinite(Date.parse(value.changedAt))))
    && (value.reason === null || typeof value.reason === 'string')
}

async function request(fetcher: AuthenticatedFetch, path: string, signal: AbortSignal, body?: object) {
  const response = await fetcher(path, {
    signal,
    cache: 'no-store',
    ...(body ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) throw new OperatorRequestError(response.status)
  return response.json() as Promise<unknown>
}

export async function fetchCustomControl(fetcher: AuthenticatedFetch, signal: AbortSignal) {
  const value = await request(fetcher, '/admin/rendering/custom', signal)
  if (!isRecord(value) || !hasAudit(value) || typeof value.enabled !== 'boolean' || typeof value.releaseApproved !== 'boolean') {
    throw new Error('Invalid operator status response.')
  }
  return value as CustomRenderingControl
}

export async function fetchSceneControl(fetcher: AuthenticatedFetch, sceneId: number, signal: AbortSignal) {
  const value = await request(fetcher, `/admin/scenes/${sceneId}/availability`, signal)
  if (!isRecord(value) || !hasAudit(value) || value.sceneId !== sceneId || typeof value.disabled !== 'boolean') {
    throw new Error('Invalid operator status response.')
  }
  return value as SceneControl
}

export async function updateSceneControl(fetcher: AuthenticatedFetch, sceneId: number, disabled: boolean, reason: string, signal: AbortSignal) {
  await request(fetcher, `/admin/scenes/${sceneId}/availability`, signal, { disabled, reason })
}

export async function updateCustomControl(fetcher: AuthenticatedFetch, enabled: boolean, reason: string, signal: AbortSignal) {
  await request(fetcher, '/admin/rendering/custom', signal, { enabled, reason })
}

export function isOperatorAccessDenied(error: unknown) {
  return error instanceof OperatorRequestError && (error.status === 401 || error.status === 403)
}

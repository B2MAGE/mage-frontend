import type { AuthenticatedFetch } from '@auth'
import { DEFAULT_AVATAR_GRADIENT, normalizeAvatarColor } from '@shared/lib/avatarGradient'
import {
  buildApiUrl,
  normalizeSceneList,
  type SceneListResponse,
} from '@shared/lib'

const PROFILE_HANDLE_PATTERN = /^[a-z][a-z0-9_]{2,29}$/

type PublicProfileResponse = {
  userId: number
  displayName: string
  handle: string
  description: string | null
  avatarGradientStart?: string | null
  avatarGradientEnd?: string | null
  createdAt: string
  scenes: SceneListResponse[]
}

export type ProfileStats = {
  likes: number
  saves: number
  scenes: number
  views: number
}

export type ProfileViewModel = PublicProfileResponse & {
  initials: string
  stats: ProfileStats
}

export type PublicProfileErrorCode = 'invalid-payload' | 'not-found' | 'unavailable'

export class PublicProfileRequestError extends Error {
  code: PublicProfileErrorCode

  constructor(code: PublicProfileErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function buildInitials(displayName: string, handle: string) {
  const source = displayName.trim() || handle.trim() || 'MAGE'
  const words = source.split(/\s+/).filter(Boolean)

  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase()
  }

  return source.slice(0, 2).toUpperCase()
}

export function normalizeProfileHandle(value: string | undefined) {
  const normalized = value?.trim().replace(/^@/, '').toLocaleLowerCase() ?? ''
  return PROFILE_HANDLE_PATTERN.test(normalized) ? normalized : null
}

function normalizePublicProfile(payload: unknown): PublicProfileResponse | null {
  if (!isRecord(payload)) {
    return null
  }

  const handle = typeof payload.handle === 'string'
    ? normalizeProfileHandle(payload.handle)
    : null

  if (
    typeof payload.userId !== 'number' ||
    !Number.isFinite(payload.userId) ||
    typeof payload.displayName !== 'string' ||
    !payload.displayName.trim() ||
    !handle ||
    typeof payload.createdAt !== 'string' ||
    !payload.createdAt.trim() ||
    !Array.isArray(payload.scenes)
  ) {
    return null
  }

  return {
    userId: payload.userId,
    displayName: payload.displayName.trim(),
    handle,
    ...(payload.avatarGradientStart !== undefined ? {
      avatarGradientStart: normalizeAvatarColor(payload.avatarGradientStart, DEFAULT_AVATAR_GRADIENT.start),
    } : {}),
    ...(payload.avatarGradientEnd !== undefined ? {
      avatarGradientEnd: normalizeAvatarColor(payload.avatarGradientEnd, DEFAULT_AVATAR_GRADIENT.end),
    } : {}),
    description:
      typeof payload.description === 'string' && payload.description.trim()
        ? payload.description.trim()
        : null,
    createdAt: payload.createdAt,
    scenes: normalizeSceneList(payload.scenes),
  }
}

export async function fetchPublicProfile(
  authenticatedFetch: AuthenticatedFetch,
  isAuthenticated: boolean,
  handle: string,
) {
  const path = `/profiles/${encodeURIComponent(handle)}`
  const response = isAuthenticated
    ? await authenticatedFetch(path)
    : await fetch(buildApiUrl(path))

  if (response.status === 404) {
    throw new PublicProfileRequestError('not-found', `Profile @${handle} was not found.`)
  }

  if (!response.ok) {
    throw new PublicProfileRequestError(
      'unavailable',
      `Profile request failed with status ${response.status}.`,
    )
  }

  const profile = normalizePublicProfile(await response.json().catch(() => null))

  if (!profile) {
    throw new PublicProfileRequestError(
      'invalid-payload',
      'Profile response is missing required public data.',
    )
  }

  return profile
}

export function buildProfileViewModel(profile: PublicProfileResponse): ProfileViewModel {
  const sortedScenes = [...profile.scenes].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  )

  return {
    ...profile,
    initials: buildInitials(profile.displayName, profile.handle),
    scenes: sortedScenes,
    stats: sortedScenes.reduce<ProfileStats>(
      (stats, scene) => ({
        likes: stats.likes + scene.engagement.upvotes,
        saves: stats.saves + scene.engagement.saves,
        scenes: stats.scenes + 1,
        views: stats.views + scene.engagement.views,
      }),
      { likes: 0, saves: 0, scenes: 0, views: 0 },
    ),
  }
}

export function filterProfileScenes(scenes: SceneListResponse[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  if (!normalizedQuery) {
    return scenes
  }

  return scenes.filter((scene) => scene.name.toLocaleLowerCase().includes(normalizedQuery))
}

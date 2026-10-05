import { DEFAULT_AVATAR_GRADIENT, normalizeAvatarColor } from './avatarGradient'

function normalizeApiPath(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (normalizedPath === '/api' || normalizedPath.startsWith('/api/')) {
    return normalizedPath
  }

  return `/api${normalizedPath}`
}

export function buildApiUrl(path: string) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  const apiPath = normalizeApiPath(path)

  if (!baseUrl) {
    return apiPath
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')

  if (normalizedBaseUrl.endsWith('/api') && (apiPath === '/api' || apiPath.startsWith('/api/'))) {
    const apiSuffix = apiPath.slice('/api'.length)
    return apiSuffix ? `${normalizedBaseUrl}${apiSuffix}` : normalizedBaseUrl
  }

  return `${normalizedBaseUrl}${apiPath}`
}

export type SceneAvailability = {
  sceneId: number
  available: boolean
  code: string
  message: string
}

export type SceneMode = 'legacy-custom' | 'custom-v1' | 'template-v1' | 'builder-v1'

export function normalizeSceneMode(value: unknown): SceneMode | null {
  return value === 'legacy-custom' || value === 'custom-v1' || value === 'template-v1' || value === 'builder-v1' ? value : null
}

export type SceneListResponse = {
  sceneId: number
  ownerUserId: number
  creatorDisplayName: string
  creatorHandle?: string | null
  creatorAvatarGradientStart?: string | null
  creatorAvatarGradientEnd?: string | null
  name: string
  description?: string | null
  sceneData: Record<string, unknown> | null
  availability?: SceneAvailability | null
  sceneMode?: SceneMode | null
  thumbnailRef: string | null
  createdAt: string
  engagement: SceneListEngagement
}

export type TagResponse = {
  tagId: number
  name: string
  sceneCount: number
}

export type SceneEngagementVoteState = 'up' | 'down'

export type SceneListEngagement = {
  views: number
  upvotes: number
  downvotes: number
  saves: number
  currentUserVote: SceneEngagementVoteState | null
  currentUserSaved: boolean
}

export type FetchTagsOptions = {
  attachedOnly?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeSceneAvailability(value: unknown, sceneId: number): SceneAvailability | null {
  if (
    !isRecord(value) || value.sceneId !== sceneId ||
    typeof value.available !== 'boolean' || typeof value.code !== 'string'
  ) {
    return null
  }

  const available = value.available === true && value.code === 'AVAILABLE'
  if (typeof value.message !== 'string' && !(available && value.message === null)) return null

  const message = value.code === 'SCENE_UPGRADE_REQUIRED'
    ? 'This scene needs an update from its creator before it can play.'
    : value.code === 'BUILDER_RENDERING_UNAVAILABLE' ? 'Builder scene playback is not available yet.' : value.message as string
  return { sceneId, available: value.available, code: value.code, message: available ? '' : message }
}

function normalizeCount(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0
  }

  return Math.trunc(value)
}

function normalizeCurrentUserVote(value: unknown): SceneEngagementVoteState | null {
  return value === 'up' || value === 'down' ? value : null
}

export function normalizeSceneListEngagement(engagement: unknown): SceneListEngagement {
  if (!isRecord(engagement)) {
    return {
      views: 0,
      upvotes: 0,
      downvotes: 0,
      saves: 0,
      currentUserVote: null,
      currentUserSaved: false,
    }
  }

  return {
    views: normalizeCount(engagement.views),
    upvotes: normalizeCount(engagement.upvotes),
    downvotes: normalizeCount(engagement.downvotes),
    saves: normalizeCount(engagement.saves),
    currentUserVote: normalizeCurrentUserVote(engagement.currentUserVote),
    currentUserSaved: engagement.currentUserSaved === true,
  }
}

export function normalizeSceneListItem(item: unknown): SceneListResponse | null {
  if (!isRecord(item)) {
    return null
  }

  if (
    typeof item.sceneId !== 'number' ||
    typeof item.ownerUserId !== 'number' ||
    typeof item.creatorDisplayName !== 'string' ||
    typeof item.name !== 'string' ||
    typeof item.createdAt !== 'string'
  ) {
    return null
  }

  const availability = normalizeSceneAvailability(item.availability, item.sceneId)

  return {
    sceneId: item.sceneId,
    ownerUserId: item.ownerUserId,
    creatorDisplayName: item.creatorDisplayName.trim() || 'Unknown creator',
    ...(item.creatorAvatarGradientStart !== undefined ? {
      creatorAvatarGradientStart: normalizeAvatarColor(item.creatorAvatarGradientStart, DEFAULT_AVATAR_GRADIENT.start),
    } : {}),
    ...(item.creatorAvatarGradientEnd !== undefined ? {
      creatorAvatarGradientEnd: normalizeAvatarColor(item.creatorAvatarGradientEnd, DEFAULT_AVATAR_GRADIENT.end),
    } : {}),
    creatorHandle:
      typeof item.creatorHandle === 'string' && item.creatorHandle.trim()
        ? item.creatorHandle.trim().toLowerCase()
        : null,
    name: item.name.trim() || `Scene ${item.sceneId}`,
    description:
      typeof item.description === 'string' && item.description.trim()
        ? item.description.trim()
        : null,
    sceneData: availability?.available === false || !isRecord(item.sceneData) ? null : item.sceneData,
    availability,
    sceneMode: normalizeSceneMode(item.sceneMode),
    thumbnailRef:
      typeof item.thumbnailRef === 'string' && item.thumbnailRef.trim()
        ? item.thumbnailRef
        : null,
    createdAt: item.createdAt,
    engagement: normalizeSceneListEngagement(item.engagement),
  }
}

export function normalizeSceneList(payload: unknown): SceneListResponse[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.reduce<SceneListResponse[]>((scenes, item) => {
    const scene = normalizeSceneListItem(item)

    if (scene) {
      scenes.push(scene)
    }

    return scenes
  }, [])
}

export async function fetchAvailableTags(options?: FetchTagsOptions): Promise<TagResponse[]> {
  const query = options?.attachedOnly ? '?attachedOnly=true' : ''
  const response = await fetch(buildApiUrl(`/tags${query}`))

  if (!response.ok) {
    throw new Error(`Failed to fetch tags (${response.status})`)
  }

  return response.json() as Promise<TagResponse[]>
}

export async function fetchScenes(tag?: string | null): Promise<SceneListResponse[]> {
  const query = tag ? `?tag=${encodeURIComponent(tag)}` : ''
  const response = await fetch(buildApiUrl(`/scenes${query}`))

  if (!response.ok) {
    throw new Error(`Failed to fetch scenes (${response.status})`)
  }

  return normalizeSceneList(await response.json().catch(() => []))
}

export async function fetchTags(options?: FetchTagsOptions): Promise<TagResponse[]> {
  try {
    return await fetchAvailableTags(options)
  } catch {
    return []
  }
}

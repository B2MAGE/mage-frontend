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

export type SceneListResponse = {
  sceneId: number
  ownerUserId: number
  creatorDisplayName: string
  name: string
  description?: string | null
  sceneData: Record<string, unknown>
  thumbnailRef: string | null
  createdAt: string
  engagement: SceneListEngagement
}

export type TagResponse = {
  tagId: number
  name: string
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

  return {
    sceneId: item.sceneId,
    ownerUserId: item.ownerUserId,
    creatorDisplayName: item.creatorDisplayName.trim() || 'Unknown creator',
    name: item.name.trim() || `Scene ${item.sceneId}`,
    description:
      typeof item.description === 'string' && item.description.trim()
        ? item.description.trim()
        : null,
    sceneData: isRecord(item.sceneData) ? item.sceneData : {},
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

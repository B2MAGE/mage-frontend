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
  sceneData: Record<string, unknown>
  thumbnailRef: string | null
  createdAt: string
}

export type TagResponse = {
  tagId: number
  name: string
}

export type FetchTagsOptions = {
  attachedOnly?: boolean
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

  return response.json() as Promise<SceneListResponse[]>
}

export async function fetchTags(options?: FetchTagsOptions): Promise<TagResponse[]> {
  try {
    return await fetchAvailableTags(options)
  } catch {
    return []
  }
}

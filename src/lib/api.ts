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

export type PresetListResponse = {
  presetId: number
  ownerUserId: number
  name: string
  sceneData: Record<string, unknown>
  thumbnailRef: string | null
  createdAt: string
}

export type TagResponse = {
  tagId: number
  name: string
}

export async function fetchPresets(tag?: string | null): Promise<PresetListResponse[]> {
  const query = tag ? `?tag=${encodeURIComponent(tag)}` : ''
  const response = await fetch(buildApiUrl(`/presets${query}`))

  if (!response.ok) {
    throw new Error(`Failed to fetch presets (${response.status})`)
  }

  return response.json() as Promise<PresetListResponse[]>
}

export async function fetchTags(): Promise<TagResponse[]> {
  try {
    const response = await fetch(buildApiUrl('/tags'))

    if (!response.ok) {
      return []
    }

    return (await response.json()) as TagResponse[]
  } catch {
    return []
  }
}

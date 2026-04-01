export type PresetResponse = {
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

export function buildApiUrl(path: string): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

  if (!baseUrl) {
    return path
  }

  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

export async function fetchPresets(tag?: string | null): Promise<PresetResponse[]> {
  const query = tag ? `?tag=${encodeURIComponent(tag)}` : ''
  const response = await fetch(buildApiUrl(`/presets${query}`))

  if (!response.ok) {
    throw new Error(`Failed to fetch presets (${response.status})`)
  }

  return response.json() as Promise<PresetResponse[]>
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

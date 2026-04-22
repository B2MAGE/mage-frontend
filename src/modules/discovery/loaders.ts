import { buildApiUrl } from '@lib/api'
import type { DiscoveryScene, DiscoveryTag } from './types'

type FetchDiscoveryTagOptions = {
  attachedOnly?: boolean
}

export async function fetchDiscoveryScenes(tag?: string | null): Promise<DiscoveryScene[]> {
  const query = tag ? `?tag=${encodeURIComponent(tag)}` : ''
  const response = await fetch(buildApiUrl(`/scenes${query}`))

  if (!response.ok) {
    throw new Error(`Failed to fetch scenes (${response.status})`)
  }

  return response.json() as Promise<DiscoveryScene[]>
}

export async function fetchDiscoveryTags(
  options?: FetchDiscoveryTagOptions,
): Promise<DiscoveryTag[]> {
  const query = options?.attachedOnly ? '?attachedOnly=true' : ''

  try {
    const response = await fetch(buildApiUrl(`/tags${query}`))

    if (!response.ok) {
      throw new Error(`Failed to fetch tags (${response.status})`)
    }

    return response.json() as Promise<DiscoveryTag[]>
  } catch {
    return []
  }
}

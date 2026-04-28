import { fetchScenes, fetchTags } from '@shared/lib'
import type { DiscoveryScene, DiscoveryTag } from './types'

type FetchDiscoveryTagOptions = {
  attachedOnly?: boolean
}

export async function fetchDiscoveryScenes(tag?: string | null): Promise<DiscoveryScene[]> {
  return fetchScenes(tag)
}

export async function fetchDiscoveryTags(
  options?: FetchDiscoveryTagOptions,
): Promise<DiscoveryTag[]> {
  return fetchTags(options)
}

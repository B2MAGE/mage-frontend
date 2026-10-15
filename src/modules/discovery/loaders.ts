import { buildApiUrl, fetchTags, normalizeSceneListItem, normalizeSceneSummaryItem, type SceneListResponse } from '@shared/lib'
import type { DiscoveryPage, DiscoveryPageQuery, DiscoveryTag } from './types'

type FetchDiscoveryTagOptions = {
  attachedOnly?: boolean
}

export async function fetchDiscoveryScenes(query: DiscoveryPageQuery, signal?: AbortSignal): Promise<DiscoveryPage> {
  const params = new URLSearchParams({ page: String(query.page), size: String(query.size), sort: query.sort })
  if (query.tag) params.set('tag', query.tag)
  const response = await fetch(buildApiUrl(`/scenes/discovery?${params}`), { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`Failed to fetch scenes (${response.status})`)

  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid scene page')
  const page = payload as Record<string, unknown>
  if (
    page.page !== query.page || page.size !== query.size ||
    typeof page.totalElements !== 'number' || !Number.isSafeInteger(page.totalElements) || page.totalElements < 0 ||
    page.totalPages !== Math.ceil(page.totalElements / query.size) ||
    !Array.isArray(page.items) || page.items.length > query.size || page.items.length > page.totalElements
  ) throw new Error('Invalid scene page')

  const items = page.items.map(normalizeSceneSummaryItem)
  if (items.some(item => item === null) || new Set(items.map(item => item?.sceneId)).size !== items.length) {
    throw new Error('Invalid scene summaries')
  }
  return {
    items: items.filter(item => item !== null),
    page: query.page,
    size: query.size,
    totalElements: page.totalElements,
    totalPages: page.totalPages as number,
  }
}

export async function fetchDiscoveryPreview(sceneId: number, signal: AbortSignal): Promise<SceneListResponse> {
  const response = await fetch(buildApiUrl(`/scenes/${sceneId}`), { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`Failed to load preview (${response.status})`)
  const scene = normalizeSceneListItem(await response.json())
  if (!scene || scene.sceneId !== sceneId) throw new Error('Invalid scene preview')
  return scene
}

export async function fetchDiscoveryTags(
  options?: FetchDiscoveryTagOptions,
): Promise<DiscoveryTag[]> {
  return fetchTags(options)
}

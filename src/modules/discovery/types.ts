import type { SceneSummaryResponse, TagResponse } from '@shared/lib'

// A summary has no playback document until the user requests a preview.
// Explicit null still means that an existing full response withheld its source.
export type DiscoveryScene = SceneSummaryResponse & { sceneData?: Record<string, unknown> | null }
export type DiscoveryTag = TagResponse
export type DiscoveryPageState = 'loading' | 'ready' | 'error'
export type DiscoverySort =
  | 'ascending'
  | 'descending'
  | 'most-viewed'
  | 'most-liked'
  | 'featured'
  | 'recommended'

export type DiscoveryPageQuery = {
  page: number
  size: number
  sort: DiscoverySort
  tag?: string | null
}

export type DiscoveryPage = {
  items: DiscoveryScene[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

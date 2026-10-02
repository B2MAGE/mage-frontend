import type { SceneListResponse, TagResponse } from '@shared/lib'

export type DiscoveryScene = SceneListResponse
export type DiscoveryTag = TagResponse
export type DiscoveryPageState = 'loading' | 'ready' | 'error'
export type DiscoverySort =
  | 'ascending'
  | 'descending'
  | 'most-viewed'
  | 'most-liked'
  | 'featured'
  | 'recommended'

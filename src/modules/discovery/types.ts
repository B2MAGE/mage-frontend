import type { SceneListResponse, TagResponse } from '@lib/api'

export type DiscoveryScene = SceneListResponse
export type DiscoveryTag = TagResponse
export type DiscoveryPageState = 'loading' | 'ready' | 'error'

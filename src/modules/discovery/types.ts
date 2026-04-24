import type { SceneListResponse, TagResponse } from '@shared/lib'

export type DiscoveryScene = SceneListResponse
export type DiscoveryTag = TagResponse
export type DiscoveryPageState = 'loading' | 'ready' | 'error'

export type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type SceneVisibility = 'Public' | 'Private' | 'Unlisted' | 'Draft'
export type SortKey = 'updated' | 'views' | 'likes'
export type SortDirection = 'asc' | 'desc'
export type StatusFilter = 'All' | SceneVisibility

export type UserScene = {
  id: number
  name: string
  thumbnailRef: string | null
  createdAt: string | null
  description: string | null
  statusLabel: SceneVisibility
  viewsCount: number
  commentsCount: number
  likesRatio: number
}

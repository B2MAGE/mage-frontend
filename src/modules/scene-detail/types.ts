import type { MageSceneBlob } from '@modules/player'

export type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type SceneDetail = {
  id: number
  ownerUserId: number | null
  creatorDisplayName: string | null
  name: string
  description: string | null
  sceneData: MageSceneBlob
  thumbnailRef: string | null
  createdAt: string | null
  tags: string[]
  engagement: SceneEngagementSummary
}

export type SceneDetailErrorCode =
  | 'auth-required'
  | 'invalid-id'
  | 'invalid-payload'
  | 'not-found'
  | 'unavailable'

export type SceneComment = {
  author: string
  handle: string
  posted: string
  text: string
  upvotes: string
  downvotes: string
}

export type CreatorProfile = {
  displayName: string
  handle: string
  subscribersLabel: string
  primaryActionLabel?: string
}

export type SceneVoteState = 'up' | 'down'

export type SceneEngagementSummary = {
  views: number
  upvotes: number
  downvotes: number
  saves: number
  currentUserVote: SceneVoteState | null
  currentUserSaved: boolean
}

export type SceneEngagement = {
  viewsLabel: string
  upvotesLabel: string
  downvotesLabel: string
  savesLabel: string
  currentUserVote: SceneVoteState | null
  currentUserSaved: boolean
  publishedLabel: string
  topicLabel: string
}

export type SceneDescription = {
  paragraphs: string[]
  tags: string[]
}

export type RecommendedSceneCard = {
  id: number
  title: string
  creator: string
  meta: string
  accent: string
  thumbnailRef: string | null
  ownerUserId: number
}

export type RecommendedSceneGroups = {
  all: RecommendedSceneCard[]
  creator: RecommendedSceneCard[]
  byTag: Record<string, RecommendedSceneCard[]>
}

export type RecommendationFilter = 'all' | 'creator' | `tag:${string}`

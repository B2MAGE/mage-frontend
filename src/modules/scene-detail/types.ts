import type { MageSceneBlob } from '@modules/player'
import type { SceneAvailability } from '@shared/lib'

export type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type SceneDetail = {
  id: number
  ownerUserId: number | null
  creatorDisplayName: string | null
  creatorHandle?: string | null
  creatorAvatarGradientStart?: string | null
  creatorAvatarGradientEnd?: string | null
  name: string
  description: string | null
  sceneData: MageSceneBlob | null
  availability?: SceneAvailability | null
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
  commentId: number
  sceneId: number
  parentCommentId: number | null
  authorUserId: number | null
  authorDisplayName: string
  authorHandle: string | null
  authorAvatarGradientStart?: string | null
  authorAvatarGradientEnd?: string | null
  createdAt: string | null
  text: string
  replyCount: number
  upvotes: number
  downvotes: number
  currentUserVote: SceneVoteState | null
  replies: SceneComment[]
}

export type CreatorProfile = {
  displayName: string
  handle: string | null
  avatarGradientStart?: string | null
  avatarGradientEnd?: string | null
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
  creatorHandle: string | null
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

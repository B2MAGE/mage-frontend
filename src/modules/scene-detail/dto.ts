import { normalizeSceneListEngagement } from '@shared/lib'
import type { SceneComment, SceneDetail, SceneEngagementSummary, SceneVoteState } from './types'

type SceneDetailResponse = {
  sceneId?: number
  ownerUserId?: number
  creatorDisplayName?: string
  name?: string
  description?: string | null
  sceneData?: unknown
  thumbnailRef?: string | null
  createdAt?: string
  tags?: unknown
  engagement?: unknown
}

type SceneEngagementResponse = {
  views?: unknown
  upvotes?: unknown
  downvotes?: unknown
  saves?: unknown
  currentUserVote?: unknown
  currentUserSaved?: unknown
}

type SceneCommentResponse = {
  commentId?: unknown
  sceneId?: unknown
  parentCommentId?: unknown
  authorUserId?: unknown
  authorDisplayName?: unknown
  text?: unknown
  createdAt?: unknown
  replyCount?: unknown
  upvotes?: unknown
  downvotes?: unknown
  currentUserVote?: unknown
  replies?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeSceneTags(tags: unknown) {
  if (!Array.isArray(tags)) {
    return []
  }

  const normalizedTags = tags.reduce<string[]>((resolvedTags, tag) => {
    if (typeof tag === 'string' && tag.trim()) {
      resolvedTags.push(tag.trim())
      return resolvedTags
    }

    if (isRecord(tag) && typeof tag.name === 'string' && tag.name.trim()) {
      resolvedTags.push(tag.name.trim())
    }

    return resolvedTags
  }, [])

  return normalizedTags.filter((tagName, index) => normalizedTags.indexOf(tagName) === index)
}

function normalizeCurrentUserVote(value: unknown): SceneVoteState | null {
  return value === 'up' || value === 'down' ? value : null
}

function normalizeCount(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0
  }

  return Math.trunc(value)
}

export function normalizeSceneComment(payload: unknown): SceneComment | null {
  if (!isRecord(payload)) {
    return null
  }

  const resolvedPayload = payload as SceneCommentResponse
  const commentId = typeof resolvedPayload.commentId === 'number' ? resolvedPayload.commentId : null
  const sceneId = typeof resolvedPayload.sceneId === 'number' ? resolvedPayload.sceneId : null
  const text = typeof resolvedPayload.text === 'string' ? resolvedPayload.text.trim() : ''

  if (commentId === null || sceneId === null || !text) {
    return null
  }

  const replies = normalizeSceneComments(resolvedPayload.replies)

  return {
    commentId,
    sceneId,
    parentCommentId:
      typeof resolvedPayload.parentCommentId === 'number' ? resolvedPayload.parentCommentId : null,
    authorUserId: typeof resolvedPayload.authorUserId === 'number' ? resolvedPayload.authorUserId : null,
    authorDisplayName:
      typeof resolvedPayload.authorDisplayName === 'string' && resolvedPayload.authorDisplayName.trim()
        ? resolvedPayload.authorDisplayName.trim()
        : 'Mage user',
    createdAt:
      typeof resolvedPayload.createdAt === 'string' && resolvedPayload.createdAt.trim()
        ? resolvedPayload.createdAt
        : null,
    text,
    replyCount: Math.max(normalizeCount(resolvedPayload.replyCount), replies.length),
    upvotes: normalizeCount(resolvedPayload.upvotes),
    downvotes: normalizeCount(resolvedPayload.downvotes),
    currentUserVote: normalizeCurrentUserVote(resolvedPayload.currentUserVote),
    replies,
  }
}

export function normalizeSceneComments(payload: unknown): SceneComment[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.reduce<SceneComment[]>((comments, item) => {
    const comment = normalizeSceneComment(item)

    if (comment) {
      comments.push(comment)
    }

    return comments
  }, [])
}

export function normalizeSceneEngagement(engagement: unknown): SceneEngagementSummary {
  if (!isRecord(engagement)) {
    return {
      views: 0,
      upvotes: 0,
      downvotes: 0,
      saves: 0,
      currentUserVote: null,
      currentUserSaved: false,
    }
  }

  const resolvedEngagement = engagement as SceneEngagementResponse
  const sharedEngagement = normalizeSceneListEngagement(resolvedEngagement)

  return {
    views: sharedEngagement.views,
    upvotes: sharedEngagement.upvotes,
    downvotes: sharedEngagement.downvotes,
    saves: sharedEngagement.saves,
    currentUserVote: normalizeCurrentUserVote(resolvedEngagement.currentUserVote),
    currentUserSaved: sharedEngagement.currentUserSaved,
  }
}

export function normalizeSceneDetail(payload: unknown): SceneDetail | null {
  if (!isRecord(payload)) {
    return null
  }

  const resolvedPayload = payload as SceneDetailResponse
  const sceneId = typeof resolvedPayload.sceneId === 'number' ? resolvedPayload.sceneId : null

  if (sceneId === null || !isRecord(resolvedPayload.sceneData)) {
    return null
  }

  return {
    id: sceneId,
    ownerUserId: typeof resolvedPayload.ownerUserId === 'number' ? resolvedPayload.ownerUserId : null,
    creatorDisplayName:
      typeof resolvedPayload.creatorDisplayName === 'string' && resolvedPayload.creatorDisplayName.trim()
        ? resolvedPayload.creatorDisplayName.trim()
        : null,
    name:
      typeof resolvedPayload.name === 'string' && resolvedPayload.name.trim()
        ? resolvedPayload.name.trim()
        : `Scene ${sceneId}`,
    description:
      typeof resolvedPayload.description === 'string' && resolvedPayload.description.trim()
        ? resolvedPayload.description.trim()
        : null,
    sceneData: resolvedPayload.sceneData,
    thumbnailRef:
      typeof resolvedPayload.thumbnailRef === 'string' && resolvedPayload.thumbnailRef.trim()
        ? resolvedPayload.thumbnailRef
        : null,
    createdAt:
      typeof resolvedPayload.createdAt === 'string' && resolvedPayload.createdAt.trim()
        ? resolvedPayload.createdAt
        : null,
    tags: normalizeSceneTags(resolvedPayload.tags),
    engagement: normalizeSceneEngagement(resolvedPayload.engagement),
  }
}

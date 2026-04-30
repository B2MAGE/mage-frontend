import { normalizeSceneListEngagement } from '@shared/lib'
import type { SceneDetail, SceneEngagementSummary, SceneVoteState } from './types'

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

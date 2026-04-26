import type { SceneListResponse } from '@shared/lib'
import type { SceneDetail } from './types'

type SceneDetailResponse = {
  id?: number
  sceneId?: number
  ownerUserId?: number
  creatorDisplayName?: string
  name?: string
  description?: string | null
  sceneData?: unknown
  thumbnailRef?: string | null
  createdAt?: string
  tags?: unknown
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

export function normalizeSceneDetail(payload: unknown): SceneDetail | null {
  if (!isRecord(payload)) {
    return null
  }

  const resolvedPayload = payload as SceneDetailResponse
  const sceneId =
    typeof resolvedPayload.sceneId === 'number'
      ? resolvedPayload.sceneId
      : typeof resolvedPayload.id === 'number'
        ? resolvedPayload.id
        : null

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
  }
}

export function normalizeRecommendedSceneList(payload: unknown): SceneListResponse[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.reduce<SceneListResponse[]>((scenes, item) => {
    if (typeof item !== 'object' || item === null) {
      return scenes
    }

    const candidate = item as Partial<SceneListResponse>

    if (
      typeof candidate.sceneId !== 'number' ||
      typeof candidate.ownerUserId !== 'number' ||
      typeof candidate.creatorDisplayName !== 'string' ||
      typeof candidate.name !== 'string' ||
      typeof candidate.createdAt !== 'string'
    ) {
      return scenes
    }

    scenes.push({
      sceneId: candidate.sceneId,
      ownerUserId: candidate.ownerUserId,
      creatorDisplayName: candidate.creatorDisplayName.trim() || 'Unknown creator',
      name: candidate.name.trim() || `Scene ${candidate.sceneId}`,
      description:
        typeof candidate.description === 'string' && candidate.description.trim()
          ? candidate.description.trim()
          : null,
      sceneData:
        typeof candidate.sceneData === 'object' && candidate.sceneData !== null ? candidate.sceneData : {},
      thumbnailRef:
        typeof candidate.thumbnailRef === 'string' && candidate.thumbnailRef.trim()
          ? candidate.thumbnailRef
          : null,
      createdAt: candidate.createdAt,
    })

    return scenes
  }, [])
}

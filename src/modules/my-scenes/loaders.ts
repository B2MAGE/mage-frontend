import { normalizeSceneList } from '@shared/lib'
import type { AuthenticatedFetch, SceneVisibility } from './types'

function buildCommentsCount(sceneId: number) {
  return (sceneId * 3) % 17
}

function buildLikesRatio(upvotes: number, downvotes: number) {
  const totalVotes = upvotes + downvotes

  if (totalVotes === 0) {
    return 0
  }

  return Math.round((upvotes / totalVotes) * 100)
}

function buildStatusLabel(): SceneVisibility {
  return 'Public'
}

export function normalizeUserScenes(payload: unknown) {
  return normalizeSceneList(payload).map((scene) => ({
    id: scene.sceneId,
    name: scene.name,
    thumbnailRef: scene.thumbnailRef,
    createdAt: scene.createdAt,
    description: scene.description ?? null,
    statusLabel: buildStatusLabel(),
    viewsCount: scene.engagement.views,
    commentsCount: buildCommentsCount(scene.sceneId),
    likesRatio: buildLikesRatio(scene.engagement.upvotes, scene.engagement.downvotes),
  }))
}

export async function fetchUserScenes(authenticatedFetch: AuthenticatedFetch, userId: number) {
  const response = await authenticatedFetch(`/users/${userId}/scenes`)

  if (!response.ok) {
    throw new Error('Unable to load scenes.')
  }

  const payload = (await response.json().catch(() => [])) as unknown
  return normalizeUserScenes(payload)
}

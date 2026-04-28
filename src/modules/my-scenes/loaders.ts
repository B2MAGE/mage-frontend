import { normalizeSceneList } from '@shared/lib'
import type { AuthenticatedFetch, SceneVisibility } from './types'

function buildViewsCount(sceneId: number) {
  return 18 + sceneId * 37
}

function buildCommentsCount(sceneId: number) {
  return (sceneId * 3) % 17
}

function buildLikesRatio(sceneId: number) {
  return 92 + (sceneId % 7)
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
    viewsCount: buildViewsCount(scene.sceneId),
    commentsCount: buildCommentsCount(scene.sceneId),
    likesRatio: buildLikesRatio(scene.sceneId),
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

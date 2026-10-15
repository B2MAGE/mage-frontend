import { normalizeSceneList } from '@shared/lib'
import type { AuthenticatedFetch, UserScene } from './types'

export function normalizeUserScenes(payload: unknown): UserScene[] {
  return normalizeSceneList(payload).map((scene) => ({
    id: scene.sceneId,
    name: scene.name,
    thumbnailRef: scene.thumbnailRef,
    createdAt: scene.createdAt,
    description: scene.description ?? null,
    statusLabel: 'Public',
    viewsCount: scene.engagement.views,
    commentsCount: scene.engagement.comments,
    likesRatio: scene.engagement.likesRatio,
  }))
}

export async function fetchUserScenes(authenticatedFetch: AuthenticatedFetch, userId: number) {
  const response = await authenticatedFetch(`/users/${userId}/scenes`)

  if (!response.ok) {
    throw new Error('Unable to load scenes.')
  }

  return normalizeUserScenes(await response.json())
}

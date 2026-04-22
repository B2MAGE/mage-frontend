import { demoSceneRequests } from './fixtures'
import type { AuthenticatedFetch, SceneVisibility, UserScene } from './types'

type UserSceneResponse = {
  id?: number
  sceneId?: number
  name?: string
  thumbnailRef?: string | null
  createdAt?: string
  description?: string | null
}

function isUserSceneResponse(value: unknown): value is UserSceneResponse {
  return typeof value === 'object' && value !== null
}

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
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.reduce<UserScene[]>((scenes, item) => {
    const sceneId =
      isUserSceneResponse(item) && typeof item.id === 'number'
        ? item.id
        : isUserSceneResponse(item) && typeof item.sceneId === 'number'
          ? item.sceneId
          : null

    if (!isUserSceneResponse(item) || sceneId === null) {
      return scenes
    }

    scenes.push({
      id: sceneId,
      name:
        typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Scene ${sceneId}`,
      thumbnailRef:
        typeof item.thumbnailRef === 'string' && item.thumbnailRef.trim() ? item.thumbnailRef : null,
      createdAt: typeof item.createdAt === 'string' && item.createdAt.trim() ? item.createdAt : null,
      description:
        typeof item.description === 'string' && item.description.trim() ? item.description.trim() : null,
      statusLabel: buildStatusLabel(),
      viewsCount: buildViewsCount(sceneId),
      commentsCount: buildCommentsCount(sceneId),
      likesRatio: buildLikesRatio(sceneId),
    })

    return scenes
  }, [])
}

export async function fetchUserScenes(authenticatedFetch: AuthenticatedFetch, userId: number) {
  const response = await authenticatedFetch(`/users/${userId}/scenes`)

  if (!response.ok) {
    throw new Error('Unable to load scenes.')
  }

  const payload = (await response.json().catch(() => [])) as unknown
  return normalizeUserScenes(payload)
}

export async function createDemoScenes(authenticatedFetch: AuthenticatedFetch) {
  for (const scene of demoSceneRequests) {
    const response = await authenticatedFetch('/scenes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scene),
    })

    if (!response.ok) {
      throw new Error('Unable to add sample scenes right now. Please try again in a moment.')
    }
  }
}

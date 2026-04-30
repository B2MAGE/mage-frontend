import { buildApiUrl, fetchScenes } from '@shared/lib'
import { normalizeSceneDetail, normalizeSceneEngagement } from './dto'
import { buildRecommendedSceneGroups } from './recommendations'
import type {
  AuthenticatedFetch,
  RecommendedSceneGroups,
  SceneDetail,
  SceneDetailErrorCode,
  SceneEngagementSummary,
  SceneVoteState,
} from './types'

export class SceneDetailRequestError extends Error {
  code: SceneDetailErrorCode

  constructor(code: SceneDetailErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

function readErrorCode(status: number): SceneDetailErrorCode {
  if (status === 401) {
    return 'auth-required'
  }

  if (status === 404) {
    return 'not-found'
  }

  return 'unavailable'
}

export async function fetchSceneDetail(
  authenticatedFetch: AuthenticatedFetch,
  isAuthenticated: boolean,
  sceneId: number,
) {
  const response = isAuthenticated
    ? await authenticatedFetch(`/scenes/${sceneId}`)
    : await fetch(buildApiUrl(`/scenes/${sceneId}`))

  if (!response.ok) {
    throw new SceneDetailRequestError(
      readErrorCode(response.status),
      `Scene detail request failed with status ${response.status}.`,
    )
  }

  const payload = await response.json().catch(() => null)
  const scene = normalizeSceneDetail(payload)

  if (!scene) {
    throw new SceneDetailRequestError(
      'invalid-payload',
      'Scene detail response is missing the data required to render the player.',
    )
  }

  return scene
}

async function readSceneEngagementResponse(response: Response): Promise<SceneEngagementSummary> {
  if (!response.ok) {
    throw new SceneDetailRequestError(
      readErrorCode(response.status),
      `Scene engagement request failed with status ${response.status}.`,
    )
  }

  const payload = await response.json().catch(() => null)
  return normalizeSceneEngagement(payload)
}

export async function recordSceneView(
  authenticatedFetch: AuthenticatedFetch,
  isAuthenticated: boolean,
  sceneId: number,
) {
  const response = isAuthenticated
    ? await authenticatedFetch(`/scenes/${sceneId}/views`, { method: 'POST' })
    : await fetch(buildApiUrl(`/scenes/${sceneId}/views`), { method: 'POST' })

  return readSceneEngagementResponse(response)
}

export async function updateSceneVote(
  authenticatedFetch: AuthenticatedFetch,
  sceneId: number,
  vote: SceneVoteState,
) {
  const response = await authenticatedFetch(`/scenes/${sceneId}/vote`, {
    body: JSON.stringify({ vote }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  })

  return readSceneEngagementResponse(response)
}

export async function clearSceneVote(authenticatedFetch: AuthenticatedFetch, sceneId: number) {
  const response = await authenticatedFetch(`/scenes/${sceneId}/vote`, { method: 'DELETE' })
  return readSceneEngagementResponse(response)
}

export async function updateSceneSave(
  authenticatedFetch: AuthenticatedFetch,
  sceneId: number,
  shouldSave: boolean,
) {
  const response = await authenticatedFetch(`/scenes/${sceneId}/save`, {
    method: shouldSave ? 'POST' : 'DELETE',
  })

  return readSceneEngagementResponse(response)
}

export async function fetchRecommendedSceneGroups(
  scene: SceneDetail,
): Promise<RecommendedSceneGroups> {
  const recommendationRequests = [fetchScenes(), ...scene.tags.map((tag) => fetchScenes(tag))]
  const [allScenesResult, ...tagSceneResults] = await Promise.allSettled(recommendationRequests)

  const allScenes = allScenesResult.status === 'fulfilled' ? allScenesResult.value : []
  const tagScenesByTag = scene.tags.reduce<Record<string, typeof allScenes>>(
    (resolvedTagScenes, tag, index) => {
      const nextTagResult = tagSceneResults[index]
      resolvedTagScenes[tag] = nextTagResult?.status === 'fulfilled' ? nextTagResult.value : []
      return resolvedTagScenes
    },
    {},
  )

  return buildRecommendedSceneGroups(scene, allScenes, tagScenesByTag)
}

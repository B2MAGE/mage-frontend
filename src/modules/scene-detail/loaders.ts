import { buildApiUrl, fetchScenes } from '@lib/api'
import { normalizeRecommendedSceneList, normalizeSceneDetail } from './dto'
import { buildRecommendedSceneGroups } from './recommendations'
import type { AuthenticatedFetch, RecommendedSceneGroups, SceneDetail, SceneDetailErrorCode } from './types'

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

export async function fetchRecommendedSceneGroups(
  scene: SceneDetail,
): Promise<RecommendedSceneGroups> {
  const recommendationRequests = [fetchScenes(), ...scene.tags.map((tag) => fetchScenes(tag))]
  const [allScenesResult, ...tagSceneResults] = await Promise.allSettled(recommendationRequests)

  const allScenes =
    allScenesResult.status === 'fulfilled' ? normalizeRecommendedSceneList(allScenesResult.value) : []
  const tagScenesByTag = scene.tags.reduce<Record<string, ReturnType<typeof normalizeRecommendedSceneList>>>(
    (resolvedTagScenes, tag, index) => {
      const nextTagResult = tagSceneResults[index]
      resolvedTagScenes[tag] =
        nextTagResult?.status === 'fulfilled' ? normalizeRecommendedSceneList(nextTagResult.value) : []
      return resolvedTagScenes
    },
    {},
  )

  return buildRecommendedSceneGroups(scene, allScenes, tagScenesByTag)
}

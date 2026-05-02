import { buildApiUrl, fetchScenes } from '@shared/lib'
import {
  normalizeSceneComment,
  normalizeSceneComments,
  normalizeSceneDetail,
  normalizeSceneEngagement,
} from './dto'
import { buildRecommendedSceneGroups } from './recommendations'
import type {
  AuthenticatedFetch,
  RecommendedSceneGroups,
  SceneDetail,
  SceneDetailErrorCode,
  SceneEngagementSummary,
  SceneComment,
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

async function readSceneCommentResponse(response: Response): Promise<SceneComment> {
  if (!response.ok) {
    throw new SceneDetailRequestError(
      readErrorCode(response.status),
      `Scene comment request failed with status ${response.status}.`,
    )
  }

  const payload = await response.json().catch(() => null)
  const comment = normalizeSceneComment(payload)

  if (!comment) {
    throw new SceneDetailRequestError(
      'invalid-payload',
      'Scene comment response is missing required fields.',
    )
  }

  return comment
}

export async function fetchSceneComments(
  authenticatedFetch: AuthenticatedFetch,
  isAuthenticated: boolean,
  sceneId: number,
) {
  const response = isAuthenticated
    ? await authenticatedFetch(`/scenes/${sceneId}/comments`)
    : await fetch(buildApiUrl(`/scenes/${sceneId}/comments`))

  if (!response.ok) {
    throw new SceneDetailRequestError(
      readErrorCode(response.status),
      `Scene comments request failed with status ${response.status}.`,
    )
  }

  const payload = await response.json().catch(() => [])
  return normalizeSceneComments(payload)
}

export async function createSceneComment(
  authenticatedFetch: AuthenticatedFetch,
  sceneId: number,
  text: string,
  parentCommentId?: number | null,
) {
  const response = await authenticatedFetch(`/scenes/${sceneId}/comments`, {
    body: JSON.stringify({
      text,
      parentCommentId: parentCommentId ?? null,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  return readSceneCommentResponse(response)
}

export async function updateSceneCommentVote(
  authenticatedFetch: AuthenticatedFetch,
  sceneId: number,
  commentId: number,
  vote: SceneVoteState,
) {
  const response = await authenticatedFetch(`/scenes/${sceneId}/comments/${commentId}/vote`, {
    body: JSON.stringify({ vote }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  })

  return readSceneCommentResponse(response)
}

export async function clearSceneCommentVote(
  authenticatedFetch: AuthenticatedFetch,
  sceneId: number,
  commentId: number,
) {
  const response = await authenticatedFetch(`/scenes/${sceneId}/comments/${commentId}/vote`, {
    method: 'DELETE',
  })

  return readSceneCommentResponse(response)
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

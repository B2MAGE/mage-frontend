import { normalizeSceneList } from '@shared/lib'
import type { AuthenticatedFetch, SceneVisibility } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeCount(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0
  }

  return Math.trunc(value)
}

function countSceneComment(comment: unknown): number {
  if (!isRecord(comment)) {
    return 0
  }

  const repliesCount = Array.isArray(comment.replies)
    ? comment.replies.reduce((count, reply) => count + countSceneComment(reply), 0)
    : 0

  return 1 + Math.max(normalizeCount(comment.replyCount), repliesCount)
}

function countSceneComments(payload: unknown) {
  if (!Array.isArray(payload)) {
    return 0
  }

  return payload.reduce((count, comment) => count + countSceneComment(comment), 0)
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

export function normalizeUserScenes(
  payload: unknown,
  commentsCountBySceneId: ReadonlyMap<number, number> = new Map(),
) {
  return normalizeSceneList(payload).map((scene) => ({
    id: scene.sceneId,
    name: scene.name,
    thumbnailRef: scene.thumbnailRef,
    createdAt: scene.createdAt,
    description: scene.description ?? null,
    statusLabel: buildStatusLabel(),
    viewsCount: scene.engagement.views,
    commentsCount: commentsCountBySceneId.get(scene.sceneId) ?? 0,
    likesRatio: buildLikesRatio(scene.engagement.upvotes, scene.engagement.downvotes),
  }))
}

async function fetchSceneCommentsCount(authenticatedFetch: AuthenticatedFetch, sceneId: number) {
  const response = await authenticatedFetch(`/scenes/${sceneId}/comments`)

  if (!response.ok) {
    throw new Error(`Unable to load comment count for scene ${sceneId}.`)
  }

  return countSceneComments(await response.json().catch(() => []))
}

export async function fetchUserScenes(authenticatedFetch: AuthenticatedFetch, userId: number) {
  const response = await authenticatedFetch(`/users/${userId}/scenes`)

  if (!response.ok) {
    throw new Error('Unable to load scenes.')
  }

  const payload = (await response.json().catch(() => [])) as unknown
  const scenesWithoutCommentCounts = normalizeUserScenes(payload)
  const commentCountResults = await Promise.allSettled(
    scenesWithoutCommentCounts.map(async (scene) => [
      scene.id,
      await fetchSceneCommentsCount(authenticatedFetch, scene.id),
    ] as const),
  )
  const commentCounts = new Map<number, number>()

  commentCountResults.forEach((result) => {
    if (result.status === 'fulfilled') {
      commentCounts.set(result.value[0], result.value[1])
    }
  })

  return normalizeUserScenes(payload, commentCounts)
}

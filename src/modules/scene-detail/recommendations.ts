import { formatRelativeTime, type SceneListResponse } from '@shared/lib'
import type { RecommendationFilter, RecommendedSceneCard, RecommendedSceneGroups, SceneDetail } from './types'

function buildRecommendedViewsLabel(sceneId: number) {
  const views = 1559 + sceneId * 120
  return `${views.toLocaleString()} views`
}

function buildRecommendationAccent(sceneId: number) {
  const accents = ['#63f0d6', '#9fd9ff', '#ffb26b', '#7ef0c0', '#7f9bff']
  return accents[Math.abs(sceneId) % accents.length]
}

function buildRecommendedScenesFromList(
  scenes: SceneListResponse[],
  currentSceneId: number,
): RecommendedSceneCard[] {
  const scenesById = new Map<number, RecommendedSceneCard>()

  scenes
    .filter((scene) => scene.sceneId !== currentSceneId)
    .forEach((scene) => {
      if (scenesById.has(scene.sceneId)) {
        return
      }

      scenesById.set(scene.sceneId, {
        id: scene.sceneId,
        title: scene.name,
        creator: scene.creatorDisplayName,
        meta: `${buildRecommendedViewsLabel(scene.sceneId)} | ${formatRelativeTime(scene.createdAt)}`,
        accent: buildRecommendationAccent(scene.sceneId),
        thumbnailRef: scene.thumbnailRef,
        ownerUserId: scene.ownerUserId,
      })
    })

  return [...scenesById.values()]
}

function mergeRecommendedSceneCards(...sceneGroups: RecommendedSceneCard[][]): RecommendedSceneCard[] {
  const scenesById = new Map<number, RecommendedSceneCard>()

  sceneGroups.flat().forEach((scene) => {
    if (!scenesById.has(scene.id)) {
      scenesById.set(scene.id, scene)
    }
  })

  return [...scenesById.values()]
}

export function buildTagRecommendationFilter(tag: string): RecommendationFilter {
  return `tag:${tag}` as RecommendationFilter
}

export function readRecommendationFilterTag(filter: RecommendationFilter) {
  return filter.startsWith('tag:') ? filter.slice('tag:'.length) : null
}

export function createEmptyRecommendedSceneGroups(): RecommendedSceneGroups {
  return {
    all: [],
    creator: [],
    byTag: {},
  }
}

export function buildRecommendedSceneGroups(
  scene: SceneDetail,
  allScenes: SceneListResponse[],
  tagScenesByTag: Record<string, SceneListResponse[]>,
): RecommendedSceneGroups {
  const creatorRecommendations =
    scene.ownerUserId === null
      ? []
      : buildRecommendedScenesFromList(
          allScenes.filter((candidateScene) => candidateScene.ownerUserId === scene.ownerUserId),
          scene.id,
        )

  const recommendationsByTag = scene.tags.reduce<Record<string, RecommendedSceneCard[]>>(
    (resolvedRecommendations, tag) => {
      resolvedRecommendations[tag] = buildRecommendedScenesFromList(tagScenesByTag[tag] ?? [], scene.id)
      return resolvedRecommendations
    },
    {},
  )

  return {
    all: mergeRecommendedSceneCards(
      creatorRecommendations,
      ...scene.tags.map((tag) => recommendationsByTag[tag] ?? []),
    ),
    creator: creatorRecommendations,
    byTag: recommendationsByTag,
  }
}

export function selectRecommendedScenes(
  recommendationGroups: RecommendedSceneGroups,
  recommendationFilter: RecommendationFilter,
) {
  const activeRecommendationTag = readRecommendationFilterTag(recommendationFilter)

  if (activeRecommendationTag !== null) {
    return recommendationGroups.byTag[activeRecommendationTag] ?? []
  }

  if (recommendationFilter === 'creator') {
    return recommendationGroups.creator
  }

  return recommendationGroups.all
}

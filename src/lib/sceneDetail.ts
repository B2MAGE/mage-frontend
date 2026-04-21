import { buildApiUrl, fetchScenes, type SceneListResponse } from './api'
import type { MageSceneBlob } from '@modules/player'

export type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type SceneDetailResponse = {
  id?: number
  sceneId?: number
  ownerUserId?: number
  creatorDisplayName?: string
  name?: string
  sceneData?: unknown
  thumbnailRef?: string | null
  createdAt?: string
  tags?: unknown
}

export type SceneDetail = {
  id: number
  ownerUserId: number | null
  creatorDisplayName: string | null
  name: string
  sceneData: MageSceneBlob
  thumbnailRef: string | null
  createdAt: string | null
  tags: string[]
}

export type SceneDetailErrorCode =
  | 'auth-required'
  | 'invalid-id'
  | 'invalid-payload'
  | 'not-found'
  | 'unavailable'

export type SceneComment = {
  author: string
  handle: string
  posted: string
  text: string
  upvotes: string
  downvotes: string
}

export type CreatorProfile = {
  displayName: string
  handle: string
  subscribersLabel: string
  studioNote: string
  primaryActionLabel?: string
}

export type SceneEngagement = {
  viewsLabel: string
  upvotesLabel: string
  downvotesLabel: string
  savesLabel: string
  publishedLabel: string
  topicLabel: string
}

export type SceneDescription = {
  opening: string
  middle: string
  closing: string
  bestFor: string
  builtWith: string
  tags: string[]
}

export type RecommendedSceneCard = {
  id: number
  title: string
  creator: string
  meta: string
  accent: string
  thumbnailRef: string | null
  ownerUserId: number
}

export type RecommendedSceneGroups = {
  all: RecommendedSceneCard[]
  creator: RecommendedSceneCard[]
  byTag: Record<string, RecommendedSceneCard[]>
}

export type RecommendationFilter = 'all' | 'creator' | `tag:${string}`

const creatorProfileBlueprints = [
  {
    displayName: 'Mina Park',
    handle: '@mina.afterlight',
    subscribersLabel: '2.18K subscribers',
    studioNote: 'I usually tune motion to stay readable for the first minute before the highlights wake up.',
  },
  {
    displayName: 'Jonah Reed',
    handle: '@jonahreedsignal',
    subscribersLabel: '1.42K subscribers',
    studioNote: 'Most of my scenes start from a music-first pass, then I add texture until the frame feels alive.',
  },
  {
    displayName: 'Talia North',
    handle: '@talianorth',
    subscribersLabel: '3.84K subscribers',
    studioNote: 'I care more about pacing than density, so the quieter parts of a track still have room to breathe.',
  },
  {
    displayName: 'Elio Mercer',
    handle: '@elio.mercer',
    subscribersLabel: '986 subscribers',
    studioNote: 'If a scene looks loud with the volume off, I usually strip it back and start over.',
  },
] as const

export class SceneDetailRequestError extends Error {
  code: SceneDetailErrorCode

  constructor(code: SceneDetailErrorCode, message: string) {
    super(message)
    this.code = code
  }
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

function normalizeSceneDetail(payload: unknown): SceneDetail | null {
  if (!isRecord(payload)) {
    return null
  }

  const sceneId =
    typeof payload.sceneId === 'number'
      ? payload.sceneId
      : typeof payload.id === 'number'
        ? payload.id
        : null

  if (sceneId === null || !isRecord(payload.sceneData)) {
    return null
  }

  return {
    id: sceneId,
    ownerUserId: typeof payload.ownerUserId === 'number' ? payload.ownerUserId : null,
    creatorDisplayName:
      typeof payload.creatorDisplayName === 'string' && payload.creatorDisplayName.trim()
        ? payload.creatorDisplayName.trim()
        : null,
    name:
      typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : `Scene ${sceneId}`,
    sceneData: payload.sceneData,
    thumbnailRef:
      typeof payload.thumbnailRef === 'string' && payload.thumbnailRef.trim()
        ? payload.thumbnailRef
        : null,
    createdAt:
      typeof payload.createdAt === 'string' && payload.createdAt.trim() ? payload.createdAt : null,
    tags: normalizeSceneTags(payload.tags),
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

function formatCreatedAt(createdAt: string | null) {
  if (!createdAt) {
    return 'Unavailable'
  }

  const parsedDate = new Date(createdAt)

  if (Number.isNaN(parsedDate.getTime())) {
    return createdAt
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsedDate)
}

function formatRelativeAge(createdAt: string | null) {
  if (!createdAt) {
    return 'Recently'
  }

  const parsedDate = new Date(createdAt)

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Recently'
  }

  const diffMs = Date.now() - parsedDate.getTime()
  const minutes = Math.floor(diffMs / (1000 * 60))
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (years > 0) {
    return `${years} year${years === 1 ? '' : 's'} ago`
  }

  if (months > 0) {
    return `${months} month${months === 1 ? '' : 's'} ago`
  }

  if (weeks > 0) {
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  }

  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'} ago`
  }

  if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }

  if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }

  return 'Just now'
}

function normalizeRecommendedSceneList(payload: unknown): SceneListResponse[] {
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
        meta: `${buildRecommendedViewsLabel(scene.sceneId)} | ${formatRelativeAge(scene.createdAt)}`,
        accent: buildRecommendationAccent(scene.sceneId),
        thumbnailRef: scene.thumbnailRef,
        ownerUserId: scene.ownerUserId,
      })
    })

  return [...scenesById.values()]
}

function mergeRecommendedSceneCards(
  ...sceneGroups: RecommendedSceneCard[][]
): RecommendedSceneCard[] {
  const scenesById = new Map<number, RecommendedSceneCard>()

  sceneGroups.flat().forEach((scene) => {
    if (!scenesById.has(scene.id)) {
      scenesById.set(scene.id, scene)
    }
  })

  return [...scenesById.values()]
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

export function readInitial(value: string) {
  const trimmedValue = value.trim()

  return trimmedValue ? trimmedValue[0].toUpperCase() : 'M'
}

export function readSceneId(value: string | undefined) {
  if (!value) {
    return null
  }

  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return null
  }

  return parsedValue
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

  const payload = (await response.json().catch(() => null)) as SceneDetailResponse | null
  const scene = normalizeSceneDetail(payload)

  if (!scene) {
    throw new SceneDetailRequestError(
      'invalid-payload',
      'Scene detail response is missing the data required to render the player.',
    )
  }

  return scene
}

export async function fetchCreatorSceneList(
  authenticatedFetch: AuthenticatedFetch,
  isAuthenticated: boolean,
  ownerUserId: number | null,
) {
  if (!isAuthenticated || ownerUserId === null) {
    return []
  }

  const response = await authenticatedFetch(`/users/${ownerUserId}/scenes`)

  if (!response.ok) {
    throw new Error(`Creator scene request failed with status ${response.status}.`)
  }

  const payload = (await response.json().catch(() => [])) as unknown

  return normalizeRecommendedSceneList(payload)
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

export async function fetchRecommendedSceneGroups(
  scene: SceneDetail,
): Promise<RecommendedSceneGroups> {
  const recommendationRequests = [fetchScenes(), ...scene.tags.map((tag) => fetchScenes(tag))]
  const [allScenesResult, ...tagSceneResults] = await Promise.allSettled(recommendationRequests)

  const allScenes = allScenesResult.status === 'fulfilled' ? allScenesResult.value : []
  const tagScenesByTag = scene.tags.reduce<Record<string, SceneListResponse[]>>(
    (resolvedTagScenes, tag, index) => {
      const nextTagResult = tagSceneResults[index]
      resolvedTagScenes[tag] = nextTagResult?.status === 'fulfilled' ? nextTagResult.value : []
      return resolvedTagScenes
    },
    {},
  )

  return buildRecommendedSceneGroups(scene, allScenes, tagScenesByTag)
}

export function buildSceneEngagement(scene: SceneDetail): SceneEngagement {
  const views = 1559 + scene.id * 120
  const upvotes = 56 + scene.id * 30
  const downvotes = 8 + scene.id * 2
  const saves = 18 + scene.id * 11

  return {
    viewsLabel: `${views.toLocaleString()} views`,
    upvotesLabel: upvotes.toLocaleString(),
    downvotesLabel: downvotes.toLocaleString(),
    savesLabel: saves.toLocaleString(),
    publishedLabel: `Published ${formatCreatedAt(scene.createdAt)}`,
    topicLabel: 'Audio-reactive scene',
  }
}

function buildSubscriberLabel(seed: number) {
  const subscriberCount = 1720 + seed * 38

  if (subscriberCount >= 1000) {
    return `${(subscriberCount / 1000).toFixed(2)}K subscribers`
  }

  return `${subscriberCount} subscribers`
}

export function buildCreatorProfile(
  scene: SceneDetail,
  viewerDisplayName: string | undefined,
  viewerUserId: number | null | undefined,
): CreatorProfile {
  const resolvedDisplayName = scene.creatorDisplayName?.trim() || viewerDisplayName?.trim() || 'Your Studio'

  if (viewerUserId !== null && viewerUserId !== undefined && viewerUserId === scene.ownerUserId) {
    return {
      displayName: resolvedDisplayName,
      handle: `@${slugify(resolvedDisplayName) || 'magecreator'}`,
      subscribersLabel: buildSubscriberLabel(scene.id),
      studioNote:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
      primaryActionLabel: 'Subscribe',
    }
  }

  const blueprint =
    creatorProfileBlueprints[
      Math.abs((scene.ownerUserId ?? scene.id) % creatorProfileBlueprints.length)
    ]

  return {
    ...blueprint,
    displayName: resolvedDisplayName,
    handle: `@${slugify(resolvedDisplayName) || slugify(blueprint.displayName) || 'magecreator'}`,
    primaryActionLabel: 'Subscribe',
  }
}

export function buildSceneDescription(
  scene: SceneDetail,
  creatorProfile: CreatorProfile,
): SceneDescription {
  return {
    opening:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    middle:
      `${creatorProfile.displayName} lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
    closing:
      'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    bestFor: 'lorem ipsum, dolor sit amet, consectetur',
    builtWith: 'adipiscing elit, sed do eiusmod, tempor incididunt',
    tags: scene.tags,
  }
}

export function buildSceneComments(scene: SceneDetail): SceneComment[] {
  return [
    {
      author: 'Nora Vale',
      handle: '@noravale',
      posted: '2 days ago',
      text: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. ${scene.name} sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
      upvotes: '14',
      downvotes: '1',
    },
    {
      author: 'Cass Mercer',
      handle: '@cassmercer',
      posted: '5 days ago',
      text:
        'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
      upvotes: '9',
      downvotes: '0',
    },
    {
      author: 'Jun Park',
      handle: '@junpark',
      posted: '1 week ago',
      text:
        'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
      upvotes: '6',
      downvotes: '0',
    },
  ]
}

export function buildRecommendedScenes(
  scene: SceneDetail,
  creatorScenes: SceneListResponse[],
): RecommendedSceneCard[] {
  return buildRecommendedScenesFromList(creatorScenes, scene.id)
}

export function readErrorCopy(errorCode: SceneDetailErrorCode) {
  if (errorCode === 'invalid-id') {
    return {
      title: 'Invalid scene link',
      description: 'This route is missing a valid scene id. Check the URL and try again.',
    }
  }

  if (errorCode === 'auth-required') {
    return {
      title: 'Sign in to view this scene',
      description:
        'Scene detail requests are still authenticated in this build. Sign in, then reopen this scene route.',
    }
  }

  if (errorCode === 'not-found') {
    return {
      title: 'Scene not found',
      description: 'This scene does not exist or is no longer available.',
    }
  }

  if (errorCode === 'invalid-payload') {
    return {
      title: 'Unable to render this scene',
      description:
        'The backend returned scene detail data, but the scene payload is missing fields required by the player.',
    }
  }

  return {
    title: 'Unable to load this scene',
    description: 'MAGE could not load this scene right now. Please try again in a moment.',
  }
}

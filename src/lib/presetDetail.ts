import { buildApiUrl, fetchPresets, type PresetListResponse } from './api'
import type { MageSceneBlob } from './magePlayerAdapter'

export type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type PresetDetailResponse = {
  id?: number
  presetId?: number
  ownerUserId?: number
  creatorDisplayName?: string
  name?: string
  sceneData?: unknown
  thumbnailRef?: string | null
  createdAt?: string
  tags?: unknown
}

export type PresetDetail = {
  id: number
  ownerUserId: number | null
  creatorDisplayName: string | null
  name: string
  sceneData: MageSceneBlob
  thumbnailRef: string | null
  createdAt: string | null
  tags: string[]
}

export type PresetDetailErrorCode =
  | 'auth-required'
  | 'invalid-id'
  | 'invalid-payload'
  | 'not-found'
  | 'unavailable'

export type PresetComment = {
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

export type PresetEngagement = {
  playsLabel: string
  upvotesLabel: string
  downvotesLabel: string
  savesLabel: string
  publishedLabel: string
  topicLabel: string
}

export type PresetDescription = {
  opening: string
  middle: string
  closing: string
  bestFor: string
  builtWith: string
  tags: string[]
}

export type RecommendedPresetCard = {
  id: number
  title: string
  creator: string
  meta: string
  accent: string
  thumbnailRef: string | null
  ownerUserId: number
}

export type RecommendedPresetGroups = {
  all: RecommendedPresetCard[]
  creator: RecommendedPresetCard[]
  byTag: Record<string, RecommendedPresetCard[]>
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
    studioNote: 'Most of my presets start from a music-first pass, then I add texture until the frame feels alive.',
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
    studioNote: 'If a preset looks loud with the volume off, I usually strip it back and start over.',
  },
] as const

export class PresetDetailRequestError extends Error {
  code: PresetDetailErrorCode

  constructor(code: PresetDetailErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePresetTags(tags: unknown) {
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

function normalizePresetDetail(payload: unknown): PresetDetail | null {
  if (!isRecord(payload)) {
    return null
  }

  const presetId =
    typeof payload.presetId === 'number'
      ? payload.presetId
      : typeof payload.id === 'number'
        ? payload.id
        : null

  if (presetId === null || !isRecord(payload.sceneData)) {
    return null
  }

  return {
    id: presetId,
    ownerUserId: typeof payload.ownerUserId === 'number' ? payload.ownerUserId : null,
    creatorDisplayName:
      typeof payload.creatorDisplayName === 'string' && payload.creatorDisplayName.trim()
        ? payload.creatorDisplayName.trim()
        : null,
    name:
      typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : `Preset ${presetId}`,
    sceneData: payload.sceneData,
    thumbnailRef:
      typeof payload.thumbnailRef === 'string' && payload.thumbnailRef.trim()
        ? payload.thumbnailRef
        : null,
    createdAt:
      typeof payload.createdAt === 'string' && payload.createdAt.trim() ? payload.createdAt : null,
    tags: normalizePresetTags(payload.tags),
  }
}

function readErrorCode(status: number): PresetDetailErrorCode {
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

function normalizeRecommendedPresetList(payload: unknown): PresetListResponse[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.reduce<PresetListResponse[]>((presets, item) => {
    if (typeof item !== 'object' || item === null) {
      return presets
    }

    const candidate = item as Partial<PresetListResponse>

    if (
      typeof candidate.presetId !== 'number' ||
      typeof candidate.ownerUserId !== 'number' ||
      typeof candidate.creatorDisplayName !== 'string' ||
      typeof candidate.name !== 'string' ||
      typeof candidate.createdAt !== 'string'
    ) {
      return presets
    }

    presets.push({
      presetId: candidate.presetId,
      ownerUserId: candidate.ownerUserId,
      creatorDisplayName: candidate.creatorDisplayName.trim() || 'Unknown creator',
      name: candidate.name.trim() || `Preset ${candidate.presetId}`,
      sceneData:
        typeof candidate.sceneData === 'object' && candidate.sceneData !== null ? candidate.sceneData : {},
      thumbnailRef:
        typeof candidate.thumbnailRef === 'string' && candidate.thumbnailRef.trim()
          ? candidate.thumbnailRef
          : null,
      createdAt: candidate.createdAt,
    })

    return presets
  }, [])
}

function buildRecommendedPlaysLabel(presetId: number) {
  const plays = 1559 + presetId * 120
  return `${plays.toLocaleString()} plays`
}

function buildRecommendationAccent(presetId: number) {
  const accents = ['#63f0d6', '#9fd9ff', '#ffb26b', '#7ef0c0', '#7f9bff']
  return accents[Math.abs(presetId) % accents.length]
}

function buildRecommendedPresetsFromList(
  presets: PresetListResponse[],
  currentPresetId: number,
): RecommendedPresetCard[] {
  const presetsById = new Map<number, RecommendedPresetCard>()

  presets
    .filter((preset) => preset.presetId !== currentPresetId)
    .forEach((preset) => {
      if (presetsById.has(preset.presetId)) {
        return
      }

      presetsById.set(preset.presetId, {
        id: preset.presetId,
        title: preset.name,
        creator: preset.creatorDisplayName,
        meta: `${buildRecommendedPlaysLabel(preset.presetId)} | ${formatRelativeAge(preset.createdAt)}`,
        accent: buildRecommendationAccent(preset.presetId),
        thumbnailRef: preset.thumbnailRef,
        ownerUserId: preset.ownerUserId,
      })
    })

  return [...presetsById.values()]
}

function mergeRecommendedPresetCards(
  ...presetGroups: RecommendedPresetCard[][]
): RecommendedPresetCard[] {
  const presetsById = new Map<number, RecommendedPresetCard>()

  presetGroups.flat().forEach((preset) => {
    if (!presetsById.has(preset.id)) {
      presetsById.set(preset.id, preset)
    }
  })

  return [...presetsById.values()]
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

export function readPresetId(value: string | undefined) {
  if (!value) {
    return null
  }

  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return null
  }

  return parsedValue
}

export async function fetchPresetDetail(
  authenticatedFetch: AuthenticatedFetch,
  isAuthenticated: boolean,
  presetId: number,
) {
  const response = isAuthenticated
    ? await authenticatedFetch(`/presets/${presetId}`)
    : await fetch(buildApiUrl(`/presets/${presetId}`))

  if (!response.ok) {
    throw new PresetDetailRequestError(
      readErrorCode(response.status),
      `Preset detail request failed with status ${response.status}.`,
    )
  }

  const payload = (await response.json().catch(() => null)) as PresetDetailResponse | null
  const preset = normalizePresetDetail(payload)

  if (!preset) {
    throw new PresetDetailRequestError(
      'invalid-payload',
      'Preset detail response is missing the data required to render the player.',
    )
  }

  return preset
}

export async function fetchCreatorPresetList(
  authenticatedFetch: AuthenticatedFetch,
  isAuthenticated: boolean,
  ownerUserId: number | null,
) {
  if (!isAuthenticated || ownerUserId === null) {
    return []
  }

  const response = await authenticatedFetch(`/users/${ownerUserId}/presets`)

  if (!response.ok) {
    throw new Error(`Creator preset request failed with status ${response.status}.`)
  }

  const payload = (await response.json().catch(() => [])) as unknown

  return normalizeRecommendedPresetList(payload)
}

export function buildTagRecommendationFilter(tag: string): RecommendationFilter {
  return `tag:${tag}` as RecommendationFilter
}

export function readRecommendationFilterTag(filter: RecommendationFilter) {
  return filter.startsWith('tag:') ? filter.slice('tag:'.length) : null
}

export function createEmptyRecommendedPresetGroups(): RecommendedPresetGroups {
  return {
    all: [],
    creator: [],
    byTag: {},
  }
}

export function buildRecommendedPresetGroups(
  preset: PresetDetail,
  allPresets: PresetListResponse[],
  tagPresetsByTag: Record<string, PresetListResponse[]>,
): RecommendedPresetGroups {
  const creatorRecommendations =
    preset.ownerUserId === null
      ? []
      : buildRecommendedPresetsFromList(
          allPresets.filter((candidatePreset) => candidatePreset.ownerUserId === preset.ownerUserId),
          preset.id,
        )

  const recommendationsByTag = preset.tags.reduce<Record<string, RecommendedPresetCard[]>>(
    (resolvedRecommendations, tag) => {
      resolvedRecommendations[tag] = buildRecommendedPresetsFromList(tagPresetsByTag[tag] ?? [], preset.id)
      return resolvedRecommendations
    },
    {},
  )

  return {
    all: mergeRecommendedPresetCards(
      creatorRecommendations,
      ...preset.tags.map((tag) => recommendationsByTag[tag] ?? []),
    ),
    creator: creatorRecommendations,
    byTag: recommendationsByTag,
  }
}

export async function fetchRecommendedPresetGroups(
  preset: PresetDetail,
): Promise<RecommendedPresetGroups> {
  const recommendationRequests = [fetchPresets(), ...preset.tags.map((tag) => fetchPresets(tag))]
  const [allPresetsResult, ...tagPresetResults] = await Promise.allSettled(recommendationRequests)

  const allPresets = allPresetsResult.status === 'fulfilled' ? allPresetsResult.value : []
  const tagPresetsByTag = preset.tags.reduce<Record<string, PresetListResponse[]>>(
    (resolvedTagPresets, tag, index) => {
      const nextTagResult = tagPresetResults[index]
      resolvedTagPresets[tag] = nextTagResult?.status === 'fulfilled' ? nextTagResult.value : []
      return resolvedTagPresets
    },
    {},
  )

  return buildRecommendedPresetGroups(preset, allPresets, tagPresetsByTag)
}

export function buildPresetEngagement(preset: PresetDetail): PresetEngagement {
  const plays = 1559 + preset.id * 120
  const upvotes = 56 + preset.id * 30
  const downvotes = 8 + preset.id * 2
  const saves = 18 + preset.id * 11

  return {
    playsLabel: `${plays.toLocaleString()} plays`,
    upvotesLabel: upvotes.toLocaleString(),
    downvotesLabel: downvotes.toLocaleString(),
    savesLabel: saves.toLocaleString(),
    publishedLabel: `Published ${formatCreatedAt(preset.createdAt)}`,
    topicLabel: 'Audio-reactive preset',
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
  preset: PresetDetail,
  viewerDisplayName: string | undefined,
  viewerUserId: number | null | undefined,
): CreatorProfile {
  const resolvedDisplayName = preset.creatorDisplayName?.trim() || viewerDisplayName?.trim() || 'Your Studio'

  if (viewerUserId !== null && viewerUserId !== undefined && viewerUserId === preset.ownerUserId) {
    return {
      displayName: resolvedDisplayName,
      handle: `@${slugify(resolvedDisplayName) || 'magecreator'}`,
      subscribersLabel: buildSubscriberLabel(preset.id),
      studioNote:
        'I wanted this preset page to feel like something I would actually share, not just a lab route with a player dropped into it.',
      primaryActionLabel: 'Subscribe',
    }
  }

  const blueprint =
    creatorProfileBlueprints[
      Math.abs((preset.ownerUserId ?? preset.id) % creatorProfileBlueprints.length)
    ]

  return {
    ...blueprint,
    displayName: resolvedDisplayName,
    handle: `@${slugify(resolvedDisplayName) || slugify(blueprint.displayName) || 'magecreator'}`,
    primaryActionLabel: 'Subscribe',
  }
}

export function buildPresetDescription(
  preset: PresetDetail,
  creatorProfile: CreatorProfile,
): PresetDescription {
  return {
    opening: `I built ${preset.name} for tracks that need atmosphere without visual clutter. The motion holds back during the intro, then the reflections and bloom open up once the mids start pushing forward.`,
    middle: `${creatorProfile.displayName} tends to tune scenes for patience rather than spectacle, so this one lands best behind slower house, downtempo electronica, mellow garage, and long vocal builds where the frame needs to stay supportive instead of noisy.`,
    closing:
      'This page is still an early public pass, but the preset render above is the real scene payload. I wanted the surrounding notes, comments, and recommendations to read like a creator page someone would actually spend time on while the rest of the social features catch up.',
    bestFor: 'late-night sets, focus mixes, ambient intros',
    builtWith: 'soft bloom, layered fog, reflective passes, restrained drift',
    tags: preset.tags,
  }
}

export function buildPresetComments(preset: PresetDetail): PresetComment[] {
  return [
    {
      author: 'Nora Vale',
      handle: '@noravale',
      posted: '2 days ago',
      text: `Ran ${preset.name} behind a Rhodes sketch last night and it sat exactly where I wanted it. The slower build is what makes it feel intentional.`,
      upvotes: '14',
      downvotes: '1',
    },
    {
      author: 'Cass Mercer',
      handle: '@cassmercer',
      posted: '5 days ago',
      text: 'The restraint is the best part. Most reactive presets oversell the first beat, but this one gives the track room before the highlights start showing off.',
      upvotes: '9',
      downvotes: '0',
    },
    {
      author: 'Jun Park',
      handle: '@junpark',
      posted: '1 week ago',
      text: 'Would happily use this for an hour-long focus upload. The glassy reflections feel polished without tipping into sci-fi overload.',
      upvotes: '6',
      downvotes: '0',
    },
  ]
}

export function buildRecommendedPresets(
  preset: PresetDetail,
  creatorPresets: PresetListResponse[],
): RecommendedPresetCard[] {
  return buildRecommendedPresetsFromList(creatorPresets, preset.id)
}

export function readErrorCopy(errorCode: PresetDetailErrorCode) {
  if (errorCode === 'invalid-id') {
    return {
      title: 'Invalid preset link',
      description: 'This route is missing a valid preset id. Check the URL and try again.',
    }
  }

  if (errorCode === 'auth-required') {
    return {
      title: 'Sign in to view this preset',
      description:
        'Preset detail requests are still authenticated in this build. Sign in, then reopen this preset route.',
    }
  }

  if (errorCode === 'not-found') {
    return {
      title: 'Preset not found',
      description: 'This preset does not exist or is no longer available.',
    }
  }

  if (errorCode === 'invalid-payload') {
    return {
      title: 'Unable to render this preset',
      description:
        'The backend returned preset detail data, but the scene payload is missing fields required by the player.',
    }
  }

  return {
    title: 'Unable to load this preset',
    description: 'MAGE could not load this preset right now. Please try again in a moment.',
  }
}

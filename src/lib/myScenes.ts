export type AuthenticatedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type SceneVisibility = 'Public' | 'Private' | 'Unlisted' | 'Draft'
export type SortKey = 'updated' | 'views' | 'likes'
export type SortDirection = 'asc' | 'desc'
export type StatusFilter = 'All' | SceneVisibility

export type UserScene = {
  id: number
  name: string
  thumbnailRef: string | null
  createdAt: string | null
  description: string | null
  statusLabel: SceneVisibility
  viewsCount: number
  commentsCount: number
  likesRatio: number
}

type UserSceneResponse = {
  id?: number
  sceneId?: number
  name?: string
  thumbnailRef?: string | null
  createdAt?: string
  description?: string | null
}

type DemoSceneThumbnail = {
  background: string
  primary: string
  secondary: string
}

type DemoSceneRequest = {
  name: string
  sceneData: Record<string, unknown>
  thumbnailRef?: string
}

type DemoSceneBlueprint = Omit<DemoSceneRequest, 'thumbnailRef'> & {
  thumbnail?: DemoSceneThumbnail
}

const demoSceneBlueprints: DemoSceneBlueprint[] = [
  {
    name: 'Aurora Drift',
    sceneData: {
      visualizer: {
        shader: 'nebula',
      },
      state: {
        energy: 0.92,
        tempo: 118,
      },
    },
    thumbnail: {
      background: '#06161d',
      primary: '#63f0d6',
      secondary: '#ff7a97',
    },
  },
  {
    name: 'Signal Bloom',
    sceneData: {
      visualizer: {
        shader: 'pulse',
      },
      state: {
        energy: 0.76,
        tempo: 124,
      },
    },
  },
  {
    name: 'Glacier Echo',
    sceneData: {
      visualizer: {
        shader: 'glacier',
      },
      state: {
        energy: 0.58,
        tempo: 96,
      },
    },
    thumbnail: {
      background: '#081820',
      primary: '#7ec8ff',
      secondary: '#f7ff82',
    },
  },
  {
    name: 'Solar Thread',
    sceneData: {
      visualizer: {
        shader: 'ember',
      },
      state: {
        energy: 0.84,
        tempo: 132,
      },
    },
    thumbnail: {
      background: '#15110a',
      primary: '#ffb15a',
      secondary: '#ffd966',
    },
  },
]

const rowsPerPageOptions = [10, 20, 30] as const

function buildDemoThumbnail({ background, primary, secondary }: DemoSceneThumbnail) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'><rect width='320' height='180' fill='${background}'/><circle cx='86' cy='94' r='52' fill='${primary}'/><circle cx='244' cy='66' r='34' fill='${secondary}' fill-opacity='.88'/></svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const demoSceneRequests: DemoSceneRequest[] = demoSceneBlueprints.map(({ thumbnail, ...scene }) => ({
  ...scene,
  ...(thumbnail ? { thumbnailRef: buildDemoThumbnail(thumbnail) } : {}),
}))

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

function parseCreatedAtValue(createdAt: string | null) {
  if (!createdAt) {
    return 0
  }

  const parsedDate = new Date(createdAt)

  return Number.isNaN(parsedDate.getTime()) ? 0 : parsedDate.getTime()
}

export function formatSceneDate(createdAt: string | null) {
  if (!createdAt) {
    return 'Recently'
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

export function formatCompactCount(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`
  }

  return String(value)
}

export function buildSortSummary(sortKey: SortKey, sortDirection: SortDirection) {
  if (sortKey === 'updated') {
    return sortDirection === 'desc' ? 'Newest items first' : 'Oldest items first'
  }

  if (sortKey === 'views') {
    return sortDirection === 'desc' ? 'Highest views first' : 'Lowest views first'
  }

  return sortDirection === 'desc' ? 'Highest likes ratio first' : 'Lowest likes ratio first'
}

export function sortScenes(scenes: UserScene[], sortKey: SortKey, sortDirection: SortDirection) {
  const direction = sortDirection === 'asc' ? 1 : -1

  return [...scenes].sort((leftScene, rightScene) => {
    let leftValue = 0
    let rightValue = 0

    if (sortKey === 'updated') {
      leftValue = parseCreatedAtValue(leftScene.createdAt)
      rightValue = parseCreatedAtValue(rightScene.createdAt)
    } else if (sortKey === 'views') {
      leftValue = leftScene.viewsCount
      rightValue = rightScene.viewsCount
    } else {
      leftValue = leftScene.likesRatio
      rightValue = rightScene.likesRatio
    }

    if (leftValue === rightValue) {
      return leftScene.name.localeCompare(rightScene.name)
    }

    return (leftValue - rightValue) * direction
  })
}

export function buildSortAriaLabel(
  label: string,
  sortKey: SortKey,
  activeSortKey: SortKey,
  sortDirection: SortDirection,
) {
  if (sortKey !== activeSortKey) {
    return `Sort by ${label.toLowerCase()} descending`
  }

  return sortDirection === 'desc'
    ? `Sort by ${label.toLowerCase()} ascending`
    : `Sort by ${label.toLowerCase()} descending`
}

export function normalizeScenes(payload: unknown) {
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
      createdAt:
        typeof item.createdAt === 'string' && item.createdAt.trim() ? item.createdAt : null,
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

  return normalizeScenes(payload)
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

export const MY_SCENES_ROWS_PER_PAGE_OPTIONS = [...rowsPerPageOptions]

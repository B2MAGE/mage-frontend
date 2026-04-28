import type { SceneVisibility, SortDirection, SortKey, StatusFilter, UserScene } from './types'

const rowsPerPageOptions = [10, 20, 30] as const

function parseCreatedAtValue(createdAt: string | null) {
  if (!createdAt) {
    return 0
  }

  const parsedDate = new Date(createdAt)

  return Number.isNaN(parsedDate.getTime()) ? 0 : parsedDate.getTime()
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

export function pruneSelectedSceneIds(selectedSceneIds: number[], scenes: UserScene[]) {
  return selectedSceneIds.filter((sceneId) => scenes.some((scene) => scene.id === sceneId))
}

export function buildMyScenesBoardModel({
  pageIndex,
  rowsPerPage,
  scenes,
  selectedSceneIds,
  sortDirection,
  sortKey,
  statusFilter,
}: {
  pageIndex: number
  rowsPerPage: number
  scenes: UserScene[]
  selectedSceneIds: number[]
  sortDirection: SortDirection
  sortKey: SortKey
  statusFilter: StatusFilter
}) {
  const availableStatuses = [...new Set(scenes.map((scene) => scene.statusLabel))].sort() as SceneVisibility[]
  const visibleScenes =
    statusFilter === 'All'
      ? scenes
      : scenes.filter((scene) => scene.statusLabel === statusFilter)
  const sortedScenes = sortScenes(visibleScenes, sortKey, sortDirection)
  const sortSummary = buildSortSummary(sortKey, sortDirection)
  const totalScenes = sortedScenes.length
  const pageCount = Math.max(1, Math.ceil(Math.max(totalScenes, 1) / rowsPerPage))
  const currentPageIndex = Math.min(pageIndex, pageCount - 1)
  const pageStart = totalScenes === 0 ? 0 : currentPageIndex * rowsPerPage
  const pageEnd = Math.min(pageStart + rowsPerPage, totalScenes)
  const pagedScenes = sortedScenes.slice(pageStart, pageEnd)
  const selectedSceneIdSet = new Set(selectedSceneIds)
  const currentPageSceneIds = pagedScenes.map((scene) => scene.id)
  const allPageScenesSelected =
    currentPageSceneIds.length > 0 &&
    currentPageSceneIds.every((sceneId) => selectedSceneIdSet.has(sceneId))
  const somePageScenesSelected =
    !allPageScenesSelected &&
    currentPageSceneIds.some((sceneId) => selectedSceneIdSet.has(sceneId))

  return {
    allPageScenesSelected,
    availableStatuses,
    currentPageIndex,
    currentPageSceneIds,
    pageCount,
    pageEnd,
    pageStart,
    pagedScenes,
    selectedSceneIdSet,
    somePageScenesSelected,
    sortSummary,
    sortedScenes,
    totalScenes,
  }
}

export const MY_SCENES_ROWS_PER_PAGE_OPTIONS = [...rowsPerPageOptions]

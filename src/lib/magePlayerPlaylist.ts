import type { MageSceneBlob } from './magePlayerAdapter'

export type MagePlayerPlaylistTrack = {
  album?: string
  artist?: string
  duration: number | null
  id: string
  name: string
  sourcePath: string
  sourceType: 'device' | 'scene'
  title?: string
}

function readTrimmedMetadataValue(value: string | undefined) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()
  return trimmedValue ? trimmedValue : null
}

function readAudioSource(sceneBlob: MageSceneBlob | null | undefined) {
  if (!sceneBlob) {
    return null
  }

  const audioPath = sceneBlob.audioPath

  if (typeof audioPath === 'string' && audioPath.trim()) {
    return audioPath.trim()
  }

  const audio = sceneBlob.audio

  if (typeof audio === 'string' && audio.trim()) {
    return audio.trim()
  }

  if (audio && typeof audio === 'object') {
    const audioRecord = audio as Record<string, unknown>
    const audioSource = audioRecord.path ?? audioRecord.url

    if (typeof audioSource === 'string' && audioSource.trim()) {
      return audioSource.trim()
    }
  }

  return null
}

export function formatPlaylistTrackName(sourcePath: string) {
  const [normalizedPath] = sourcePath.split(/[?#]/, 1)
  const pathSegments = normalizedPath.split(/[\\/]/).filter(Boolean)

  return pathSegments.at(-1) ?? sourcePath
}

export function readPlaylistTrackDisplayName(track: MagePlayerPlaylistTrack) {
  const title = readTrimmedMetadataValue(track.title)

  return title ?? track.name
}

export function readPlaylistTrackSummaryName(track: MagePlayerPlaylistTrack) {
  const title = readTrimmedMetadataValue(track.title)
  const artist = readTrimmedMetadataValue(track.artist)

  if (title && artist) {
    return `${artist} - ${title}`
  }

  return title ?? track.name
}

export function readPlaylistTrackMetaLine(track: MagePlayerPlaylistTrack) {
  const artist = readTrimmedMetadataValue(track.artist)
  const album = readTrimmedMetadataValue(track.album)

  if (artist && album) {
    return `${artist} · ${album}`
  }

  return artist ?? album
}

export function mergePlaylistTrackCollections(
  baseTracks: MagePlayerPlaylistTrack[],
  nextTracks: MagePlayerPlaylistTrack[],
) {
  if (baseTracks.length === 0) {
    return nextTracks
  }

  const nextTracksById = new Map(nextTracks.map((track) => [track.id, track]))
  const baseTrackIds = new Set(baseTracks.map((track) => track.id))
  const mergedTracks: MagePlayerPlaylistTrack[] = []

  baseTracks.forEach((track) => {
    const nextTrack = nextTracksById.get(track.id)

    if (nextTrack) {
      mergedTracks.push(nextTrack)
    }
  })

  nextTracks.forEach((track) => {
    if (!baseTrackIds.has(track.id)) {
      mergedTracks.push(track)
    }
  })

  return mergedTracks
}

export function shufflePlaylistTracks(
  tracks: MagePlayerPlaylistTrack[],
  anchoredTrackId: string | null,
  randomFn: () => number = Math.random,
) {
  if (tracks.length <= 1) {
    return [...tracks]
  }

  const anchoredTrackIndex =
    anchoredTrackId === null ? -1 : tracks.findIndex((track) => track.id === anchoredTrackId)
  const anchoredTrack = anchoredTrackIndex >= 0 ? tracks[anchoredTrackIndex] : null
  const remainingTracks = anchoredTrack
    ? tracks.filter((track) => track.id !== anchoredTrack.id)
    : [...tracks]

  for (let currentIndex = remainingTracks.length - 1; currentIndex > 0; currentIndex -= 1) {
    const swapIndex = Math.floor(randomFn() * (currentIndex + 1))
    const nextTrack = remainingTracks[currentIndex]
    remainingTracks[currentIndex] = remainingTracks[swapIndex]
    remainingTracks[swapIndex] = nextTrack
  }

  return anchoredTrack ? [anchoredTrack, ...remainingTracks] : remainingTracks
}

export function buildScenePlaylistTrack(
  sceneBlob: MageSceneBlob | null | undefined,
): MagePlayerPlaylistTrack | null {
  const sourcePath = readAudioSource(sceneBlob)

  if (!sourcePath) {
    return null
  }

  return {
    duration: null,
    id: `scene:${sourcePath}`,
    name: formatPlaylistTrackName(sourcePath),
    sourcePath,
    sourceType: 'scene',
  }
}

export function revokePlaylistTrackSource(track: MagePlayerPlaylistTrack) {
  if (track.sourceType === 'device' && track.sourcePath.startsWith('blob:')) {
    URL.revokeObjectURL(track.sourcePath)
  }
}

export function revokePlaylistTrackSources(tracks: MagePlayerPlaylistTrack[]) {
  tracks.forEach(revokePlaylistTrackSource)
}

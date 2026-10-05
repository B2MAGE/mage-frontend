import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildScenePlaylistTrack,
  mergePlaylistTrackCollections,
  revokePlaylistTrackSource,
  shufflePlaylistTracks,
  scenePlaybackIdentity,
  type MageSceneKey,
  type MagePlayerPlaylistTrack,
  type MageSceneBlob,
} from '@modules/player'

function releaseRemovedSources(previous: MagePlayerPlaylistTrack[], next: MagePlayerPlaylistTrack[]) {
  const retained = new Set(next.map(track => track.sourcePath))
  const released = new Set<string>()
  for (const track of previous) {
    if (track.sourceType === 'device' && track.sourcePath.startsWith('blob:')
      && !retained.has(track.sourcePath) && !released.has(track.sourcePath)) {
      revokePlaylistTrackSource(track)
      released.add(track.sourcePath)
    }
  }
}

export function useScenePlaylistState(sceneBlob: MageSceneBlob | null | undefined, sceneKey?: MageSceneKey) {
  const [playlistTracks, setPlaylistTracks] = useState<MagePlayerPlaylistTrack[]>([])
  const [playlistName, setPlaylistName] = useState('Playlist')
  const [selectedTrackId, updateSelectedTrackId] = useState<string | null>(null)
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false)
  const [isRepeatEnabled, setIsRepeatEnabled] = useState(false)
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false)
  const basePlaylistTracksRef = useRef<MagePlayerPlaylistTrack[]>([])
  const playlistTracksRef = useRef<MagePlayerPlaylistTrack[]>([])
  const selectedTrackIdRef = useRef<string | null>(null)
  const shuffleRef = useRef(false)
  const repeatRef = useRef(false)
  const initializationGeneration = useRef(0)
  const previousSceneIdentity = useRef<string | MageSceneBlob | null | undefined>(undefined)
  const playbackIdentity = scenePlaybackIdentity(sceneBlob, sceneKey)
  // Legacy documents with stored audio can fail the renderer's structural
  // validation. A route key still distinguishes their viewing sessions.
  const initializationIdentity = playbackIdentity ?? (sceneKey === undefined ? sceneBlob : `scene:${typeof sceneKey}:${sceneKey}`)

  const replaceTracks = useCallback((base: MagePlayerPlaylistTrack[], ordered: MagePlayerPlaylistTrack[]) => {
    const previous = basePlaylistTracksRef.current
    // Retire ownership synchronously, before React renders or cleanup runs.
    basePlaylistTracksRef.current = base
    playlistTracksRef.current = ordered
    releaseRemovedSources(previous, base)
    setPlaylistTracks(ordered)
  }, [])

  const setSelectedTrackId = useCallback((id: string | null) => {
    const nextId = playlistTracksRef.current.some(track => track.id === id) ? id : null
    selectedTrackIdRef.current = nextId
    updateSelectedTrackId(nextId)
  }, [])

  useEffect(() => {
    return () => {
      const owned = basePlaylistTracksRef.current
      basePlaylistTracksRef.current = []
      playlistTracksRef.current = []
      releaseRemovedSources(owned, [])
    }
  }, [])

  useEffect(() => {
    if (previousSceneIdentity.current === initializationIdentity) return
    const sceneTrack = buildScenePlaylistTrack(sceneBlob)
    const nextTracks = sceneTrack ? [sceneTrack] : []
    let isCancelled = false
    const generation = ++initializationGeneration.current

    queueMicrotask(() => {
      if (isCancelled || generation !== initializationGeneration.current) {
        return
      }
      previousSceneIdentity.current = initializationIdentity

      replaceTracks(nextTracks, nextTracks)
      setSelectedTrackId(sceneTrack?.id ?? null)
      setPlaylistName('Playlist')
      setIsPlaylistOpen(false)
      setIsRepeatEnabled(false)
      setIsShuffleEnabled(false)
      repeatRef.current = false
      shuffleRef.current = false
    })

    return () => {
      isCancelled = true
    }
  }, [initializationIdentity, sceneBlob, replaceTracks, setSelectedTrackId])

  function handleClearMusic() {
    initializationGeneration.current++
    previousSceneIdentity.current = initializationIdentity
    replaceTracks([], [])
    setSelectedTrackId(null)
    repeatRef.current = false
    shuffleRef.current = false
    setIsRepeatEnabled(false)
    setIsShuffleEnabled(false)
    setIsPlaylistOpen(false)
  }

  function handlePlaylistChange(nextTracks: MagePlayerPlaylistTrack[]) {
    if (nextTracks.length === 0) { handleClearMusic(); return }
    initializationGeneration.current++
    previousSceneIdentity.current = initializationIdentity
    replaceTracks(mergePlaylistTrackCollections(basePlaylistTracksRef.current, nextTracks), nextTracks)
    if (selectedTrackIdRef.current && !nextTracks.some(track => track.id === selectedTrackIdRef.current)) setSelectedTrackId(null)
  }

  function handleTrackDurationChange(trackId: string, duration: number) {
    replaceTracks(
      basePlaylistTracksRef.current.map(track => track.id === trackId ? { ...track, duration } : track),
      playlistTracksRef.current.map(track => track.id === trackId ? { ...track, duration } : track),
    )
  }

  function handleReorderTracks(nextTracks: MagePlayerPlaylistTrack[]) {
    // A drag completion from a now-closed playlist cannot restore cleared music.
    const currentById = new Map(playlistTracksRef.current.map(track => [track.id, track]))
    const ordered = nextTracks.flatMap(track => currentById.has(track.id) ? [currentById.get(track.id)!] : [])
    if (ordered.length !== currentById.size || new Set(ordered.map(track => track.id)).size !== currentById.size) return
    replaceTracks(shuffleRef.current ? basePlaylistTracksRef.current : ordered, ordered)
  }

  function handleUpdateTrack(
    trackId: string,
    nextDetails: Partial<Pick<MagePlayerPlaylistTrack, 'album' | 'artist' | 'title'>>,
  ) {
    replaceTracks(
      basePlaylistTracksRef.current.map(track => track.id === trackId ? { ...track, ...nextDetails } : track),
      playlistTracksRef.current.map(track => track.id === trackId ? { ...track, ...nextDetails } : track),
    )
  }

  function handleRemoveTrack(trackId: string) {
    const currentTracks = playlistTracksRef.current
    const nextTracks = currentTracks.filter(track => track.id !== trackId)
    const removedTrackIndex = currentTracks.findIndex(track => track.id === trackId)
    const wasSelected = selectedTrackIdRef.current === trackId
    if (nextTracks.length === 0) { handleClearMusic(); return }
    replaceTracks(basePlaylistTracksRef.current.filter(track => track.id !== trackId), nextTracks)
    if (wasSelected) {
      const nextSelectedTrack = nextTracks[removedTrackIndex] ?? nextTracks[Math.max(removedTrackIndex - 1, 0)] ?? null
      setSelectedTrackId(nextSelectedTrack?.id ?? null)
    }
  }

  function toggleRepeat() {
    repeatRef.current = playlistTracksRef.current.length > 0 && !repeatRef.current
    setIsRepeatEnabled(repeatRef.current)
  }

  function toggleShuffle() {
    shuffleRef.current = basePlaylistTracksRef.current.length > 0 && !shuffleRef.current
    const base = basePlaylistTracksRef.current
    replaceTracks(base, shuffleRef.current ? shufflePlaylistTracks(base, selectedTrackIdRef.current) : base)
    setIsShuffleEnabled(shuffleRef.current)
  }

  return {
    handleClearMusic,
    handlePlaylistChange,
    handleRemoveTrack,
    handleReorderTracks,
    handleTrackDurationChange,
    handleUpdateTrack,
    isPlaylistOpen,
    isRepeatEnabled,
    isShuffleEnabled,
    playlistName,
    playlistTracks,
    selectedTrackId,
    setIsPlaylistOpen,
    setPlaylistName,
    setSelectedTrackId,
    toggleRepeat,
    toggleShuffle,
  }
}

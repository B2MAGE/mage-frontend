import { useEffect, useRef, useState } from 'react'
import {
  buildScenePlaylistTrack,
  mergePlaylistTrackCollections,
  revokePlaylistTrackSource,
  revokePlaylistTrackSources,
  shufflePlaylistTracks,
  type MagePlayerPlaylistTrack,
} from '@lib/magePlayerPlaylist'
import type { MageSceneBlob } from '@lib/magePlayerAdapter'

export function useScenePlaylistState(sceneBlob: MageSceneBlob | null | undefined) {
  const [basePlaylistTracks, setBasePlaylistTracks] = useState<MagePlayerPlaylistTrack[]>([])
  const [playlistTracks, setPlaylistTracks] = useState<MagePlayerPlaylistTrack[]>([])
  const [playlistName, setPlaylistName] = useState('Playlist')
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false)
  const [isRepeatEnabled, setIsRepeatEnabled] = useState(false)
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false)
  const basePlaylistTracksRef = useRef<MagePlayerPlaylistTrack[]>([])

  useEffect(() => {
    basePlaylistTracksRef.current = basePlaylistTracks
  }, [basePlaylistTracks])

  useEffect(() => {
    return () => {
      revokePlaylistTrackSources(basePlaylistTracksRef.current)
    }
  }, [])

  useEffect(() => {
    const sceneTrack = buildScenePlaylistTrack(sceneBlob)
    const nextTracks = sceneTrack ? [sceneTrack] : []

    setBasePlaylistTracks((currentTracks) => {
      revokePlaylistTrackSources(currentTracks)
      return nextTracks
    })
    setPlaylistTracks(nextTracks)
    setSelectedTrackId(sceneTrack?.id ?? null)
    setPlaylistName('Playlist')
    setIsPlaylistOpen(false)
    setIsRepeatEnabled(false)
    setIsShuffleEnabled(false)
  }, [sceneBlob])

  function handlePlaylistChange(nextTracks: MagePlayerPlaylistTrack[]) {
    setBasePlaylistTracks((currentBaseTracks) => mergePlaylistTrackCollections(currentBaseTracks, nextTracks))
    setPlaylistTracks((currentTracks) => {
      const retainedTrackIds = new Set(nextTracks.map((track) => track.id))

      currentTracks.forEach((track) => {
        if (!retainedTrackIds.has(track.id)) {
          revokePlaylistTrackSource(track)
        }
      })

      return nextTracks
    })
  }

  function handleTrackDurationChange(trackId: string, duration: number) {
    setBasePlaylistTracks((currentTracks) =>
      currentTracks.map((track) => (track.id === trackId ? { ...track, duration } : track)),
    )
    setPlaylistTracks((currentTracks) =>
      currentTracks.map((track) => (track.id === trackId ? { ...track, duration } : track)),
    )
  }

  function handleReorderTracks(nextTracks: MagePlayerPlaylistTrack[]) {
    if (!isShuffleEnabled) {
      setBasePlaylistTracks(nextTracks)
    }

    setPlaylistTracks(nextTracks)
  }

  function handleUpdateTrack(
    trackId: string,
    nextDetails: Partial<Pick<MagePlayerPlaylistTrack, 'album' | 'artist' | 'title'>>,
  ) {
    setBasePlaylistTracks((currentTracks) =>
      currentTracks.map((track) => (track.id === trackId ? { ...track, ...nextDetails } : track)),
    )
    setPlaylistTracks((currentTracks) =>
      currentTracks.map((track) => (track.id === trackId ? { ...track, ...nextDetails } : track)),
    )
  }

  function handleRemoveTrack(trackId: string) {
    setBasePlaylistTracks((currentTracks) => currentTracks.filter((track) => track.id !== trackId))
    setPlaylistTracks((currentTracks) => {
      const nextTracks = currentTracks.filter((track) => track.id !== trackId)
      const removedTrack = currentTracks.find((track) => track.id === trackId)
      const removedTrackIndex = currentTracks.findIndex((track) => track.id === trackId)

      if (removedTrack) {
        revokePlaylistTrackSource(removedTrack)
      }

      if (selectedTrackId === trackId) {
        const nextSelectedTrack =
          nextTracks[removedTrackIndex] ?? nextTracks[Math.max(removedTrackIndex - 1, 0)] ?? null
        setSelectedTrackId(nextSelectedTrack?.id ?? null)
      }

      if (nextTracks.length === 0) {
        setIsPlaylistOpen(false)
      }

      return nextTracks
    })
  }

  function toggleRepeat() {
    setIsRepeatEnabled((currentValue) => !currentValue)
  }

  function toggleShuffle() {
    setIsShuffleEnabled((currentValue) => {
      const nextValue = !currentValue

      setPlaylistTracks(() =>
        nextValue ? shufflePlaylistTracks(basePlaylistTracks, selectedTrackId) : basePlaylistTracks,
      )

      return nextValue
    })
  }

  return {
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

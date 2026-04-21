import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildScenePlaylistTrack,
  revokePlaylistTrackSources,
  type MagePlayerPlaylistTrack,
} from '@lib/magePlayerPlaylist'
import type { MageSceneBlob } from '@lib/magePlayerAdapter'

type UseMagePlayerPlaylistArgs = {
  onPlaylistChange?: (tracks: MagePlayerPlaylistTrack[]) => void
  onSelectedTrackChange?: (trackId: string | null) => void
  onTrackDurationChange?: (trackId: string, duration: number) => void
  playlistTracks?: MagePlayerPlaylistTrack[]
  sceneBlob: MageSceneBlob | null | undefined
  selectedTrackId?: string | null
}

export function useMagePlayerPlaylist({
  onPlaylistChange,
  onSelectedTrackChange,
  onTrackDurationChange,
  playlistTracks,
  sceneBlob,
  selectedTrackId,
}: UseMagePlayerPlaylistArgs) {
  const isPlaylistControlled = playlistTracks !== undefined
  const isSelectionControlled = selectedTrackId !== undefined
  const [internalPlaylistTracks, setInternalPlaylistTracks] = useState<MagePlayerPlaylistTrack[]>(() => {
    const sceneTrack = buildScenePlaylistTrack(sceneBlob)
    return sceneTrack ? [sceneTrack] : []
  })
  const [internalSelectedTrackId, setInternalSelectedTrackId] = useState<string | null>(() => {
    const sceneTrack = buildScenePlaylistTrack(sceneBlob)
    return sceneTrack?.id ?? null
  })
  const internalPlaylistTracksRef = useRef<MagePlayerPlaylistTrack[]>(internalPlaylistTracks)

  const tracks = playlistTracks ?? internalPlaylistTracks
  const activeSelectedTrackId = selectedTrackId ?? internalSelectedTrackId
  const currentTrack = tracks.find((track) => track.id === activeSelectedTrackId) ?? null
  const currentTrackIndex = currentTrack ? tracks.findIndex((track) => track.id === currentTrack.id) + 1 : 0

  const commitPlaylistTracks = useCallback((nextTracks: MagePlayerPlaylistTrack[]) => {
    if (!isPlaylistControlled) {
      setInternalPlaylistTracks(nextTracks)
    }

    onPlaylistChange?.(nextTracks)
  }, [isPlaylistControlled, onPlaylistChange])

  const commitSelectedTrackId = useCallback((nextTrackId: string | null) => {
    if (!isSelectionControlled) {
      setInternalSelectedTrackId(nextTrackId)
    }

    onSelectedTrackChange?.(nextTrackId)
  }, [isSelectionControlled, onSelectedTrackChange])

  const commitTrackDuration = useCallback((trackId: string, duration: number) => {
    if (!Number.isFinite(duration) || duration <= 0) {
      return
    }

    if (!isPlaylistControlled) {
      setInternalPlaylistTracks((currentTracks) =>
        currentTracks.map((track) => (track.id === trackId ? { ...track, duration } : track)),
      )
    }

    onTrackDurationChange?.(trackId, duration)
  }, [isPlaylistControlled, onTrackDurationChange])

  useEffect(() => {
    internalPlaylistTracksRef.current = internalPlaylistTracks
  }, [internalPlaylistTracks])

  useEffect(() => {
    return () => {
      revokePlaylistTrackSources(internalPlaylistTracksRef.current)
    }
  }, [])

  useEffect(() => {
    if (isPlaylistControlled) {
      return
    }

    setInternalPlaylistTracks((currentTracks) => {
      revokePlaylistTrackSources(currentTracks)

      const sceneTrack = buildScenePlaylistTrack(sceneBlob)
      return sceneTrack ? [sceneTrack] : []
    })

    setInternalSelectedTrackId(() => {
      const sceneTrack = buildScenePlaylistTrack(sceneBlob)
      return sceneTrack?.id ?? null
    })
  }, [isPlaylistControlled, sceneBlob])

  useEffect(() => {
    if (isPlaylistControlled || !sceneBlob || tracks.length > 0) {
      return
    }

    const sceneTrack = buildScenePlaylistTrack(sceneBlob)

    if (!sceneTrack) {
      return
    }

    commitPlaylistTracks([sceneTrack])
    commitSelectedTrackId(sceneTrack.id)
  }, [isPlaylistControlled, sceneBlob, tracks.length])

  useEffect(() => {
    if (tracks.length === 0) {
      if (activeSelectedTrackId !== null) {
        commitSelectedTrackId(null)
      }

      return
    }

    if (!currentTrack) {
      commitSelectedTrackId(tracks[0].id)
    }
  }, [activeSelectedTrackId, currentTrack, tracks])

  return {
    activeSelectedTrackId,
    commitPlaylistTracks,
    commitSelectedTrackId,
    commitTrackDuration,
    currentTrack,
    currentTrackIndex,
    tracks,
  }
}

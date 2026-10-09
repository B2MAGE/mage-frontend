import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildScenePlaylistTrack,
  revokePlaylistTrackSources,
  type MagePlayerPlaylistTrack,
} from './playlist'
import type { MageSceneBlob } from './infrastructure/engineAdapter'
import { scenePlaybackIdentity, type MageSceneKey } from './scenePlaybackIdentity'

type UseMagePlayerPlaylistArgs = {
  audioMode?: 'single' | 'playlist'
  onPlaylistChange?: (tracks: MagePlayerPlaylistTrack[]) => void
  onSelectedTrackChange?: (trackId: string | null) => void
  onTrackDurationChange?: (trackId: string, duration: number) => void
  playlistTracks?: MagePlayerPlaylistTrack[]
  sceneBlob: MageSceneBlob | null | undefined
  sceneKey?: MageSceneKey
  selectedTrackId?: string | null
}

export function useMagePlayerPlaylist({
  audioMode = 'playlist',
  onPlaylistChange,
  onSelectedTrackChange,
  onTrackDurationChange,
  playlistTracks,
  sceneBlob,
  sceneKey,
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
  const previousSceneIdentity = useRef<string | null | undefined>(undefined)
  const previousSceneKey = useRef(sceneKey)
  const playbackIdentity = scenePlaybackIdentity(sceneBlob, sceneKey)
  const clearedScene = useRef<{ key: MageSceneKey | undefined; identity: string | null } | null>(null)

  const activeSelectedTrackId = selectedTrackId !== undefined ? selectedTrackId : internalSelectedTrackId
  const suppliedTracks = playlistTracks ?? internalPlaylistTracks
  const tracks = useMemo(() => {
    if (audioMode !== 'single' || suppliedTracks.length <= 1) return suppliedTracks
    return [suppliedTracks.find(track => track.id === activeSelectedTrackId) ?? suppliedTracks[0]]
  }, [activeSelectedTrackId, audioMode, suppliedTracks])
  const currentTrack = tracks.find((track) => track.id === activeSelectedTrackId) ?? null
  const currentTrackIndex = currentTrack ? tracks.findIndex((track) => track.id === currentTrack.id) + 1 : 0

  const commitPlaylistTracks = useCallback((nextTracks: MagePlayerPlaylistTrack[]) => {
    if (audioMode === 'single') nextTracks = nextTracks.slice(0, 1)
    if (!isPlaylistControlled) {
      const retainedSources = new Set(nextTracks.map(track => track.sourcePath))
      revokePlaylistTrackSources(internalPlaylistTracksRef.current.filter(track => !retainedSources.has(track.sourcePath)))
      internalPlaylistTracksRef.current = nextTracks
      setInternalPlaylistTracks(nextTracks)
    }

    onPlaylistChange?.(nextTracks)
  }, [audioMode, isPlaylistControlled, onPlaylistChange])

  const commitSelectedTrackId = useCallback((nextTrackId: string | null) => {
    if (!isSelectionControlled) {
      setInternalSelectedTrackId(nextTrackId)
    }

    onSelectedTrackChange?.(nextTrackId)
  }, [isSelectionControlled, onSelectedTrackChange])

  const clear = useCallback(() => {
    clearedScene.current = { key: sceneKey, identity: playbackIdentity }
    commitPlaylistTracks([])
    commitSelectedTrackId(null)
  }, [commitPlaylistTracks, commitSelectedTrackId, playbackIdentity, sceneKey])

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
    let cancelled = false
    if (audioMode === 'single' && !isPlaylistControlled && internalPlaylistTracks.length > 1) {
      queueMicrotask(() => { if (!cancelled) commitPlaylistTracks(tracks) })
    }
    return () => { cancelled = true }
  }, [audioMode, commitPlaylistTracks, internalPlaylistTracks.length, isPlaylistControlled, tracks])

  useEffect(() => {
    return () => {
      revokePlaylistTrackSources(internalPlaylistTracksRef.current)
    }
  }, [])

  useEffect(() => {
    if (isPlaylistControlled) {
      return
    }
    const isClearedScene = () => clearedScene.current !== null && (sceneKey !== undefined
      ? clearedScene.current.key === sceneKey : clearedScene.current.identity === playbackIdentity)
    if (isClearedScene()) return
    clearedScene.current = null
    if (playbackIdentity !== null && previousSceneIdentity.current === playbackIdentity) return
    // Local music belongs to this viewing/editor session, not a shader revision.
    if (previousSceneIdentity.current !== undefined && previousSceneKey.current === sceneKey
      && sceneBlob && internalPlaylistTracksRef.current.some(track => track.sourceType === 'device')) {
      previousSceneIdentity.current = playbackIdentity
      return
    }

    let isCancelled = false
    const sceneTrack = buildScenePlaylistTrack(sceneBlob)
    const nextSelectedTrackId = sceneTrack?.id ?? null

    queueMicrotask(() => {
      if (isCancelled || isClearedScene()) {
        return
      }
      previousSceneIdentity.current = playbackIdentity
      previousSceneKey.current = sceneKey

      revokePlaylistTrackSources(internalPlaylistTracksRef.current)
      internalPlaylistTracksRef.current = sceneTrack ? [sceneTrack] : []
      setInternalPlaylistTracks(internalPlaylistTracksRef.current)
      setInternalSelectedTrackId(nextSelectedTrackId)
    })

    return () => {
      isCancelled = true
    }
  }, [isPlaylistControlled, playbackIdentity, sceneBlob, sceneKey])

  useEffect(() => {
    let isCancelled = false

    if (tracks.length === 0) {
      if (activeSelectedTrackId !== null) {
        queueMicrotask(() => {
          if (!isCancelled) {
            commitSelectedTrackId(null)
          }
        })
      }

      return () => {
        isCancelled = true
      }
    }

    if (!currentTrack) {
      queueMicrotask(() => {
        if (!isCancelled) {
          commitSelectedTrackId(tracks[0].id)
        }
      })
    }

    return () => {
      isCancelled = true
    }
  }, [activeSelectedTrackId, commitSelectedTrackId, currentTrack, tracks])

  return {
    clear,
    commitPlaylistTracks,
    commitSelectedTrackId,
    commitTrackDuration,
    currentTrack,
    currentTrackIndex,
    tracks,
  }
}

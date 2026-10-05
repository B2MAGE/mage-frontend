import { useCallback, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { createPlaylistTrackId, readAudioFileDuration, readMagePlayerErrorMessage } from './magePlayerUtils'
import type { useMagePlayerPlaylist } from './useMagePlayerPlaylist'
import type { MagePlayerPlaylistTrack } from './playlist'

export type SingleSongCandidate = { track: MagePlayerPlaylistTrack; signal: AbortSignal }
type Selection = { cancelled: boolean; sourcePaths: string[]; abort: AbortController; candidate?: SingleSongCandidate }
type PickerRequest = { cancelled: boolean; sceneIdentity: string | null }
type Args = {
  inputRef: RefObject<HTMLInputElement | null>
  playlist: ReturnType<typeof useMagePlayerPlaylist>
  sceneIdentity: string | null
  audioMode?: 'single' | 'playlist'
  onRequestPlaylistOpen?: () => void
}

/** File picking belongs to the viewing session, not a replaceable WebGL renderer. */
export function useMagePlayerAudioSelection({ inputRef, playlist, sceneIdentity, audioMode = 'playlist', onRequestPlaylistOpen }: Args) {
  const latest = useRef({ playlist, onRequestPlaylistOpen })
  const pending = useRef(new Set<Selection>())
  const pickerRequest = useRef<PickerRequest | null>(null)
  const [state, setState] = useState({ sceneIdentity, adding: false, error: null as string | null })
  const [candidate, setCandidate] = useState<SingleSongCandidate | null>(null)

  const cancelPending = useCallback(() => {
    for (const selection of pending.current) {
      selection.cancelled = true
      selection.abort.abort()
      selection.sourcePaths.forEach(source => URL.revokeObjectURL(source))
      selection.sourcePaths = []
    }
    pending.current.clear()
    setCandidate(null)
    setState(current => ({ ...current, adding: false }))
  }, [])

  const settleCandidate = useCallback((value: SingleSongCandidate, result: { ok: true; duration: number } | { ok: false; error: unknown }) => {
    const selection = [...pending.current].find(item => item.candidate === value)
    if (!selection || selection.cancelled || value.signal.aborted) return
    pending.current.delete(selection)
    if (!result.ok) {
      selection.abort.abort()
      selection.sourcePaths.forEach(source => URL.revokeObjectURL(source))
    } else {
      const track = { ...value.track, duration: result.duration }
      latest.current.playlist.commitPlaylistTracks([track])
      latest.current.playlist.commitSelectedTrackId(track.id)
    }
    selection.sourcePaths = []
    setCandidate(null)
    setState(current => ({ ...current, adding: false, error: result.ok ? null : `This song could not be loaded. ${readMagePlayerErrorMessage(result.error)}` }))
  }, [])
  const accept = useCallback((value: SingleSongCandidate, duration: number) => settleCandidate(value, { ok: true, duration }), [settleCandidate])
  const reject = useCallback((value: SingleSongCandidate, error: unknown) => settleCandidate(value, { ok: false, error }), [settleCandidate])

  useEffect(() => { latest.current = { playlist, onRequestPlaylistOpen } }, [playlist, onRequestPlaylistOpen])
  useEffect(() => {
    return () => {
      // A native dialog may return after this mounted player changes scenes.
      // Keep its cancellation even if the user navigates back before it closes.
      if (pickerRequest.current?.sceneIdentity === sceneIdentity) pickerRequest.current.cancelled = true
      cancelPending()
    }
  }, [audioMode, cancelPending, sceneIdentity])

  function open() {
    const input = inputRef.current
    if (!input) return
    pickerRequest.current = { cancelled: false, sceneIdentity }
    setState({ sceneIdentity, adding: pending.current.size > 0, error: null })
    input.value = ''
    input.click()
  }

  async function select(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const request = pickerRequest.current
    pickerRequest.current = null
    if (request && (request.cancelled || request.sceneIdentity !== sceneIdentity)) {
      input.value = ''
      return
    }
    const files = Array.from(input.files ?? [])
    if (!files.length) return
    if (audioMode === 'single') {
      cancelPending()
      if (files.length !== 1) {
        input.value = ''
        setState({ sceneIdentity, adding: false, error: 'Choose one song at a time. Your current song has not changed.' })
        return
      }
    }
    const selection: Selection = { cancelled: false, sourcePaths: [], abort: new AbortController() }
    pending.current.add(selection)
    setState({ sceneIdentity, adding: true, error: null })
    try {
      if (audioMode === 'single') {
        const file = files[0]
        const sourcePath = URL.createObjectURL(file)
        selection.sourcePaths.push(sourcePath)
        // Metadata alone does not prove a file can be decoded. Keep the usable
        // song until the ready player loads this candidate successfully.
        selection.candidate = {
          track: { duration: null, id: createPlaylistTrackId(), name: file.name, sourcePath, sourceType: 'device' },
          signal: selection.abort.signal,
        }
        setCandidate(selection.candidate)
        return
      }
      const tracks = await Promise.all(files.map(async file => {
        const sourcePath = URL.createObjectURL(file)
        selection.sourcePaths.push(sourcePath)
        return {
          duration: await readAudioFileDuration(sourcePath),
          id: createPlaylistTrackId(), name: file.name, sourcePath, sourceType: 'device' as const,
        }
      }))
      if (selection.cancelled) return
      // A focus recheck, playlist edit, or another completed selection may have
      // updated the session while metadata loaded. Append to its current list.
      const current = latest.current
      current.playlist.commitPlaylistTracks([...current.playlist.tracks, ...tracks])
      if (!current.playlist.currentTrack && tracks[0]) current.playlist.commitSelectedTrackId(tracks[0].id)
      selection.sourcePaths = [] // The playlist now owns these object URLs.
      current.onRequestPlaylistOpen?.()
    } catch (error) {
      if (!selection.cancelled) {
        selection.sourcePaths.forEach(source => URL.revokeObjectURL(source))
        selection.sourcePaths = []
        setState({ sceneIdentity, adding: false, error: readMagePlayerErrorMessage(error) })
      }
    } finally {
      if (!selection.candidate) {
        pending.current.delete(selection)
        if (!selection.cancelled) setState(current => ({ ...current, adding: pending.current.size > 0 }))
      }
      input.value = ''
    }
  }

  return {
    open, select, accept, reject, cancelPending,
    candidate: candidate?.signal.aborted ? null : candidate,
    adding: state.sceneIdentity === sceneIdentity && state.adding,
    error: state.sceneIdentity === sceneIdentity ? state.error : null,
  }
}

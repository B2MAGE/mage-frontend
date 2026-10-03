import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { createPlaylistTrackId, readAudioFileDuration, readMagePlayerErrorMessage } from './magePlayerUtils'
import type { useMagePlayerPlaylist } from './useMagePlayerPlaylist'

type Selection = { cancelled: boolean; sourcePaths: string[] }
type PickerRequest = { cancelled: boolean; sceneIdentity: string | null }
type Args = {
  inputRef: RefObject<HTMLInputElement | null>
  playlist: ReturnType<typeof useMagePlayerPlaylist>
  sceneIdentity: string | null
  onRequestPlaylistOpen?: () => void
}

/** File picking belongs to the viewing session, not a replaceable WebGL renderer. */
export function useMagePlayerAudioSelection({ inputRef, playlist, sceneIdentity, onRequestPlaylistOpen }: Args) {
  const latest = useRef({ playlist, onRequestPlaylistOpen })
  const pending = useRef(new Set<Selection>())
  const pickerRequest = useRef<PickerRequest | null>(null)
  const [state, setState] = useState({ sceneIdentity, adding: false, error: null as string | null })

  useEffect(() => { latest.current = { playlist, onRequestPlaylistOpen } }, [playlist, onRequestPlaylistOpen])
  useEffect(() => {
    const selections = pending.current
    return () => {
      // A native dialog may return after this mounted player changes scenes.
      // Keep its cancellation even if the user navigates back before it closes.
      if (pickerRequest.current?.sceneIdentity === sceneIdentity) pickerRequest.current.cancelled = true
      for (const selection of selections) {
        selection.cancelled = true
        selection.sourcePaths.forEach(source => URL.revokeObjectURL(source))
      }
      selections.clear()
    }
  }, [sceneIdentity])

  function open() {
    const input = inputRef.current
    if (!input) return
    pickerRequest.current = { cancelled: false, sceneIdentity }
    setState({ sceneIdentity, adding: false, error: null })
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
    const selection: Selection = { cancelled: false, sourcePaths: [] }
    pending.current.add(selection)
    setState({ sceneIdentity, adding: true, error: null })
    try {
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
      pending.current.delete(selection)
      if (!selection.cancelled) setState(current => ({ ...current, adding: pending.current.size > 0 }))
      input.value = ''
    }
  }

  return {
    open, select,
    adding: state.sceneIdentity === sceneIdentity && state.adding,
    error: state.sceneIdentity === sceneIdentity ? state.error : null,
  }
}

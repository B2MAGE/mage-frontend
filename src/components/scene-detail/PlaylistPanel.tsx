import { useEffect, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react'
import type { MagePlayerPlaylistTrack } from '@lib/magePlayerPlaylist'
import { PlaylistTrackRow } from './PlaylistTrackRow'
import { EditIcon, RepeatIcon, ShuffleIcon } from './playlistPanelIcons'
import './playlistPanel.css'

type PlaylistDropIndicator = {
  position: 'after' | 'before'
  trackId: string
}

type PlaylistPanelProps = {
  isOpen: boolean
  onClose: () => void
  onPlaylistNameChange: (name: string) => void
  onRemoveTrack: (trackId: string) => void
  onReorderTracks: (tracks: MagePlayerPlaylistTrack[]) => void
  onSelectTrack: (trackId: string | null) => void
  onToggleRepeat: () => void
  onToggleShuffle: () => void
  onUpdateTrack: (
    trackId: string,
    nextDetails: Partial<Pick<MagePlayerPlaylistTrack, 'album' | 'artist' | 'title'>>,
  ) => void
  playlistName: string
  playlistTracks: MagePlayerPlaylistTrack[]
  repeatEnabled: boolean
  selectedTrackId: string | null
  shuffleEnabled: boolean
}

function buildTrackCountLabel(trackCount: number) {
  return `${trackCount} track${trackCount === 1 ? '' : 's'}`
}

export function PlaylistPanel({
  isOpen,
  onClose,
  onPlaylistNameChange,
  onRemoveTrack,
  onReorderTracks,
  onSelectTrack,
  onToggleRepeat,
  onToggleShuffle,
  onUpdateTrack,
  playlistName,
  playlistTracks,
  repeatEnabled,
  selectedTrackId,
  shuffleEnabled,
}: PlaylistPanelProps) {
  const [isEditingPlaylist, setIsEditingPlaylist] = useState(false)
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null)
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<PlaylistDropIndicator | null>(null)
  const [isRenamingPlaylist, setIsRenamingPlaylist] = useState(false)
  const [playlistNameDraft, setPlaylistNameDraft] = useState(playlistName)

  useEffect(() => {
    if (!isOpen || playlistTracks.length === 0) {
      setIsEditingPlaylist(false)
    }
  }, [isOpen, playlistTracks.length])

  useEffect(() => {
    if (!isEditingPlaylist || !isOpen || playlistTracks.length <= 1) {
      setDraggedTrackId(null)
      setDropIndicator(null)
    }
  }, [isEditingPlaylist, isOpen, playlistTracks.length])

  useEffect(() => {
    if (!isEditingPlaylist || !isOpen) {
      setEditingTrackId(null)
      setIsRenamingPlaylist(false)
    }
  }, [isEditingPlaylist, isOpen])

  useEffect(() => {
    if (editingTrackId && !playlistTracks.some((track) => track.id === editingTrackId)) {
      setEditingTrackId(null)
    }
  }, [editingTrackId, playlistTracks])

  useEffect(() => {
    setPlaylistNameDraft(playlistName)
  }, [playlistName])

  function commitPlaylistName() {
    onPlaylistNameChange(playlistNameDraft.trim() || 'Playlist')
    setIsRenamingPlaylist(false)
  }

  function handlePlaylistNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitPlaylistName()
    }

    if (event.key === 'Escape') {
      setPlaylistNameDraft(playlistName)
      setIsRenamingPlaylist(false)
    }
  }

  function readDropPosition(event: DragEvent<HTMLDivElement>) {
    const { height, top } = event.currentTarget.getBoundingClientRect()
    return event.clientY >= top + height / 2 ? 'after' : 'before'
  }

  function reorderTracks(
    sourceTrackId: string,
    targetTrackId: string,
    position: PlaylistDropIndicator['position'],
  ) {
    if (sourceTrackId === targetTrackId) {
      return null
    }

    const sourceIndex = playlistTracks.findIndex((track) => track.id === sourceTrackId)
    const targetIndex = playlistTracks.findIndex((track) => track.id === targetTrackId)

    if (sourceIndex === -1 || targetIndex === -1) {
      return null
    }

    const nextTracks = [...playlistTracks]
    const [movedTrack] = nextTracks.splice(sourceIndex, 1)
    let insertionIndex = targetIndex

    if (sourceIndex < targetIndex) {
      insertionIndex -= 1
    }

    if (position === 'after') {
      insertionIndex += 1
    }

    insertionIndex = Math.max(0, Math.min(insertionIndex, nextTracks.length))
    nextTracks.splice(insertionIndex, 0, movedTrack)

    const didOrderChange = nextTracks.some((track, index) => track.id !== playlistTracks[index]?.id)
    return didOrderChange ? nextTracks : null
  }

  function handleTrackDragStart(event: DragEvent<HTMLDivElement>, trackId: string) {
    if (!isEditingPlaylist || playlistTracks.length <= 1) {
      return
    }

    setEditingTrackId(null)
    setDraggedTrackId(trackId)
    setDropIndicator(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', trackId)
  }

  function handleTrackDragOver(event: DragEvent<HTMLDivElement>, targetTrackId: string) {
    if (!isEditingPlaylist || playlistTracks.length <= 1) {
      return
    }

    const sourceTrackId = draggedTrackId ?? event.dataTransfer.getData('text/plain')

    if (!sourceTrackId || sourceTrackId === targetTrackId) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    const nextDropIndicator = {
      position: readDropPosition(event),
      trackId: targetTrackId,
    } satisfies PlaylistDropIndicator

    setDropIndicator((currentIndicator) => {
      if (
        currentIndicator?.trackId === nextDropIndicator.trackId &&
        currentIndicator.position === nextDropIndicator.position
      ) {
        return currentIndicator
      }

      return nextDropIndicator
    })
  }

  function handleTrackDrop(event: DragEvent<HTMLDivElement>, targetTrackId: string) {
    if (!isEditingPlaylist || playlistTracks.length <= 1) {
      return
    }

    event.preventDefault()

    const sourceTrackId = draggedTrackId ?? event.dataTransfer.getData('text/plain')
    const nextTracks = sourceTrackId
      ? reorderTracks(sourceTrackId, targetTrackId, readDropPosition(event))
      : null

    if (nextTracks) {
      onReorderTracks(nextTracks)
    }

    setDraggedTrackId(null)
    setDropIndicator(null)
  }

  function handleTrackEditorChange(
    trackId: string,
    key: 'album' | 'artist' | 'title',
    event: ChangeEvent<HTMLInputElement>,
  ) {
    onUpdateTrack(trackId, {
      [key]: event.currentTarget.value,
    })
  }

  if (!isOpen) {
    return null
  }

  return (
    <section className="mage-watch__playlist-panel">
      <header className="mage-watch__playlist-header">
        <div className="mage-watch__playlist-heading">
          {isEditingPlaylist ? (
            isRenamingPlaylist ? (
              <input
                aria-label="Playlist name"
                autoFocus
                className="mage-watch__playlist-name-input"
                onBlur={commitPlaylistName}
                onChange={(event) => {
                  setPlaylistNameDraft(event.currentTarget.value)
                }}
                onKeyDown={handlePlaylistNameKeyDown}
                type="text"
                value={playlistNameDraft}
              />
            ) : (
              <button
                aria-label="Rename playlist"
                className="mage-watch__playlist-name-button"
                onClick={() => {
                  setPlaylistNameDraft(playlistName)
                  setIsRenamingPlaylist(true)
                }}
                title="Rename playlist"
                type="button"
              >
                <strong>{playlistName}</strong>
              </button>
            )
          ) : (
            <strong>{playlistName}</strong>
          )}
          <span>{buildTrackCountLabel(playlistTracks.length)}</span>
        </div>
        <div className="mage-watch__playlist-actions">
          <button
            aria-label={`${shuffleEnabled ? 'Disable' : 'Enable'} shuffle playback`}
            aria-pressed={shuffleEnabled}
            className="mage-watch__playlist-action mage-watch__playlist-action--icon"
            disabled={playlistTracks.length <= 1}
            onClick={onToggleShuffle}
            title="Shuffle"
            type="button"
          >
            <ShuffleIcon />
          </button>
          <button
            aria-label={`${repeatEnabled ? 'Disable' : 'Enable'} repeat playback`}
            aria-pressed={repeatEnabled}
            className="mage-watch__playlist-action mage-watch__playlist-action--icon"
            disabled={playlistTracks.length === 0}
            onClick={onToggleRepeat}
            title="Repeat"
            type="button"
          >
            <RepeatIcon />
          </button>
          {playlistTracks.length > 0 ? (
            <button
              aria-label={`${isEditingPlaylist ? 'Finish' : 'Edit'} playlist`}
              aria-pressed={isEditingPlaylist}
              className="mage-watch__playlist-action mage-watch__playlist-action--icon"
              onClick={() => {
                setIsEditingPlaylist((currentValue) => !currentValue)
              }}
              title={isEditingPlaylist ? 'Done editing' : 'Edit playlist'}
              type="button"
            >
              <EditIcon />
            </button>
          ) : null}
          <button
            aria-label="Close playlist"
            className="mage-watch__playlist-action mage-watch__playlist-action--close"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
      </header>
      {playlistTracks.length === 0 ? (
        <p className="mage-watch__playlist-empty">Add tracks from the player to build a playlist.</p>
      ) : (
        <div className="mage-watch__playlist-list">
          {playlistTracks.map((track, index) => (
            <PlaylistTrackRow
              dropPosition={dropIndicator?.trackId === track.id ? dropIndicator.position : undefined}
              editingTrackId={editingTrackId}
              draggedTrackId={draggedTrackId}
              index={index}
              isDropTarget={dropIndicator?.trackId === track.id}
              isEditingPlaylist={isEditingPlaylist}
              key={track.id}
              onCloseEditor={() => {
                setEditingTrackId(null)
              }}
              onDrop={handleTrackDrop}
              onDragEnd={() => {
                setDraggedTrackId(null)
                setDropIndicator(null)
              }}
              onDragOver={handleTrackDragOver}
              onDragStart={handleTrackDragStart}
              onFieldChange={handleTrackEditorChange}
              onRemoveTrack={onRemoveTrack}
              onSelectTrack={onSelectTrack}
              onToggleEditor={(trackId) => {
                setEditingTrackId((currentTrackId) => (currentTrackId === trackId ? null : trackId))
              }}
              selectedTrackId={selectedTrackId}
              track={track}
            />
          ))}
        </div>
      )}
    </section>
  )
}

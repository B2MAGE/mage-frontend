import { type ChangeEvent, type DragEvent } from 'react'
import {
  readPlaylistTrackDisplayName,
  readPlaylistTrackMetaLine,
  readPlaylistTrackSummaryName,
  type MagePlayerPlaylistTrack,
} from '@lib/magePlayerPlaylist'
import { PlaylistTrackEditor } from './PlaylistTrackEditor'
import { CloseIcon } from './playlistPanelIcons'

type PlaylistTrackRowProps = {
  dropPosition: 'after' | 'before' | undefined
  editingTrackId: string | null
  draggedTrackId: string | null
  index: number
  isDropTarget: boolean
  isEditingPlaylist: boolean
  onCloseEditor: () => void
  onDrop: (event: DragEvent<HTMLDivElement>, trackId: string) => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLDivElement>, trackId: string) => void
  onDragStart: (event: DragEvent<HTMLDivElement>, trackId: string) => void
  onFieldChange: (
    trackId: string,
    key: 'album' | 'artist' | 'title',
    event: ChangeEvent<HTMLInputElement>,
  ) => void
  onRemoveTrack: (trackId: string) => void
  onSelectTrack: (trackId: string | null) => void
  onToggleEditor: (trackId: string) => void
  selectedTrackId: string | null
  track: MagePlayerPlaylistTrack
}

function formatTrackDuration(seconds: number | null) {
  if (!Number.isFinite(seconds) || seconds === null || seconds <= 0) {
    return '--:--'
  }

  const roundedSeconds = Math.floor(seconds)
  const hours = Math.floor(roundedSeconds / 3600)
  const minutes = Math.floor((roundedSeconds % 3600) / 60)
  const remainingSeconds = roundedSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

export function PlaylistTrackRow({
  dropPosition,
  editingTrackId,
  draggedTrackId,
  index,
  isDropTarget,
  isEditingPlaylist,
  onCloseEditor,
  onDrop,
  onDragEnd,
  onDragOver,
  onDragStart,
  onFieldChange,
  onRemoveTrack,
  onSelectTrack,
  onToggleEditor,
  selectedTrackId,
  track,
}: PlaylistTrackRowProps) {
  const isDetailsOpen = isEditingPlaylist && editingTrackId === track.id
  const isDragging = draggedTrackId === track.id
  const trackMeta = readPlaylistTrackMetaLine(track)

  return (
    <div className={`mage-watch__playlist-track-shell${isDetailsOpen ? ' is-details-open' : ''}`}>
      <div
        className={`mage-watch__playlist-track${selectedTrackId === track.id ? ' is-active' : ''}${isEditingPlaylist ? ' is-editing' : ''}${isDragging ? ' is-dragging' : ''}${isDropTarget && !isDragging ? ' is-drop-target' : ''}${isDetailsOpen ? ' is-details-open' : ''}`}
        data-drop-position={isDropTarget ? dropPosition : undefined}
        draggable={isEditingPlaylist && !isDetailsOpen}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          onDragOver(event, track.id)
        }}
        onDragStart={(event) => {
          onDragStart(event, track.id)
        }}
        onDrop={(event) => {
          onDrop(event, track.id)
        }}
      >
        <button
          className="mage-watch__playlist-track-button"
          onClick={() => {
            if (isEditingPlaylist) {
              onToggleEditor(track.id)
              return
            }

            onSelectTrack(track.id)
          }}
          title={readPlaylistTrackSummaryName(track)}
          type="button"
        >
          <span className="mage-watch__playlist-track-index">{index + 1}</span>
          <span className="mage-watch__playlist-track-copy">
            <strong>{readPlaylistTrackDisplayName(track)}</strong>
            <span>{trackMeta ? `${trackMeta} - ${formatTrackDuration(track.duration)}` : formatTrackDuration(track.duration)}</span>
          </span>
        </button>
        {isEditingPlaylist ? (
          <button
            aria-label={`Remove ${readPlaylistTrackSummaryName(track)}`}
            className="mage-watch__playlist-remove"
            onClick={() => {
              onRemoveTrack(track.id)
            }}
            title={`Remove ${readPlaylistTrackSummaryName(track)}`}
            type="button"
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>
      {isDetailsOpen ? (
        <PlaylistTrackEditor onClose={onCloseEditor} onFieldChange={onFieldChange} track={track} />
      ) : null}
    </div>
  )
}

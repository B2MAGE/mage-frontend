import { type ChangeEvent } from 'react'
import { readPlaylistTrackSummaryName, type MagePlayerPlaylistTrack } from '@lib/magePlayerPlaylist'
import { CloseIcon } from './playlistPanelIcons'

type PlaylistTrackEditorProps = {
  onClose: () => void
  onFieldChange: (
    trackId: string,
    key: 'album' | 'artist' | 'title',
    event: ChangeEvent<HTMLInputElement>,
  ) => void
  track: MagePlayerPlaylistTrack
}

export function PlaylistTrackEditor({ onClose, onFieldChange, track }: PlaylistTrackEditorProps) {
  return (
    <div
      aria-label={`Edit ${readPlaylistTrackSummaryName(track)}`}
      className="mage-watch__playlist-track-editor"
      role="dialog"
    >
      <div className="mage-watch__playlist-track-editor-header">
        <strong>Edit track</strong>
        <button
          aria-label={`Close track details for ${readPlaylistTrackSummaryName(track)}`}
          className="mage-watch__playlist-track-editor-close"
          onClick={onClose}
          type="button"
        >
          <CloseIcon />
        </button>
      </div>
      <label className="mage-watch__playlist-track-editor-field">
        <span>Song name</span>
        <input
          onChange={(event) => {
            onFieldChange(track.id, 'title', event)
          }}
          placeholder={track.name}
          type="text"
          value={track.title ?? ''}
        />
      </label>
      <label className="mage-watch__playlist-track-editor-field">
        <span>Artist</span>
        <input
          onChange={(event) => {
            onFieldChange(track.id, 'artist', event)
          }}
          placeholder="Add artist"
          type="text"
          value={track.artist ?? ''}
        />
      </label>
      <label className="mage-watch__playlist-track-editor-field">
        <span>Album</span>
        <input
          onChange={(event) => {
            onFieldChange(track.id, 'album', event)
          }}
          placeholder="Add album"
          type="text"
          value={track.album ?? ''}
        />
      </label>
      <p className="mage-watch__playlist-track-editor-source" title={track.name}>
        Source file: {track.name}
      </p>
    </div>
  )
}

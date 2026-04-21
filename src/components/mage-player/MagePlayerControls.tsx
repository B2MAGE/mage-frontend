import { type ChangeEvent, type CSSProperties, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import {
  readPlaylistTrackSummaryName,
  type MagePlayerPlaylistTrack,
} from '@lib/magePlayerPlaylist'
import {
  type MagePlayerAudioState,
  type MagePlayerPlaybackState,
} from '@lib/magePlayerAdapter'
import { formatAudioTime } from './magePlayerUtils'

type MagePlayerControlsProps = {
  addButtonLabel: string
  audioError: string | null
  audioProgressPercent: string
  audioState: MagePlayerAudioState
  controlsBusy: boolean
  currentTrack: MagePlayerPlaylistTrack | null
  currentTrackIndex: number
  isVolumeOpen: boolean
  onOpenAudioPicker: (event: ReactMouseEvent<HTMLButtonElement>) => void
  onSeekAudio: (event: ChangeEvent<HTMLInputElement>) => void
  onTogglePlayback: (event: ReactMouseEvent<HTMLButtonElement>) => void
  onToggleVolumePanel: () => void
  onTrackSummaryClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
  onVolumeChange: (event: ChangeEvent<HTMLInputElement>) => void
  playbackState: MagePlayerPlaybackState
  tracksCount: number
  volumeControlRef: RefObject<HTMLDivElement | null>
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8 5.5v13L18.5 12 8 5.5Z" fill="currentColor" />
    </svg>
  )
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {muted ? (
        <path
          d="M15.3 8.7a1 1 0 0 1 1.4 0L19 11l2.3-2.3a1 1 0 1 1 1.4 1.4L20.4 12l2.3 2.3a1 1 0 0 1-1.4 1.4L19 13.4l-2.3 2.3a1 1 0 1 1-1.4-1.4l2.3-2.3-2.3-2.3a1 1 0 0 1 0-1.4ZM4 9h3.2l4-3.6A1 1 0 0 1 13 6.1v11.8a1 1 0 0 1-1.8.7l-4-3.6H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z"
          fill="currentColor"
        />
      ) : (
        <path
          d="M4 9h3.2l4-3.6A1 1 0 0 1 13 6.1v11.8a1 1 0 0 1-1.8.7l-4-3.6H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Zm12.5-1.2a1 1 0 0 1 1.4 0 6 6 0 0 1 0 8.5 1 1 0 1 1-1.4-1.4 4 4 0 0 0 0-5.7 1 1 0 0 1 0-1.4Zm2.8-2.8a1 1 0 0 1 1.4 0 10 10 0 0 1 0 14.1 1 1 0 0 1-1.4-1.4 8 8 0 0 0 0-11.3 1 1 0 0 1 0-1.4Z"
          fill="currentColor"
        />
      )}
    </svg>
  )
}

export function MagePlayerControls({
  addButtonLabel,
  audioError,
  audioProgressPercent,
  audioState,
  controlsBusy,
  currentTrack,
  currentTrackIndex,
  isVolumeOpen,
  onOpenAudioPicker,
  onSeekAudio,
  onTogglePlayback,
  onToggleVolumePanel,
  onTrackSummaryClick,
  onVolumeChange,
  playbackState,
  tracksCount,
  volumeControlRef,
}: MagePlayerControlsProps) {
  const playbackLabel = playbackState === 'playing' ? 'Pause' : 'Play'
  const trackSummaryLabel = currentTrack
    ? `Track ${currentTrackIndex}/${tracksCount}: ${readPlaylistTrackSummaryName(currentTrack)}`
    : 'Track 0/0: No track selected'

  return (
    <div className="mage-player__controls">
      <div className="mage-player__controls-main">
        <div className="mage-player__control-meta">
          {tracksCount > 0 ? (
            <button className="mage-player__track-summary" onClick={onTrackSummaryClick} type="button">
              {trackSummaryLabel}
            </button>
          ) : (
            <span className="mage-player__audio-label">{trackSummaryLabel}</span>
          )}
          {audioError ? (
            <span className="mage-player__control-feedback" role="alert">
              {audioError}
            </span>
          ) : null}
        </div>
        <div className="mage-player__timeline">
          <span className="mage-player__time-label">{formatAudioTime(audioState.currentTime)}</span>
          <input
            aria-label="Seek scene audio"
            className="mage-player__timeline-slider"
            disabled={!audioState.isLoaded || audioState.duration <= 0 || controlsBusy}
            max={audioState.duration > 0 ? audioState.duration : 0}
            min={0}
            onChange={onSeekAudio}
            step={0.01}
            style={{ '--mage-player-progress': audioProgressPercent } as CSSProperties}
            title={
              audioState.isLoaded
                ? 'Seek through the loaded audio.'
                : 'Add audio to enable scrubbing.'
            }
            type="range"
            value={Math.min(audioState.currentTime, audioState.duration)}
          />
          <span className="mage-player__time-label">{formatAudioTime(audioState.duration)}</span>
        </div>
      </div>
      <div className="mage-player__control-actions">
        <button
          aria-label="Add audio tracks"
          className="mage-player__control-button mage-player__control-button--text"
          disabled={controlsBusy}
          onClick={onOpenAudioPicker}
          title="Add audio tracks from your device."
          type="button"
        >
          {addButtonLabel}
        </button>
        <div className="mage-player__volume-control" ref={volumeControlRef}>
          <button
            aria-controls="mage-player-volume-panel"
            aria-expanded={isVolumeOpen}
            aria-label="Adjust audio volume"
            className="mage-player__control-button"
            disabled={!audioState.isLoaded || controlsBusy}
            onClick={onToggleVolumePanel}
            title={
              audioState.isLoaded
                ? 'Adjust audio volume'
                : 'Add audio to enable volume controls'
            }
            type="button"
          >
            <span className="mage-player__control-icon">
              <VolumeIcon muted={audioState.volume <= 0.001} />
            </span>
          </button>
          {isVolumeOpen ? (
            <div className="mage-player__volume-panel" id="mage-player-volume-panel">
              <label className="mage-player__volume-label" htmlFor="mage-player-volume-slider">
                Volume
              </label>
              <input
                aria-label="Audio volume"
                className="mage-player__volume-slider"
                id="mage-player-volume-slider"
                max={1}
                min={0}
                onChange={onVolumeChange}
                step={0.01}
                type="range"
                value={audioState.volume}
              />
              <span className="mage-player__volume-value">{Math.round(audioState.volume * 100)}%</span>
            </div>
          ) : null}
        </div>
        <button
          aria-label={`${playbackLabel} scene and audio playback`}
          aria-pressed={playbackState === 'playing'}
          className="mage-player__control-button"
          disabled={controlsBusy}
          onClick={onTogglePlayback}
          title={`${playbackLabel} scene and audio playback`}
          type="button"
        >
          <span className="mage-player__control-icon">
            {playbackState === 'playing' ? <PauseIcon /> : <PlayIcon />}
          </span>
        </button>
      </div>
    </div>
  )
}

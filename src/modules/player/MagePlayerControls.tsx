import { type ChangeEvent, type CSSProperties, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { PendingButtonLabel } from '@shared/ui'
import {
  readPlaylistTrackSummaryName,
  type MagePlayerPlaylistTrack,
} from './playlist'
import {
  type MagePlayerAudioState,
  type MagePlayerPlaybackState,
} from './infrastructure/engineAdapter'
import { formatAudioTime } from './magePlayerUtils'

type MagePlayerControlsProps = {
  activeAudioAction: 'add' | 'load' | null
  audioError: string | null
  audioProgressPercent: string
  audioState: MagePlayerAudioState
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
  showPlaylistButton: boolean
  tracksCount: number
  volumeControlRef: RefObject<HTMLDivElement | null>
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7.5 5.5h3.25v13H7.5zM13.25 5.5h3.25v13h-3.25z" fill="currentColor" />
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

function AddAudioIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4v10.5a3.25 3.25 0 1 1-2-3V6l6-2v9.5a3.25 3.25 0 1 1-2-3" />
      <path d="M4 6v6M1 9h6" />
    </svg>
  )
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10v4h4l5 4V6l-5 4H4z" />
      {muted ? <path d="m17 10 4 4m0-4-4 4" /> : <><path d="M16 9.5a4 4 0 0 1 0 5" /><path d="M18.5 7a7.25 7.25 0 0 1 0 10" /></>}
    </svg>
  )
}

export function MagePlayerControls({
  activeAudioAction,
  audioError,
  audioProgressPercent,
  audioState,
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
  showPlaylistButton,
  tracksCount,
  volumeControlRef,
}: MagePlayerControlsProps) {
  const controlsBusy = activeAudioAction !== null
  const isAddingAudio = activeAudioAction === 'add'
  const isLoadingTrack = activeAudioAction === 'load'
  const playbackLabel = playbackState === 'playing' ? 'Pause' : 'Play'
  const trackSummaryLabel = currentTrack
    ? `Track ${currentTrackIndex}/${tracksCount}: ${readPlaylistTrackSummaryName(currentTrack)}`
    : 'Track 0/0: No track selected'

  return (
    <div className="mage-player__controls">
        <button
          aria-label={`${playbackLabel} scene and audio playback`}
          aria-pressed={playbackState === 'playing'}
          className="mage-player__control-button mage-player__control-button--playback"
          disabled={controlsBusy}
          onClick={onTogglePlayback}
          title={`${playbackLabel} scene and audio playback`}
          type="button"
        >
          <span className="mage-player__control-icon">
            {playbackState === 'playing' ? <PauseIcon /> : <PlayIcon />}
          </span>
        </button>
      <div className="mage-player__controls-main">
        <div aria-busy={isLoadingTrack} className="mage-player__control-meta">
          {tracksCount > 0 ? (
            <button className="mage-player__track-summary" onClick={onTrackSummaryClick} type="button">
              {trackSummaryLabel}
            </button>
          ) : (
            <span className="mage-player__audio-label">{trackSummaryLabel}</span>
          )}
          {isLoadingTrack ? (
            <span className="mage-player__control-feedback mage-player__track-loading-status" role="status">
              <span aria-hidden="true" className="pending-button-label__spinner" />
              Loading track…
            </span>
          ) : audioError ? (
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
          aria-busy={isAddingAudio}
          aria-label="Add audio tracks"
          className="mage-player__control-button mage-player__control-button--text"
          disabled={controlsBusy}
          onClick={onOpenAudioPicker}
          title="Add audio tracks from your device."
          type="button"
        >
          <span className="mage-player__add-audio-label">
            <PendingButtonLabel pending={isAddingAudio} pendingLabel="Adding...">
              Add
            </PendingButtonLabel>
          </span>
          <span className="mage-player__control-icon mage-player__add-audio-icon"><AddAudioIcon /></span>
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


        <button className="mage-player__control-button mage-player__control-button--fullscreen" type="button" aria-label="Toggle fullscreen" title="Toggle fullscreen" onClick={(event) => { const element = event.currentTarget.closest<HTMLElement>('.mage-player'); if (document.fullscreenElement === element) { void document.exitFullscreen?.().catch(() => undefined) } else { void element?.requestFullscreen?.().catch(() => undefined) } }}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M8.5 4H4v4.5M15.5 4H20v4.5M20 15.5V20h-4.5M4 15.5V20h4.5"/></svg></button>
        {showPlaylistButton && (
          <button
            className="mage-player__control-button mage-player__control-button--playlist"
            type="button"
            aria-label="Open playlist"
            title="Open playlist"
            onClick={onTrackSummaryClick}
          >
            <span className="mage-player__control-icon">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M8 6h12M8 12h12M8 18h12M3 6h1M3 12h1M3 18h1" />
              </svg>
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

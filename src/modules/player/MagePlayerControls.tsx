import { type ChangeEvent, type CSSProperties, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'
import { AppIcon, PendingButtonLabel } from '@shared/ui'
import {
  readPlaylistTrackSummaryName,
  type MagePlayerPlaylistTrack,
} from './playlist'
import {
  type MagePlayerAudioState,
  type MagePlayerPlaybackState,
} from './infrastructure/engineAdapter'
import { formatAudioTime } from './magePlayerUtils'
import { PlaybackOptions } from './recovery/PlaybackOptions'

type MagePlayerControlsProps = {
  disabled?: boolean
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
  onStopScene?: () => void
  onPauseAllScenes: () => void
  playbackState: MagePlayerPlaybackState
  showPlaylistButton: boolean
  tracksCount: number
  volumeControlRef: RefObject<HTMLDivElement | null>
}

export function MagePlayerControls({
  disabled = false,
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
  onStopScene,
  onPauseAllScenes,
  playbackState,
  showPlaylistButton,
  tracksCount,
  volumeControlRef,
}: MagePlayerControlsProps) {
  const controlsBusy = disabled || activeAudioAction !== null
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
            <AppIcon name={playbackState === 'playing' ? 'pause' : 'play'} size={16} />
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
          <span className="mage-player__control-icon mage-player__add-audio-icon"><AppIcon name="plus" size={22} /></span>
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
              <AppIcon name={audioState.volume <= 0.001 ? 'volume-x' : 'volume-2'} />
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


        <button className="mage-player__control-button mage-player__control-button--fullscreen" type="button" aria-label="Toggle fullscreen" title="Toggle fullscreen" onClick={(event) => { const element = event.currentTarget.closest<HTMLElement>('.mage-player'); if (document.fullscreenElement === element) { void document.exitFullscreen?.().catch(() => undefined) } else { void element?.requestFullscreen?.().catch(() => undefined) } }}><AppIcon name="maximize" /></button>
        <PlaybackOptions onStopScene={onStopScene} onPauseAllScenes={onPauseAllScenes} />
        {showPlaylistButton && (
          <button
            className="mage-player__control-button mage-player__control-button--playlist"
            type="button"
            aria-label="Open playlist"
            title="Open playlist"
            onClick={onTrackSummaryClick}
          >
            <span className="mage-player__control-icon">
              <AppIcon name="list-music" />
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

import { createRef, type ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MagePlayerControls } from './MagePlayerControls'

function createProps(): ComponentProps<typeof MagePlayerControls> {
  return {
    activeAudioAction: null,
    audioError: null,
    audioProgressPercent: '0%',
    audioState: { currentTime: 0, duration: 60, hasSource: true, isLoaded: true, sourcePath: 'blob:audio', volume: 1 },
    currentTrack: null,
    currentTrackIndex: 0,
    isVolumeOpen: false,
    onOpenAudioPicker: vi.fn(),
    onSeekAudio: vi.fn(),
    onTogglePlayback: vi.fn(),
    onToggleVolumePanel: vi.fn(),
    onTrackSummaryClick: vi.fn(),
    onVolumeChange: vi.fn(),
    onStopScene: vi.fn(),
    onClearMusic: vi.fn(),
    onPauseAllScenes: vi.fn(),
    playbackState: 'playing',
    showPlaylistButton: true,
    tracksCount: 0,
    volumeControlRef: createRef<HTMLDivElement>(),
  }
}

describe('MagePlayerControls library icons', () => {
  it('uses clear, consistently sized decorative icons without changing control labels', () => {
    render(<MagePlayerControls {...createProps()} />)

    const controls = [
      ['Pause scene and audio playback', 'pause', '16'],
      ['Add audio tracks', 'plus', '22'],
      ['Adjust audio volume', 'volume-2', '20'],
      ['Toggle fullscreen', 'maximize', '20'],
      ['Playback options', 'settings', '20'],
      ['Open playlist', 'list-music', '20'],
    ]

    for (const [label, iconName, size] of controls) {
      const icon = screen.getByRole('button', { name: label }).querySelector('svg')
      expect(icon).toHaveClass('app-icon', `lucide-${iconName}`)
      expect(icon).toHaveAttribute('width', size)
      expect(icon).toHaveAttribute('height', size)
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      expect(icon).toHaveAttribute('focusable', 'false')
    }
  })

  it('updates play and mute icons while preserving button interactions', () => {
    const props = createProps()
    render(<MagePlayerControls {...props} playbackState="paused" audioState={{ ...props.audioState, volume: 0 }} />)

    const playButton = screen.getByRole('button', { name: 'Play scene and audio playback' })
    const volumeButton = screen.getByRole('button', { name: 'Adjust audio volume' })
    expect(playButton.querySelector('svg')).toHaveClass('lucide-play')
    expect(playButton.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
    expect(volumeButton.querySelector('svg')).toHaveClass('lucide-volume-x')

    fireEvent.click(playButton)
    fireEvent.click(volumeButton)
    fireEvent.click(screen.getByRole('button', { name: 'Add audio tracks' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open playlist' }))
    expect(props.onTogglePlayback).toHaveBeenCalledOnce()
    expect(props.onToggleVolumePanel).toHaveBeenCalledOnce()
    expect(props.onOpenAudioPicker).toHaveBeenCalledOnce()
    expect(props.onTrackSummaryClick).toHaveBeenCalledOnce()
  })

  it('keeps the add and playback controls disabled during an upload', () => {
    render(<MagePlayerControls {...createProps()} activeAudioAction="add" />)
    expect(screen.getByRole('button', { name: 'Add audio tracks' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add audio tracks' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Pause scene and audio playback' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Adjust audio volume' })).toBeDisabled()
  })

  it('keeps recovery actions in the options menu and supports dismissal without activating them', () => {
    const props = createProps()
    render(<MagePlayerControls {...props} />)
    const trigger = screen.getByRole('button', { name: 'Playback options' })
    expect(screen.queryByRole('button', { name: 'Stop this scene' })).not.toBeInTheDocument()
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    screen.getByRole('button', { name: 'Stop this scene' }).focus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('group', { name: 'Playback options' })).not.toBeInTheDocument()
    expect(props.onStopScene).not.toHaveBeenCalled()
    expect(props.onPauseAllScenes).not.toHaveBeenCalled()
    expect(props.onClearMusic).not.toHaveBeenCalled()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pause all scenes' }))
    expect(props.onPauseAllScenes).toHaveBeenCalledOnce()
  })

  it.each(['single', 'playlist'] as const)('keeps Clear music available for an empty or busy %s player without changing playback', async audioMode => {
    const props = createProps()
    const user = userEvent.setup()
    const { rerender } = render(<MagePlayerControls {...props} audioMode={audioMode} />)
    const trigger = screen.getByRole('button', { name: 'Playback options' })
    await user.click(trigger)
    const clear = screen.getByRole('button', { name: 'Clear music' })
    expect(clear).toBeEnabled()
    expect(clear).toHaveAccessibleDescription('Remove all songs loaded in this player without changing your saved scenes.')
    clear.focus()
    await user.keyboard('{Enter}')
    expect(props.onClearMusic).toHaveBeenCalledOnce()
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    rerender(<MagePlayerControls {...props} audioMode={audioMode} activeAudioAction="add" />)
    await user.click(trigger)
    expect(screen.getByRole('button', { name: 'Clear music' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Clear music' }))
    expect(props.onClearMusic).toHaveBeenCalledTimes(2)
    expect(trigger).toHaveFocus()
    expect(props.onTogglePlayback).not.toHaveBeenCalled()
    expect(props.onStopScene).not.toHaveBeenCalled()
    expect(props.onPauseAllScenes).not.toHaveBeenCalled()
  })

  it('keeps the complete control bar visible and disables every interaction when playback is unavailable', () => {
    const props = createProps()
    render(<MagePlayerControls {...props} disabled />)

    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    expect(screen.getByRole('slider', { name: 'Seek scene audio' })).toBeDisabled()
    expect(screen.getByText('Track 0/0: No track selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Playback options' })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('MagePlayerControls single song', () => {
  const track = { id: 'local-song', name: 'song.wav', title: 'Midnight', artist: 'MAGE', duration: 60, sourcePath: 'blob:song', sourceType: 'device' as const }

  it('offers one song without a track count or playlist control', () => {
    render(<MagePlayerControls {...createProps()} audioMode="single" />)

    expect(screen.getByText('No song selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add song' })).toHaveAttribute('title', 'Add song from your device.')
    expect(screen.queryByRole('button', { name: 'Open playlist' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Track \d/)).not.toBeInTheDocument()
  })

  it('shows the current name as text and supports replacing it from the keyboard', async () => {
    const props = createProps()
    render(<MagePlayerControls {...props} audioMode="single" currentTrack={track} currentTrackIndex={1} tracksCount={1} />)
    const summary = screen.getByText('MAGE - Midnight')
    expect(summary.tagName).toBe('SPAN')
    expect(summary).toHaveAttribute('title', 'MAGE - Midnight')
    expect(summary).not.toHaveAttribute('tabindex')
    expect(screen.queryByRole('button', { name: /Midnight|playlist/ })).not.toBeInTheDocument()
    const replace = screen.getByRole('button', { name: 'Replace song' })
    expect(replace).toHaveAttribute('title', 'Replace song from your device.')
    replace.focus()
    await userEvent.setup().keyboard('{Enter}')
    expect(props.onOpenAudioPicker).toHaveBeenCalledOnce()
    expect(props.onTrackSummaryClick).not.toHaveBeenCalled()
  })

  it('temporarily replaces the current name with loading text and restores it afterward', () => {
    const props = { ...createProps(), audioMode: 'single' as const, currentTrack: track, currentTrackIndex: 1, tracksCount: 1 }
    const { rerender } = render(<MagePlayerControls {...props} activeAudioAction="add" />)
    expect(screen.queryByText('MAGE - Midnight')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Replace song' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Replace song' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Loading song…')
    expect(screen.getByRole('status')).toHaveClass('mage-player__audio-label')
    expect(screen.getByRole('status').parentElement?.children).toHaveLength(1)
    expect(screen.getByRole('status').parentElement).toHaveAttribute('aria-busy', 'true')

    rerender(<MagePlayerControls {...props} audioError="This song could not be loaded. Try another audio file." />)
    expect(screen.getByText('MAGE - Midnight')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('This song could not be loaded. Try another audio file.')
    expect(screen.getByRole('alert').parentElement).toHaveClass('mage-player__control-meta--single')
    expect(screen.getByRole('button', { name: 'Replace song' })).toBeEnabled()
    expect(screen.getByRole('slider', { name: 'Seek scene audio' })).toBeEnabled()
  })

  it('preserves playlist summaries and controls for the full player', () => {
    render(<MagePlayerControls {...createProps()} audioMode="playlist" currentTrack={track} currentTrackIndex={2} tracksCount={3} />)
    expect(screen.getByRole('button', { name: 'Track 2/3: MAGE - Midnight' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open playlist' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add audio tracks' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Replace song' })).not.toBeInTheDocument()
  })
})

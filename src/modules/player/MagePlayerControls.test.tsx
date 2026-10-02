import { createRef, type ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
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
})

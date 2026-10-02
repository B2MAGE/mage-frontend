import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MagePlayerPlaylistTrack } from '@modules/player'
import { PlaylistPanel } from './PlaylistPanel'

const track: MagePlayerPlaylistTrack = {
  duration: 133,
  id: 'local-track-1',
  name: 'night-drive-original-mix.mp3',
  sourcePath: 'blob:night-drive',
  sourceType: 'device',
  title: 'Night Drive',
}

function createProps() {
  return {
    isOpen: true,
    onClose: vi.fn(),
    onPlaylistNameChange: vi.fn(),
    onRemoveTrack: vi.fn(),
    onReorderTracks: vi.fn(),
    onSelectTrack: vi.fn(),
    onToggleRepeat: vi.fn(),
    onToggleShuffle: vi.fn(),
    onUpdateTrack: vi.fn(),
    playlistName: 'Evening listening',
    playlistTracks: [track],
    repeatEnabled: false,
    selectedTrackId: track.id,
    shuffleEnabled: false,
  }
}

function openTrackEditor() {
  fireEvent.click(screen.getByRole('button', { name: 'Edit playlist' }))
  fireEvent.click(screen.getByRole('button', { name: /Night Drive.*2:13/ }))
  return screen.getByRole('dialog', { name: 'Edit Night Drive' })
}


describe('PlaylistPanel playback modes', () => {
  it('uses shared library icons for playlist controls and closes accessibly', () => {
    const props = createProps()
    render(<PlaylistPanel {...props} />)

    const controls = [
      ['Enable shuffle playback', 'shuffle'],
      ['Enable repeat playback', 'repeat'],
      ['Edit playlist', 'pencil'],
      ['Close playlist', 'x'],
    ]
    for (const [label, iconName] of controls) {
      const icon = screen.getByRole('button', { name: label }).querySelector('svg')
      expect(icon).toHaveClass('app-icon', `lucide-${iconName}`)
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    }

    fireEvent.click(screen.getByRole('button', { name: 'Close playlist' }))
    expect(props.onClose).toHaveBeenCalledOnce()
  })

  it('toggles playback modes and reflects their controlled on and off states', () => {
    const props = {
      ...createProps(),
      playlistTracks: [track, { ...track, id: 'local-track-2', name: 'dawn.mp3', title: 'Dawn' }],
    }
    const { rerender } = render(<PlaylistPanel {...props} />)

    const shuffle = screen.getByRole('button', { name: 'Enable shuffle playback' })
    const repeat = screen.getByRole('button', { name: 'Enable repeat playback' })
    expect(shuffle).toHaveAttribute('aria-pressed', 'false')
    expect(shuffle).toHaveAttribute('title', 'Shuffle: off')
    expect(repeat).toHaveAttribute('aria-pressed', 'false')
    expect(repeat).toHaveAttribute('title', 'Repeat playlist: off')

    fireEvent.click(shuffle)
    fireEvent.click(repeat)
    expect(props.onToggleShuffle).toHaveBeenCalledTimes(1)
    expect(props.onToggleRepeat).toHaveBeenCalledTimes(1)

    rerender(<PlaylistPanel {...props} repeatEnabled shuffleEnabled />)

    const activeShuffle = screen.getByRole('button', { name: 'Disable shuffle playback' })
    const activeRepeat = screen.getByRole('button', { name: 'Disable repeat playback' })
    expect(activeShuffle).toHaveAttribute('aria-pressed', 'true')
    expect(activeShuffle).toHaveAttribute('title', 'Shuffle: on')
    expect(activeRepeat).toHaveAttribute('aria-pressed', 'true')
    expect(activeRepeat).toHaveAttribute('title', 'Repeat playlist: on')

    fireEvent.click(activeShuffle)
    fireEvent.click(activeRepeat)
    expect(props.onToggleShuffle).toHaveBeenCalledTimes(2)
    expect(props.onToggleRepeat).toHaveBeenCalledTimes(2)

    rerender(<PlaylistPanel {...props} />)
    expect(screen.getByRole('button', { name: 'Enable shuffle playback' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Enable repeat playback' })).toHaveAttribute('aria-pressed', 'false')
    expect(props.onSelectTrack).not.toHaveBeenCalled()
  })

  it('disables both playback modes for an empty playlist', () => {
    const props = { ...createProps(), playlistTracks: [], selectedTrackId: null }
    render(<PlaylistPanel {...props} />)

    const shuffle = screen.getByRole('button', { name: 'Enable shuffle playback' })
    const repeat = screen.getByRole('button', { name: 'Enable repeat playback' })
    expect(shuffle).toBeDisabled()
    expect(repeat).toBeDisabled()
    fireEvent.click(shuffle)
    fireEvent.click(repeat)
    expect(props.onToggleShuffle).not.toHaveBeenCalled()
    expect(props.onToggleRepeat).not.toHaveBeenCalled()
  })

  it('allows repeat but not shuffle with only one track', () => {
    const props = createProps()
    render(<PlaylistPanel {...props} />)

    const shuffle = screen.getByRole('button', { name: 'Enable shuffle playback' })
    const repeat = screen.getByRole('button', { name: 'Enable repeat playback' })
    expect(shuffle).toBeDisabled()
    expect(repeat).toBeEnabled()
    fireEvent.click(shuffle)
    fireEvent.click(repeat)
    expect(props.onToggleShuffle).not.toHaveBeenCalled()
    expect(props.onToggleRepeat).toHaveBeenCalledTimes(1)
  })
})

describe('PlaylistPanel track metadata editing', () => {
  it('opens track details without selecting playback while editing the playlist', () => {
    const props = createProps()
    render(<PlaylistPanel {...props} />)

    const editor = openTrackEditor()

    expect(props.onSelectTrack).not.toHaveBeenCalled()
    expect(within(editor).getByLabelText('Song name')).toHaveValue('Night Drive')
    expect(within(editor).getByLabelText('Artist')).toHaveValue('')
    expect(within(editor).getByLabelText('Album')).toHaveValue('')
    expect(within(editor).getByText(`Source file: ${track.name}`)).toHaveAttribute('title', track.name)
  })

  it('updates each metadata field immediately without changing the original source file', () => {
    const props = createProps()
    const { rerender } = render(<PlaylistPanel {...props} />)
    const editor = openTrackEditor()

    fireEvent.change(within(editor).getByLabelText('Song name'), { target: { value: 'After Dark' } })
    fireEvent.change(within(editor).getByLabelText('Artist'), { target: { value: 'Ari Rivera' } })
    fireEvent.change(within(editor).getByLabelText('Album'), { target: { value: 'Late Hours' } })

    expect(props.onUpdateTrack.mock.calls).toEqual([
      [track.id, { title: 'After Dark' }],
      [track.id, { artist: 'Ari Rivera' }],
      [track.id, { album: 'Late Hours' }],
    ])

    rerender(<PlaylistPanel {...props} playlistTracks={[{
      ...track,
      title: 'After Dark',
      artist: 'Ari Rivera',
      album: 'Late Hours',
    }]} />)

    const updatedEditor = screen.getByRole('dialog', { name: 'Edit Ari Rivera - After Dark' })
    expect(within(updatedEditor).getByLabelText('Song name')).toHaveValue('After Dark')
    expect(within(updatedEditor).getByLabelText('Artist')).toHaveValue('Ari Rivera')
    expect(within(updatedEditor).getByLabelText('Album')).toHaveValue('Late Hours')
    expect(within(updatedEditor).getByText(`Source file: ${track.name}`)).toBeInTheDocument()
    expect(props.onRemoveTrack).not.toHaveBeenCalled()
  })

  it('closes only the track editor and allows it to reopen', () => {
    const props = createProps()
    render(<PlaylistPanel {...props} />)
    const editor = openTrackEditor()

    fireEvent.click(within(editor).getByRole('button', { name: 'Close track details for Night Drive' }))

    expect(screen.queryByRole('dialog', { name: 'Edit Night Drive' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finish playlist' })).toBeInTheDocument()
    expect(props.onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Night Drive.*2:13/ }))
    expect(screen.getByRole('dialog', { name: 'Edit Night Drive' })).toBeInTheDocument()
  })

  it('hides track details when editing finishes and restores track playback selection', () => {
    const props = createProps()
    render(<PlaylistPanel {...props} />)
    openTrackEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Finish playlist' }))

    expect(screen.queryByRole('dialog', { name: 'Edit Night Drive' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Night Drive' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Night Drive.*2:13/ }))
    expect(props.onSelectTrack).toHaveBeenCalledExactlyOnceWith(track.id)
  })
})

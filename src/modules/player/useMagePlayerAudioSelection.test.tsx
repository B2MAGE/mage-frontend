import { useRef } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readAudioFileDuration } from './magePlayerUtils'
import { buildMagePlayerTrack } from './test-fixtures'
import { useMagePlayerAudioSelection } from './useMagePlayerAudioSelection'
import type { useMagePlayerPlaylist } from './useMagePlayerPlaylist'

vi.mock('./magePlayerUtils', async original => ({
  ...await original<typeof import('./magePlayerUtils')>(),
  readAudioFileDuration: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function buildPlaylist(): ReturnType<typeof useMagePlayerPlaylist> {
  return {
    clear: vi.fn(),
    tracks: [], currentTrack: null, currentTrackIndex: 0,
    commitPlaylistTracks: vi.fn(), commitSelectedTrackId: vi.fn(), commitTrackDuration: vi.fn(),
  }
}
function Picker({ identity, playlist }: { identity: string; playlist: ReturnType<typeof useMagePlayerPlaylist> }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const selection = useMagePlayerAudioSelection({ inputRef, playlist, sceneIdentity: identity })
  return <>
    <button type="button" onClick={selection.open}>Choose audio</button>
    <input aria-label="Audio files" type="file" ref={inputRef} onChange={event => { void selection.select(event) }} />
    <span role="status">{selection.adding ? 'Reading audio' : 'Ready'}</span>
  </>
}
const choose = () => fireEvent.click(screen.getByRole('button', { name: 'Choose audio' }))
const select = (name = 'selected.mp3') => fireEvent.change(screen.getByLabelText('Audio files'), {
  target: { files: [new File(['music'], name, { type: 'audio/mpeg' })] },
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readAudioFileDuration).mockResolvedValue(120)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('native audio picker scene ownership', () => {
  it('discards a dialog result opened for a previous scene before reading metadata or creating URLs', async () => {
    const playlist = buildPlaylist()
    const createUrl = vi.spyOn(URL, 'createObjectURL')
    const view = render(<Picker identity="scene-a" playlist={playlist} />)
    choose()
    const input = screen.getByLabelText('Audio files')
    view.rerender(<Picker identity="scene-b" playlist={playlist} />)
    select('scene-a-song.mp3')
    await act(async () => {})
    expect(screen.getByLabelText('Audio files')).toBe(input)
    expect(readAudioFileDuration).not.toHaveBeenCalled()
    expect(createUrl).not.toHaveBeenCalled()
    expect(playlist.commitPlaylistTracks).not.toHaveBeenCalled()
    expect(playlist.commitSelectedTrackId).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Ready')
  })

  it('does not revive the old dialog when navigation returns to its original scene', async () => {
    const playlist = buildPlaylist()
    const view = render(<Picker identity="scene-a" playlist={playlist} />)
    choose()
    view.rerender(<Picker identity="scene-b" playlist={playlist} />)
    view.rerender(<Picker identity="scene-a" playlist={playlist} />)
    select()
    await act(async () => {})
    expect(readAudioFileDuration).not.toHaveBeenCalled()
    expect(playlist.commitPlaylistTracks).not.toHaveBeenCalled()
  })

  it('accepts the same scene dialog across focus rechecks and appends to the latest playlist', async () => {
    const playlist = buildPlaylist()
    const view = render(<Picker identity="scene-a" playlist={playlist} />)
    choose()
    const existing = buildMagePlayerTrack({ id: 'existing', name: 'existing.mp3' })
    const latestPlaylist = { ...playlist, tracks: [existing], currentTrack: existing }
    act(() => window.dispatchEvent(new Event('focus')))
    view.rerender(<Picker identity="scene-a" playlist={latestPlaylist} />)
    select()
    await waitFor(() => expect(playlist.commitPlaylistTracks).toHaveBeenCalledWith([
      existing, expect.objectContaining({ name: 'selected.mp3', duration: 120, sourceType: 'device' }),
    ]))
    expect(playlist.commitSelectedTrackId).not.toHaveBeenCalled()
  })

  it('accepts a newly opened dialog after rejecting an old scene result', async () => {
    const playlist = buildPlaylist()
    const view = render(<Picker identity="scene-a" playlist={playlist} />)
    choose()
    view.rerender(<Picker identity="scene-b" playlist={playlist} />)
    select('old.mp3')
    choose()
    select('new.mp3')
    await waitFor(() => expect(playlist.commitPlaylistTracks).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'new.mp3' }),
    ]))
    expect(readAudioFileDuration).toHaveBeenCalledOnce()
    expect(playlist.commitPlaylistTracks).toHaveBeenCalledOnce()
  })

  it.each(['navigate', 'unmount'])('cancels metadata already loading and releases its URL on %s', async action => {
    const metadata = deferred<number>()
    vi.mocked(readAudioFileDuration).mockReturnValue(metadata.promise)
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const playlist = buildPlaylist()
    const view = render(<Picker identity="scene-a" playlist={playlist} />)
    choose()
    select()
    expect(screen.getByRole('status')).toHaveTextContent('Reading audio')
    if (action === 'navigate') view.rerender(<Picker identity="scene-b" playlist={playlist} />)
    else view.unmount()
    expect(revoke).toHaveBeenCalledWith(expect.stringMatching(/^blob:/))
    await act(async () => metadata.resolve(120))
    expect(playlist.commitPlaylistTracks).not.toHaveBeenCalled()
    expect(playlist.commitSelectedTrackId).not.toHaveBeenCalled()
  })
})

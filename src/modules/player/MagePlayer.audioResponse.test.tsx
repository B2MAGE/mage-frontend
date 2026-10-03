import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeAudioResponseConfig } from '@shared/lib'
import { MagePlayer } from './MagePlayer'
import { createMagePlayer, type MagePlayerAudioState } from './infrastructure/engineAdapter'
import { buildMagePlayerController, buildMagePlayerSceneBlob, buildMagePlayerTrack } from './test-fixtures'

vi.mock('./infrastructure/engineAdapter', () => ({ createMagePlayer: vi.fn() }))

describe('live scene audio response', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('keeps a local playlist, playback position, volume, and player while authored mappings change', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const scene = buildMagePlayerSceneBlob({ audioResponse: 'mapped-v1' })
    const { container, rerender } = render(<MagePlayer sceneBlob={scene} sceneKey="editor" />)
    await screen.findByRole('button', { name: /add audio tracks/i })
    await userEvent.setup().upload(container.querySelector('input[type=file]') as HTMLInputElement,
      new File(['audio'], 'local-song.mp3', { type: 'audio/mpeg' }))
    await waitFor(() => expect(controller.loadAudio).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByRole('slider', { name: /seek scene audio/i }), { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: /adjust audio volume/i }))
    fireEvent.change(screen.getByRole('slider', { name: /audio volume/i }), { target: { value: '0.4' } })
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    revoke.mockClear()
    vi.mocked(controller.clearAudio).mockClear()
    const config = normalizeAudioResponseConfig({ sensitivity: 2 }).config
    rerender(<MagePlayer sceneBlob={{ ...structuredClone(scene), audioResponseConfig: config }} sceneKey="editor" />)
    expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument()
    await waitFor(() => expect(controller.setAudioResponseSettings).toHaveBeenLastCalledWith('mapped-v1', config))
    expect(controller.loadSceneBlob).toHaveBeenCalledTimes(1)
    expect(controller.loadAudio).toHaveBeenCalledTimes(1)
    expect(controller.clearAudio).not.toHaveBeenCalled()
    expect(createMagePlayer).toHaveBeenCalledTimes(1)
    expect(revoke).not.toHaveBeenCalled()
    expect(screen.getByText('0:42')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /track 1\/1: local-song.mp3/i })).toBeInTheDocument()
  })

  it('does not cancel an in-flight song load when only its response settings change', async () => {
    let complete!: (state: MagePlayerAudioState) => void
    const controller = buildMagePlayerController({
      loadAudio: vi.fn(() => new Promise<MagePlayerAudioState>((resolve) => { complete = resolve })),
    })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const scene = buildMagePlayerSceneBlob({ audioPath: '/track.mp3' })
    const { rerender } = render(<MagePlayer sceneBlob={scene} />)
    await screen.findByText('Loading track…')
    rerender(<MagePlayer sceneBlob={{ ...structuredClone(scene), audioResponse: 'mapped-v1' }} />)
    await waitFor(() => expect(controller.setAudioResponseSettings).toHaveBeenCalled())
    expect(screen.getByText('Loading track…')).toBeInTheDocument()
    await act(async () => complete({ currentTime: 0, duration: 185, hasSource: true, isLoaded: true, sourcePath: '/track.mp3', volume: 1 }))
    await waitFor(() => expect(screen.queryByText('Loading track…')).not.toBeInTheDocument())
    expect(controller.loadAudio).toHaveBeenCalledTimes(1)
    expect(controller.loadSceneBlob).toHaveBeenCalledTimes(1)
  })

  it('reloads on a different scene key even with the same document object and stable controlled tracks', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    const scene = buildMagePlayerSceneBlob()
    const tracks = [buildMagePlayerTrack()]
    const { rerender } = render(<MagePlayer sceneBlob={scene} sceneKey={1} playlistTracks={tracks} selectedTrackId={tracks[0].id} />)
    await waitFor(() => expect(controller.loadAudio).toHaveBeenCalledTimes(1))
    rerender(<MagePlayer sceneBlob={scene} sceneKey={2} playlistTracks={tracks} selectedTrackId={tracks[0].id} />)
    await waitFor(() => expect(controller.loadAudio).toHaveBeenCalledTimes(2))
    expect(controller.loadSceneBlob).toHaveBeenCalledTimes(2)
    expect(controller.setAudioResponseSettings).not.toHaveBeenCalled()
    expect(createMagePlayer).toHaveBeenCalledTimes(2)
  })

  it('loads the document into a replacement engine before considering it ready', async () => {
    const first = buildMagePlayerController()
    const second = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const scene = buildMagePlayerSceneBlob({ audioPath: '/track.mp3' })
    const { rerender } = render(<MagePlayer sceneBlob={scene} />)
    await waitFor(() => expect(first.loadAudio).toHaveBeenCalledTimes(1))
    rerender(<MagePlayer sceneBlob={scene} log />)
    await waitFor(() => expect(second.loadAudio).toHaveBeenCalledTimes(1))
    expect(second.loadSceneBlob).toHaveBeenCalledTimes(1)
    expect(second.setAudioResponseSettings).not.toHaveBeenCalled()
    expect(first.dispose).toHaveBeenCalledOnce()
  })
})

// This suite tests existing playback behavior with server permission already granted.
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})

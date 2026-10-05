import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer } from './MagePlayer'
import {
  createMagePlayer,
  type MagePlayerAudioState,
} from './infrastructure/engineAdapter'
import {
  buildMagePlayerController,
  buildMagePlayerSceneBlob,
  buildMagePlayerTrack,
} from './test-fixtures'

vi.mock('./infrastructure/engineAdapter', () => ({
  createMagePlayer: vi.fn(),
}))

const savedTracks = [{ ...buildMagePlayerTrack({ name: 'crimson-reactor.mp3', sourcePath: '/audio/crimson-reactor.mp3' }), sourceType: 'scene' as const }]

describe('MagePlayer audio controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the selected host playlist track and exposes a clickable track summary', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const onRequestPlaylistOpen = vi.fn()
    const sceneBlob = buildMagePlayerSceneBlob()

    render(<MagePlayer onRequestPlaylistOpen={onRequestPlaylistOpen} sceneBlob={sceneBlob} playlistTracks={savedTracks} selectedTrackId={savedTracks[0].id} />)

    await waitFor(() => {
      expect(controller.loadAudio).toHaveBeenLastCalledWith({
        sourceLabel: 'crimson-reactor.mp3',
        sourcePath: '/audio/crimson-reactor.mp3',
      })
    })

    const trackSummaryButton = screen.getByRole('button', {
      name: /track 1\/1: crimson-reactor\.mp3/i,
    })

    expect(trackSummaryButton).toBeInTheDocument()
    expect(screen.getByText('3:05')).toBeInTheDocument()

    fireEvent.click(trackSummaryButton)

    expect(onRequestPlaylistOpen).toHaveBeenCalledTimes(1)
  })

  it('shows loading in place of the track title while leaving the Add action copy unchanged', async () => {
    let finishLoadingTrack: (() => void) | undefined
    const loadedAudioState: MagePlayerAudioState = {
      currentTime: 0,
      duration: 185,
      hasSource: true,
      isLoaded: true,
      sourcePath: '/audio/crimson-reactor.mp3',
      volume: 1,
    }
    const controller = buildMagePlayerController({
      loadAudio: vi.fn(
        () =>
          new Promise<MagePlayerAudioState>((resolve) => {
            finishLoadingTrack = () => {
              resolve(loadedAudioState)
            }
          }),
      ),
    })
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const sceneBlob = buildMagePlayerSceneBlob()

    render(<MagePlayer sceneBlob={sceneBlob} playlistTracks={savedTracks} selectedTrackId={savedTracks[0].id} />)

    const loadingStatus = await screen.findByText('Loading track…')
    const addButton = screen.getByRole('button', { name: /add audio tracks/i })

    expect(loadingStatus).toHaveTextContent('Loading track…')
    expect(loadingStatus).toHaveClass('mage-player__audio-label')
    expect(loadingStatus.parentElement?.children).toHaveLength(1)
    expect(loadingStatus.closest('.mage-player__control-meta')).toHaveAttribute('aria-busy', 'true')
    expect(addButton).toBeDisabled()
    expect(addButton).toHaveAttribute('aria-busy', 'false')
    expect(addButton.querySelector('.pending-button-label__content--pending')).toHaveAttribute(
      'data-visible',
      'false',
    )

    finishLoadingTrack?.()

    await waitFor(() => {
      expect(screen.queryByText('Loading track…')).not.toBeInTheDocument()
    })
  })

  it('adds local audio tracks to the playlist and auto-loads the first added track', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const user = userEvent.setup()
    const onPlaylistChange = vi.fn()
    const sceneBlob = buildMagePlayerSceneBlob()

    const { container } = render(
      <MagePlayer onPlaylistChange={onPlaylistChange} sceneBlob={sceneBlob} />,
    )

    const addButton = await screen.findByRole('button', { name: /add audio tracks/i })
    const audioInput = container.querySelector('.mage-player__audio-input') as HTMLInputElement
    const localAudioFile = new File(['audio'], 'device-track.mp3', { type: 'audio/mpeg' })

    fireEvent.click(addButton)
    await user.upload(audioInput, localAudioFile)

    await waitFor(() => {
      expect(controller.loadAudio).toHaveBeenLastCalledWith({
        sourceLabel: 'device-track.mp3',
        sourcePath: expect.stringMatching(/^blob:/),
      })
    })

    expect(onPlaylistChange).toHaveBeenCalledTimes(1)
    expect(onPlaylistChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        duration: expect.any(Number),
        name: 'device-track.mp3',
        sourcePath: expect.stringMatching(/^blob:/),
        sourceType: 'device',
      }),
    ])
    expect(screen.getByRole('button', { name: /track 1\/1: device-track\.mp3/i })).toBeInTheDocument()
  })

  it('supports audio scrubbing and volume control from the shared hover bar', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const sceneBlob = buildMagePlayerSceneBlob()

    render(<MagePlayer sceneBlob={sceneBlob} playlistTracks={savedTracks} selectedTrackId={savedTracks[0].id} />)

    await waitFor(() => {
      expect(controller.loadAudio).toHaveBeenCalled()
    })

    const scrubber = screen.getByRole('slider', { name: /seek scene audio/i })
    fireEvent.change(scrubber, { target: { value: '42' } })

    expect(controller.seekAudio).toHaveBeenLastCalledWith(42)
    expect(screen.getByText('0:42')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /adjust audio volume/i }))

    const volumeSlider = screen.getByRole('slider', { name: /audio volume/i })
    fireEvent.change(volumeSlider, { target: { value: '0.4' } })

    expect(controller.setAudioVolume).toHaveBeenLastCalledWith(0.4)
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('shows a recoverable audio error when the selected playlist track fails to load', async () => {
    const controller = buildMagePlayerController({
      loadAudio: vi.fn(async () => {
        throw new Error('Audio could not be loaded from the configured source.')
      }),
    })

    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const sceneBlob = buildMagePlayerSceneBlob()

    render(<MagePlayer sceneBlob={sceneBlob} playlistTracks={savedTracks} selectedTrackId={savedTracks[0].id} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Audio could not be loaded from the configured source.',
    )
  })

  it('rejects embedded scene audio fields before initializing or loading audio', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)
    render(<MagePlayer sceneBlob={buildMagePlayerSceneBlob({ audioPath: '/audio/embedded.mp3' })} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('audioPath: Unknown field is not allowed.')
    expect(createMagePlayer).not.toHaveBeenCalled()
    expect(controller.loadAudio).not.toHaveBeenCalled()
  })
})

// This suite tests existing playback behavior with server permission already granted.
vi.mock('@modules/player/availability/sceneAvailability', async () => {
  const { allowedSceneAvailability } = await import('@shared/test/sceneAvailability')
  return { sceneAvailabilityStore: allowedSceneAvailability }
})

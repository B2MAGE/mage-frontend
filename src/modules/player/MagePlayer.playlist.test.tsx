import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer } from './MagePlayer'
import {
  createMagePlayer,
  type MagePlayerAudioState,
  type MagePlayerController,
  type MagePlayerPlaybackState,
} from './infrastructure/engineAdapter'
import {
  buildMagePlayerController,
  buildMagePlayerSceneBlob,
  buildMagePlayerTrack,
} from './test-fixtures'

vi.mock('./infrastructure/engineAdapter', () => ({
  createMagePlayer: vi.fn(),
}))

describe('MagePlayer playlist behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pauses playback and clears audio when the last playlist track is removed', async () => {
    const controller = buildMagePlayerController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const onlyTrack = buildMagePlayerTrack()
    const sceneBlob = buildMagePlayerSceneBlob()

    const { rerender } = render(
      <MagePlayer
        playlistTracks={[onlyTrack]}
        sceneBlob={sceneBlob}
        selectedTrackId={onlyTrack.id}
      />,
    )

    await waitFor(() => {
      expect(controller.loadAudio).toHaveBeenLastCalledWith({
        sourceLabel: 'track-one.mp3',
        sourcePath: 'blob:track-one',
      })
    })

    vi.mocked(controller.clearAudio).mockClear()
    vi.mocked(controller.setPlaybackState).mockClear()

    rerender(<MagePlayer playlistTracks={[]} sceneBlob={sceneBlob} selectedTrackId={null} />)

    await waitFor(() => {
      expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
      expect(controller.clearAudio).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByRole('button', { name: /play scene and audio playback/i })).toBeInTheDocument()
  })

  it('advances to the next playlist track when the current track finishes', async () => {
    let playbackState: MagePlayerPlaybackState = 'playing'
    let audioState: MagePlayerAudioState = {
      currentTime: 0,
      duration: 0,
      hasSource: false,
      isLoaded: false,
      sourcePath: null,
      volume: 1,
    }

    const controller: MagePlayerController = {
      clearAudio: vi.fn(() => {
        audioState = {
          currentTime: 0,
          duration: 0,
          hasSource: false,
          isLoaded: false,
          sourcePath: null,
          volume: audioState.volume,
        }

        return audioState
      }),
      dispose: vi.fn(),
      getAudioState: vi.fn(() => audioState),
      getPlaybackState: vi.fn(() => playbackState),
      loadAudio: vi.fn(async (options?: { sourceLabel?: string; sourcePath?: string }) => {
        audioState = {
          currentTime: 0,
          duration: options?.sourceLabel === 'track-two.mp3' ? 120 : 185,
          hasSource: true,
          isLoaded: true,
          sourcePath: options?.sourceLabel ?? null,
          volume: 1,
        }

        return audioState
      }),
      loadSceneBlob: vi.fn(() => {
        audioState = {
          currentTime: 0,
          duration: 0,
          hasSource: false,
          isLoaded: false,
          sourcePath: null,
          volume: 1,
        }
      }),
      resetPlayback: vi.fn(() => playbackState),
      seekAudio: vi.fn((time: number) => {
        audioState = {
          ...audioState,
          currentTime: time,
        }

        return audioState
      }),
      setAudioVolume: vi.fn((volume: number) => {
        audioState = {
          ...audioState,
          volume,
        }

        return audioState
      }),
      setPlaybackState: vi.fn((nextPlaybackState: MagePlayerPlaybackState) => {
        playbackState = nextPlaybackState
        return playbackState
      }),
    }

    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const firstTrack = buildMagePlayerTrack()
    const secondTrack = buildMagePlayerTrack({
      duration: 120,
      id: 'track-2',
      name: 'track-two.mp3',
      sourcePath: 'blob:track-two',
    })
    const onSelectedTrackChange = vi.fn()
    const sceneBlob = buildMagePlayerSceneBlob()

    render(
      <MagePlayer
        onSelectedTrackChange={onSelectedTrackChange}
        playlistTracks={[firstTrack, secondTrack]}
        sceneBlob={sceneBlob}
        selectedTrackId={firstTrack.id}
      />,
    )

    await waitFor(() => {
      expect(controller.loadAudio).toHaveBeenLastCalledWith({
        sourceLabel: 'track-one.mp3',
        sourcePath: 'blob:track-one',
      })
    })

    audioState = {
      ...audioState,
      currentTime: 184.9,
      duration: 185,
      hasSource: true,
      isLoaded: true,
    }

    await waitFor(() => {
      expect(onSelectedTrackChange).toHaveBeenCalledWith(secondTrack.id)
    })
  })

  it('wraps back to the first playlist track when repeat is enabled', async () => {
    let playbackState: MagePlayerPlaybackState = 'playing'
    let audioState: MagePlayerAudioState = {
      currentTime: 0,
      duration: 0,
      hasSource: false,
      isLoaded: false,
      sourcePath: null,
      volume: 1,
    }

    const controller: MagePlayerController = {
      clearAudio: vi.fn(() => audioState),
      dispose: vi.fn(),
      getAudioState: vi.fn(() => audioState),
      getPlaybackState: vi.fn(() => playbackState),
      loadAudio: vi.fn(async (options?: { sourceLabel?: string; sourcePath?: string }) => {
        audioState = {
          currentTime: 0,
          duration: options?.sourceLabel === 'track-two.mp3' ? 120 : 185,
          hasSource: true,
          isLoaded: true,
          sourcePath: options?.sourceLabel ?? null,
          volume: 1,
        }

        return audioState
      }),
      loadSceneBlob: vi.fn(() => {
        audioState = {
          currentTime: 0,
          duration: 0,
          hasSource: false,
          isLoaded: false,
          sourcePath: null,
          volume: 1,
        }
      }),
      resetPlayback: vi.fn(() => playbackState),
      seekAudio: vi.fn((time: number) => {
        audioState = { ...audioState, currentTime: time }
        return audioState
      }),
      setAudioVolume: vi.fn((volume: number) => {
        audioState = { ...audioState, volume }
        return audioState
      }),
      setPlaybackState: vi.fn((nextPlaybackState: MagePlayerPlaybackState) => {
        playbackState = nextPlaybackState
        return playbackState
      }),
    }

    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const firstTrack = buildMagePlayerTrack()
    const secondTrack = buildMagePlayerTrack({
      duration: 120,
      id: 'track-2',
      name: 'track-two.mp3',
      sourcePath: 'blob:track-two',
    })
    const onSelectedTrackChange = vi.fn()
    const sceneBlob = buildMagePlayerSceneBlob()

    render(
      <MagePlayer
        onSelectedTrackChange={onSelectedTrackChange}
        playlistTracks={[firstTrack, secondTrack]}
        repeatEnabled
        sceneBlob={sceneBlob}
        selectedTrackId={secondTrack.id}
      />,
    )

    await waitFor(() => {
      expect(controller.loadAudio).toHaveBeenLastCalledWith({
        sourceLabel: 'track-two.mp3',
        sourcePath: 'blob:track-two',
      })
    })

    audioState = {
      ...audioState,
      currentTime: 119.9,
      duration: 120,
      hasSource: true,
      isLoaded: true,
    }

    await waitFor(() => {
      expect(onSelectedTrackChange).toHaveBeenCalledWith(firstTrack.id)
    })
  })

  it('continues through the supplied playlist order even when shuffle is enabled', async () => {
    let playbackState: MagePlayerPlaybackState = 'playing'
    let audioState: MagePlayerAudioState = {
      currentTime: 0,
      duration: 0,
      hasSource: false,
      isLoaded: false,
      sourcePath: null,
      volume: 1,
    }

    const controller: MagePlayerController = {
      clearAudio: vi.fn(() => audioState),
      dispose: vi.fn(),
      getAudioState: vi.fn(() => audioState),
      getPlaybackState: vi.fn(() => playbackState),
      loadAudio: vi.fn(async (options?: { sourceLabel?: string; sourcePath?: string }) => {
        audioState = {
          currentTime: 0,
          duration: 185,
          hasSource: true,
          isLoaded: true,
          sourcePath: options?.sourceLabel ?? null,
          volume: 1,
        }

        return audioState
      }),
      loadSceneBlob: vi.fn(() => {
        audioState = {
          currentTime: 0,
          duration: 0,
          hasSource: false,
          isLoaded: false,
          sourcePath: null,
          volume: 1,
        }
      }),
      resetPlayback: vi.fn(() => playbackState),
      seekAudio: vi.fn((time: number) => {
        audioState = { ...audioState, currentTime: time }
        return audioState
      }),
      setAudioVolume: vi.fn((volume: number) => {
        audioState = { ...audioState, volume }
        return audioState
      }),
      setPlaybackState: vi.fn((nextPlaybackState: MagePlayerPlaybackState) => {
        playbackState = nextPlaybackState
        return playbackState
      }),
    }

    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const firstTrack = buildMagePlayerTrack()
    const secondTrack = buildMagePlayerTrack({
      duration: 120,
      id: 'track-2',
      name: 'track-two.mp3',
      sourcePath: 'blob:track-two',
    })
    const thirdTrack = buildMagePlayerTrack({
      duration: 95,
      id: 'track-3',
      name: 'track-three.mp3',
      sourcePath: 'blob:track-three',
    })
    const onSelectedTrackChange = vi.fn()
    const sceneBlob = buildMagePlayerSceneBlob()

    render(
      <MagePlayer
        onSelectedTrackChange={onSelectedTrackChange}
        playlistTracks={[firstTrack, secondTrack, thirdTrack]}
        sceneBlob={sceneBlob}
        selectedTrackId={firstTrack.id}
        shuffleEnabled
      />,
    )

    await waitFor(() => {
      expect(controller.loadAudio).toHaveBeenLastCalledWith({
        sourceLabel: 'track-one.mp3',
        sourcePath: 'blob:track-one',
      })
    })

    audioState = {
      ...audioState,
      currentTime: 184.9,
      duration: 185,
      hasSource: true,
      isLoaded: true,
    }

    await waitFor(() => {
      expect(onSelectedTrackChange).toHaveBeenCalledWith(secondTrack.id)
    })
  })
})

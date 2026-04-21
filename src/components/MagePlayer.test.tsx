import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MagePlayer } from './MagePlayer'
import {
  createMagePlayer,
  type MagePlayerAudioState,
  type MagePlayerController,
  type MagePlayerPlaybackState,
} from '@lib/magePlayerAdapter'

vi.mock('@lib/magePlayerAdapter', () => ({
  createMagePlayer: vi.fn(),
}))

function createController(overrides: Partial<MagePlayerController> = {}): MagePlayerController {
  let playbackState: MagePlayerPlaybackState = 'playing'
  let audioState: MagePlayerAudioState = {
    currentTime: 0,
    duration: 0,
    hasSource: false,
    isLoaded: false,
    sourcePath: null,
    volume: 1,
  }

  return {
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
        ...audioState,
        currentTime: 0,
        duration: 185,
        hasSource: true,
        isLoaded: true,
        sourcePath: options?.sourceLabel ?? audioState.sourcePath,
      }

      return audioState
    }),
    loadSceneBlob: vi.fn((sceneBlob: unknown) => {
      if (typeof sceneBlob === 'object' && sceneBlob !== null) {
        const nextSceneBlob = sceneBlob as Record<string, unknown>
        const audioValue = nextSceneBlob.audio
        const sourcePath =
          typeof nextSceneBlob.audioPath === 'string'
            ? nextSceneBlob.audioPath
            : typeof audioValue === 'string'
              ? audioValue
              : audioValue && typeof audioValue === 'object'
                ? typeof (audioValue as Record<string, unknown>).path === 'string'
                  ? ((audioValue as Record<string, unknown>).path as string)
                  : typeof (audioValue as Record<string, unknown>).url === 'string'
                    ? ((audioValue as Record<string, unknown>).url as string)
                    : null
                : null

        audioState = {
          currentTime: 0,
          duration: 0,
          hasSource: Boolean(sourcePath),
          isLoaded: false,
          sourcePath,
          volume: 1,
        }
      }
    }),
    resetPlayback: vi.fn(() => {
      audioState = {
        ...audioState,
        currentTime: 0,
      }
      playbackState = 'paused'
      return playbackState
    }),
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
    ...overrides,
  }
}

describe('MagePlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads a scene blob and disposes the engine on unmount', async () => {
    const controller = createController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const sceneBlob = {
      visualizer: {
        skyboxPreset: 6,
      },
    }

    const { unmount } = render(<MagePlayer sceneBlob={sceneBlob} />)

    expect(screen.getByText('Loading scene preview.')).toBeInTheDocument()

    await waitFor(() => {
      expect(createMagePlayer).toHaveBeenCalledTimes(1)
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(sceneBlob)
      expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    })

    expect(screen.queryByText('Loading scene preview.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pause scene and audio playback/i })).toHaveAccessibleName(
      'Pause scene and audio playback',
    )
    expect(screen.getByRole('button', { name: /add audio tracks/i })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /shuffle playback/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /repeat playback/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reset scene and audio playback/i })).not.toBeInTheDocument()
    expect(screen.getByText('Track 0/0: No track selected')).toBeInTheDocument()

    unmount()

    expect(controller.dispose).toHaveBeenCalledTimes(1)
  })

  it('reuses the same engine instance when the scene blob changes', async () => {
    const controller = createController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const firstSceneBlob = {
      visualizer: {
        skyboxPreset: 6,
      },
    }
    const secondSceneBlob = {
      visualizer: {
        skyboxPreset: 2,
      },
    }

    const { rerender } = render(<MagePlayer sceneBlob={firstSceneBlob} />)

    await waitFor(() => {
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(firstSceneBlob)
    })

    const initialCreateCount = vi.mocked(createMagePlayer).mock.calls.length

    rerender(<MagePlayer sceneBlob={secondSceneBlob} />)

    await waitFor(() => {
      expect(vi.mocked(createMagePlayer).mock.calls.length).toBe(initialCreateCount)
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(secondSceneBlob)
      expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    })
  })

  it('shows a recoverable error state when the scene is invalid', async () => {
    const controller = createController({
      loadSceneBlob: vi.fn((sceneBlob: unknown) => {
        if (typeof sceneBlob === 'object' && sceneBlob !== null && 'invalid' in sceneBlob) {
          throw new Error('Scene data is missing required MAGE fields.')
        }
      }),
    })

    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const { rerender } = render(
      <MagePlayer
        sceneBlob={{
          invalid: true,
        }}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Scene data is missing required MAGE fields.',
    )
    expect(controller.dispose).not.toHaveBeenCalled()

    const validSceneBlob = {
      visualizer: {
        skyboxPreset: 6,
      },
    }

    rerender(<MagePlayer sceneBlob={validSceneBlob} />)

    await waitFor(() => {
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(validSceneBlob)
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('supports a paused initial playback state and toggles playback from the shared control bar', async () => {
    const controller = createController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const sceneBlob = {
      visualizer: {
        skyboxPreset: 6,
      },
    }

    render(<MagePlayer initialPlayback="paused" sceneBlob={sceneBlob} />)

    expect(screen.queryByRole('button', { name: /scene playback/i })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(controller.loadSceneBlob).toHaveBeenCalledWith(sceneBlob)
      expect(controller.setPlaybackState).toHaveBeenLastCalledWith('paused')
    })

    const playbackButton = screen.getByRole('button', { name: /play scene and audio playback/i })
    expect(playbackButton).toHaveAttribute('aria-pressed', 'false')
    expect(playbackButton).toHaveAccessibleName('Play scene and audio playback')

    fireEvent.click(playbackButton)

    expect(controller.setPlaybackState).toHaveBeenLastCalledWith('playing')
    expect(playbackButton).toHaveAttribute('aria-pressed', 'true')
    expect(playbackButton).toHaveAccessibleName('Pause scene and audio playback')
    await waitFor(() => {
      expect(playbackButton).not.toHaveFocus()
    })
  })

  it('auto-loads saved scene audio into the playlist and exposes a clickable track summary', async () => {
    const controller = createController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const onRequestPlaylistOpen = vi.fn()
    const sceneBlob = {
      audioPath: '/audio/crimson-reactor.mp3',
      visualizer: {
        skyboxPreset: 6,
      },
    }

    render(<MagePlayer onRequestPlaylistOpen={onRequestPlaylistOpen} sceneBlob={sceneBlob} />)

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

  it('adds local audio tracks to the playlist and auto-loads the first added track', async () => {
    const controller = createController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const user = userEvent.setup()
    const onPlaylistChange = vi.fn()
    const sceneBlob = {
      visualizer: {
        skyboxPreset: 6,
      },
    }

    const { container } = render(<MagePlayer onPlaylistChange={onPlaylistChange} sceneBlob={sceneBlob} />)

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
    const controller = createController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const sceneBlob = {
      audioPath: '/audio/crimson-reactor.mp3',
      visualizer: {
        skyboxPreset: 6,
      },
    }

    render(<MagePlayer sceneBlob={sceneBlob} />)

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

  it('pauses playback and clears audio when the last playlist track is removed', async () => {
    const controller = createController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const onlyTrack = {
      duration: 185,
      id: 'track-1',
      name: 'track-one.mp3',
      sourcePath: 'blob:track-one',
      sourceType: 'device' as const,
    }
    const sceneBlob = {
      visualizer: {
        skyboxPreset: 6,
      },
    }

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

    const firstTrack = {
      duration: 185,
      id: 'track-1',
      name: 'track-one.mp3',
      sourcePath: 'blob:track-one',
      sourceType: 'device' as const,
    }
    const secondTrack = {
      duration: 120,
      id: 'track-2',
      name: 'track-two.mp3',
      sourcePath: 'blob:track-two',
      sourceType: 'device' as const,
    }
    const onSelectedTrackChange = vi.fn()
    const sceneBlob = {
      visualizer: {
        skyboxPreset: 6,
      },
    }

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

    const firstTrack = {
      duration: 185,
      id: 'track-1',
      name: 'track-one.mp3',
      sourcePath: 'blob:track-one',
      sourceType: 'device' as const,
    }
    const secondTrack = {
      duration: 120,
      id: 'track-2',
      name: 'track-two.mp3',
      sourcePath: 'blob:track-two',
      sourceType: 'device' as const,
    }
    const onSelectedTrackChange = vi.fn()
    const sceneBlob = {
      visualizer: {
        skyboxPreset: 6,
      },
    }

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

    const firstTrack = {
      duration: 185,
      id: 'track-1',
      name: 'track-one.mp3',
      sourcePath: 'blob:track-one',
      sourceType: 'device' as const,
    }
    const secondTrack = {
      duration: 120,
      id: 'track-2',
      name: 'track-two.mp3',
      sourcePath: 'blob:track-two',
      sourceType: 'device' as const,
    }
    const thirdTrack = {
      duration: 95,
      id: 'track-3',
      name: 'track-three.mp3',
      sourcePath: 'blob:track-three',
      sourceType: 'device' as const,
    }
    const onSelectedTrackChange = vi.fn()
    const sceneBlob = {
      visualizer: {
        skyboxPreset: 6,
      },
    }

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

  it('shows a recoverable audio error when the selected playlist track fails to load', async () => {
    const controller = createController({
      loadAudio: vi.fn(async () => {
        throw new Error('Audio could not be loaded from the configured source.')
      }),
    })

    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    const sceneBlob = {
      audioPath: '/audio/crimson-reactor.mp3',
      visualizer: {
        skyboxPreset: 6,
      },
    }

    render(<MagePlayer sceneBlob={sceneBlob} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Audio could not be loaded from the configured source.',
    )
  })

  it('suppresses playback controls while the player is empty', async () => {
    const controller = createController()
    vi.mocked(createMagePlayer).mockResolvedValue(controller)

    render(<MagePlayer sceneBlob={null} />)

    expect(await screen.findByText('No scene selected.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /scene playback/i })).not.toBeInTheDocument()
  })
})

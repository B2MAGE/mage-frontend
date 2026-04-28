import { vi } from 'vitest'
import {
  type MagePlayerAudioState,
  type MagePlayerController,
  type MagePlayerPlaybackState,
} from './infrastructure/engineAdapter'

export function buildMagePlayerTrack(
  overrides: Partial<{
    duration: number
    id: string
    name: string
    sourcePath: string
    sourceType: 'device'
  }> = {},
) {
  return {
    duration: 185,
    id: 'track-1',
    name: 'track-one.mp3',
    sourcePath: 'blob:track-one',
    sourceType: 'device' as const,
    ...overrides,
  }
}

export function buildMagePlayerSceneBlob(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    visualizer: {
      skyboxPreset: 6,
    },
    ...overrides,
  }
}

export function buildMagePlayerController(
  overrides: Partial<MagePlayerController> = {},
): MagePlayerController {
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
    captureFramePreview: vi.fn(
      async () =>
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j+7sAAAAASUVORK5CYII=',
    ),
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

import type { MagePlayerAudioState } from './infrastructure/engineAdapter'

export type MagePlayerStatus = 'empty' | 'loading' | 'ready' | 'error'

export const EMPTY_AUDIO_STATE: MagePlayerAudioState = {
  currentTime: 0,
  duration: 0,
  hasSource: false,
  isLoaded: false,
  sourcePath: null,
  volume: 1,
}

export function buildMagePlayerClassName(baseClassName: string, nextClassName?: string) {
  return nextClassName ? `${baseClassName} ${nextClassName}` : baseClassName
}

export function readMagePlayerErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return 'MAGE could not render this scene.'
}

export function audioStatesMatch(currentState: MagePlayerAudioState, nextState: MagePlayerAudioState) {
  return (
    currentState.currentTime === nextState.currentTime &&
    currentState.duration === nextState.duration &&
    currentState.hasSource === nextState.hasSource &&
    currentState.isLoaded === nextState.isLoaded &&
    currentState.sourcePath === nextState.sourcePath &&
    currentState.volume === nextState.volume
  )
}

export function formatAudioTime(seconds: number | null) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(seconds ?? 0, 0) : 0
  const roundedSeconds = Math.floor(safeSeconds)
  const hours = Math.floor(roundedSeconds / 3600)
  const minutes = Math.floor((roundedSeconds % 3600) / 60)
  const remainingSeconds = roundedSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

export function createPlaylistTrackId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `track-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function readAudioFileDuration(sourcePath: string) {
  return new Promise<number>((resolve) => {
    const probe = document.createElement('audio')
    let timeoutId = 0

    function cleanup() {
      window.clearTimeout(timeoutId)
      probe.removeEventListener('loadedmetadata', handleLoadedMetadata)
      probe.removeEventListener('error', handleError)
      probe.src = ''
    }

    function handleLoadedMetadata() {
      const duration = Number.isFinite(probe.duration) ? Math.max(probe.duration, 0) : 0
      cleanup()
      resolve(duration)
    }

    function handleError() {
      cleanup()
      resolve(0)
    }

    probe.preload = 'metadata'
    probe.addEventListener('loadedmetadata', handleLoadedMetadata)
    probe.addEventListener('error', handleError)
    timeoutId = window.setTimeout(handleError, 300)
    probe.src = sourcePath
  })
}

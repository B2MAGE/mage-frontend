import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  createMagePlayer,
  type MagePlayerController,
  type MagePlayerPlaybackState,
  type MageSceneBlob,
} from '../lib/magePlayerAdapter'

type MagePlayerStatus = 'empty' | 'loading' | 'ready' | 'error'

type MagePlayerProps = {
  ariaLabel?: string
  className?: string
  initialPlayback?: MagePlayerPlaybackState
  log?: boolean
  sceneBlob: MageSceneBlob | null | undefined
}

function buildClassName(baseClassName: string, nextClassName?: string) {
  return nextClassName ? `${baseClassName} ${nextClassName}` : baseClassName
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return 'MAGE could not render this scene.'
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8 5.5v13L18.5 12 8 5.5Z" fill="currentColor" />
    </svg>
  )
}

export function MagePlayer({
  ariaLabel = 'MAGE scene preview',
  className,
  initialPlayback = 'playing',
  log = false,
  sceneBlob,
}: MagePlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const playerRef = useRef<MagePlayerController | null>(null)
  const latestSceneBlobRef = useRef<MageSceneBlob | null | undefined>(sceneBlob)
  const requestedPlaybackRef = useRef<MagePlayerPlaybackState>(initialPlayback)

  const [loadedSceneBlob, setLoadedSceneBlob] = useState<MageSceneBlob | null>(null)
  const [playerVersion, setPlayerVersion] = useState(0)
  const [playbackState, setPlaybackState] = useState<MagePlayerPlaybackState>(initialPlayback)
  const [loadError, setLoadError] = useState<{ message: string; sceneBlob: MageSceneBlob } | null>(
    null,
  )

  useEffect(() => {
    latestSceneBlobRef.current = sceneBlob
  }, [sceneBlob])

  useEffect(() => {
    requestedPlaybackRef.current = initialPlayback
    setPlaybackState(initialPlayback)

    const player = playerRef.current

    if (!player) {
      return
    }

    setPlaybackState(player.setPlaybackState(initialPlayback))
  }, [initialPlayback])

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    let nextPlayer: MagePlayerController | null = null
    let isDisposed = false
    let animationFrameId = 0

    animationFrameId = window.requestAnimationFrame(() => {
      void (async () => {
        try {
          nextPlayer = await createMagePlayer(canvas, { log })

          if (isDisposed) {
            nextPlayer.dispose()
            return
          }

          playerRef.current = nextPlayer
          setPlaybackState(nextPlayer.setPlaybackState(requestedPlaybackRef.current))
          setPlayerVersion((currentVersion) => currentVersion + 1)
        } catch (error) {
          nextPlayer?.dispose()

          if (!isDisposed) {
            const currentSceneBlob = latestSceneBlobRef.current

            if (currentSceneBlob) {
              setLoadError({
                message: readErrorMessage(error),
                sceneBlob: currentSceneBlob,
              })
            }
          }
        }
      })()
    })

    return () => {
      isDisposed = true
      window.cancelAnimationFrame(animationFrameId)
      playerRef.current = null
      nextPlayer?.dispose()
    }
  }, [log])

  useEffect(() => {
    if (!sceneBlob) {
      return
    }

    const player = playerRef.current

    if (!player) {
      return
    }

    let isCancelled = false

    try {
      player.loadSceneBlob(sceneBlob)
      const nextPlaybackState = player.setPlaybackState(requestedPlaybackRef.current)

      queueMicrotask(() => {
        if (isCancelled) {
          return
        }

        setLoadError(null)
        setLoadedSceneBlob(sceneBlob)
        setPlaybackState(nextPlaybackState)
      })
    } catch (error) {
      queueMicrotask(() => {
        if (isCancelled) {
          return
        }

        setLoadError({
          message: readErrorMessage(error),
          sceneBlob,
        })
      })
    }

    return () => {
      isCancelled = true
    }
  }, [playerVersion, sceneBlob])

  const status: MagePlayerStatus =
    !sceneBlob
      ? 'empty'
      : loadError?.sceneBlob === sceneBlob
        ? 'error'
        : loadedSceneBlob === sceneBlob
          ? 'ready'
          : 'loading'

  let title = 'No scene selected.'
  let message = 'Pass a scene blob into this player to render it in the browser.'
  let role: 'alert' | 'status' = 'status'

  if (status === 'loading') {
    title = 'Loading scene preview.'
    message = 'Initializing the MAGE engine and applying the scene blob.'
  } else if (status === 'error') {
    title = 'Unable to render this scene.'
    message = loadError?.message ?? 'MAGE could not render this scene.'
    role = 'alert'
  }

  const playbackLabel = playbackState === 'playing' ? 'Pause' : 'Play'

  function handleTogglePlayback(event: ReactMouseEvent<HTMLButtonElement>) {
    const player = playerRef.current

    if (!player || status !== 'ready') {
      return
    }

    const nextPlaybackState = playbackState === 'playing' ? 'paused' : 'playing'
    setPlaybackState(player.setPlaybackState(nextPlaybackState))

    // Mouse clicks should not leave the hover bar pinned open via :focus-within.
    // Keep keyboard-triggered activation focused so keyboard users can continue interacting.
    if (event.detail > 0) {
      const controlButton = event.currentTarget

      window.requestAnimationFrame(() => {
        controlButton.blur()
      })
    }
  }

  return (
    <section className={buildClassName('mage-player', className)} data-state={status}>
      <div className="mage-player__viewport" aria-busy={status === 'loading'}>
        <canvas aria-label={ariaLabel} className="mage-player__canvas" ref={canvasRef} />
        {status === 'ready' ? (
          <div className="mage-player__controls">
            <button
              aria-label={`${playbackLabel} scene playback`}
              aria-pressed={playbackState === 'playing'}
              className="mage-player__control-button"
              onClick={handleTogglePlayback}
              title={`${playbackLabel} scene playback`}
              type="button"
            >
              <span className="mage-player__control-icon">
                {playbackState === 'playing' ? <PauseIcon /> : <PlayIcon />}
              </span>
            </button>
          </div>
        ) : null}
        {status !== 'ready' ? (
          <div className="mage-player__overlay" role={role} aria-live="polite">
            <div className="mage-player__overlay-copy">
              <strong>{title}</strong>
              <p>{message}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

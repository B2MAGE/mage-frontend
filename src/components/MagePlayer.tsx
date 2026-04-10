import { useEffect, useRef, useState } from 'react'
import { createMagePlayer, type MagePlayerController, type MageSceneBlob } from '../lib/magePlayerAdapter'

type MagePlayerStatus = 'empty' | 'loading' | 'ready' | 'error'

type MagePlayerProps = {
  ariaLabel?: string
  className?: string
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

  return 'MAGE could not render this preset.'
}

export function MagePlayer({
  ariaLabel = 'MAGE preset preview',
  className,
  log = false,
  sceneBlob,
}: MagePlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const playerRef = useRef<MagePlayerController | null>(null)
  const latestSceneBlobRef = useRef<MageSceneBlob | null | undefined>(sceneBlob)

  const [loadedSceneBlob, setLoadedSceneBlob] = useState<MageSceneBlob | null>(null)
  const [playerVersion, setPlayerVersion] = useState(0)
  const [loadError, setLoadError] = useState<{ message: string; sceneBlob: MageSceneBlob } | null>(
    null,
  )

  useEffect(() => {
    latestSceneBlobRef.current = sceneBlob
  }, [sceneBlob])

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

      queueMicrotask(() => {
        if (isCancelled) {
          return
        }

        setLoadError(null)
        setLoadedSceneBlob(sceneBlob)
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

  let title = 'No preset selected.'
  let message = 'Pass a scene blob into this player to render it in the browser.'
  let role: 'alert' | 'status' = 'status'

  if (status === 'loading') {
    title = 'Loading preset preview.'
    message = 'Initializing the MAGE engine and applying the preset scene blob.'
  } else if (status === 'error') {
    title = 'Unable to render this preset.'
    message = loadError?.message ?? 'MAGE could not render this preset.'
    role = 'alert'
  }

  return (
    <section className={buildClassName('mage-player', className)} data-state={status}>
      <div className="mage-player__viewport" aria-busy={status === 'loading'}>
        <canvas aria-label={ariaLabel} className="mage-player__canvas" ref={canvasRef} />
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

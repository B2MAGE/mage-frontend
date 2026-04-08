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

  const [loadedSceneBlob, setLoadedSceneBlob] = useState<MageSceneBlob | null>(null)
  const [loadError, setLoadError] = useState<{ message: string; sceneBlob: MageSceneBlob } | null>(
    null,
  )

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas || !sceneBlob) {
      return
    }

    let currentPlayer: MagePlayerController | null = null
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

          nextPlayer.loadSceneBlob(sceneBlob)

          if (isDisposed) {
            nextPlayer.dispose()
            return
          }

          currentPlayer = nextPlayer
          setLoadError(null)
          setLoadedSceneBlob(sceneBlob)
        } catch (error) {
          nextPlayer?.dispose()

          if (!isDisposed) {
            setLoadError({
              message: readErrorMessage(error),
              sceneBlob,
            })
          }
        }
      })()
    })

    return () => {
      isDisposed = true
      window.cancelAnimationFrame(animationFrameId)
      currentPlayer?.dispose()
    }
  }, [log, sceneBlob])

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

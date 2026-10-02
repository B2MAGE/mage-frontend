import { useEffect, useRef, useState } from 'react'
import { createMagePlayer, MagePlayerLoading, type MagePlayerController } from '@modules/player'
import { useAnimatedSceneThumbnailsEnabled } from '@shared/preferences'
import { BRAND_SCENE } from './brandScenePreset'
import './brandScene.css'

type SceneStatus = 'loading' | 'ready' | 'error'

// Keep the thumbnail preview rhythm, at half tempo (66 BPM for seed 73).
const BRAND_BEAT_TEMPO_SCALE = 0.5

type BrandSceneProps = {
  className?: string
  reactToBeat?: boolean
}

export function BrandScene({ className, reactToBeat = true }: BrandSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const animationEnabled = useAnimatedSceneThumbnailsEnabled()
  const [renderState, setRenderState] = useState<{ animationEnabled: boolean; reactToBeat: boolean; status: SceneStatus }>({
    animationEnabled,
    reactToBeat,
    status: 'loading',
  })
  // A preference change replaces the canvas; show its loader immediately,
  // including before IntersectionObserver reports that the new canvas is visible.
  const status = renderState.animationEnabled === animationEnabled && renderState.reactToBeat === reactToBeat
    ? renderState.status
    : 'loading'

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Disposing MAGE loses its WebGL context, so every initialization needs a
    // fresh canvas (including preference changes and StrictMode remounts).
    const canvas = document.createElement('canvas')
    canvas.className = 'brand-scene__canvas'
    canvas.setAttribute('aria-hidden', 'true')
    container.append(canvas)

    const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let visible = typeof IntersectionObserver === 'undefined'
    let disposed = false
    let failed = false
    let pending = false
    let ready = false
    let playing = false
    let controller: MagePlayerController | null = null

    function setStatus(nextStatus: SceneStatus) {
      setRenderState({ animationEnabled, reactToBeat, status: nextStatus })
    }

    function isVisible() {
      return !disposed && !failed && visible && document.visibilityState !== 'hidden'
    }

    function releaseController() {
      const previous = controller
      controller = null
      previous?.dispose()
    }

    function fail() {
      if (disposed || failed) return
      failed = true
      delete canvas.dataset.ready
      setStatus('error')
      releaseController()
    }

    function updatePlayback() {
      if (!controller) return
      const nextPlaying = ready && isVisible() && animationEnabled && !motionPreference?.matches
      if (playing === nextPlaying) return
      // The homepage keeps the shader's gentle drift without synthetic audio.
      controller.setSyntheticPreview(nextPlaying && reactToBeat, 73, BRAND_BEAT_TEMPO_SCALE)
      controller.setPlaybackState(nextPlaying ? 'playing' : 'paused')
      playing = nextPlaying
    }

    async function syncPlayback() {
      if (disposed || failed) return
      try {
        if (controller) {
          updatePlayback()
          return
        }
        if (pending || !isVisible()) return
        pending = true
        setStatus('loading')
        // Supersample the decorative artwork only; other players keep their normal
        // device pixel ratio and GPU cost.
        const created = await createMagePlayer(canvas, { pixelRatio: 2, mouseInteractions: true })
        if (disposed || failed) {
          created.dispose()
          return
        }
        controller = created
        controller.loadSceneBlob(BRAND_SCENE)
        controller.setSyntheticPreview(false, 73, BRAND_BEAT_TEMPO_SCALE)
        controller.setPlaybackState('paused')

        // Capture renders one real frame into the MAGE canvas without advancing
        // time. Motion-disabled visitors see this same frame, not a substitute.
        const frame = await controller.captureFramePreview?.()
        if (disposed || failed) return
        if (!frame) throw new Error('MAGE could not render the scene preview.')
        ready = true
        canvas.dataset.ready = 'true'
        setStatus('ready')
        updatePlayback()
      } catch {
        fail()
      } finally {
        pending = false
      }
    }

    const sync = () => { void syncPlayback() }
    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
          visible = entry?.isIntersecting ?? false
          sync()
        })
    observer?.observe(container)
    motionPreference?.addEventListener?.('change', sync)
    document.addEventListener('visibilitychange', sync)
    canvas.addEventListener('webglcontextlost', fail)
    sync()

    return () => {
      disposed = true
      observer?.disconnect()
      motionPreference?.removeEventListener?.('change', sync)
      document.removeEventListener('visibilitychange', sync)
      canvas.removeEventListener('webglcontextlost', fail)
      releaseController()
      canvas.remove()
    }
  }, [animationEnabled, reactToBeat])

  return (
    <div
      className={['brand-scene', className].filter(Boolean).join(' ')}
      ref={containerRef}
      role="group"
      aria-label="A MAGE scene of gently moving violet and teal rings"
      aria-busy={status === 'loading'}
    >
      {status === 'loading' ? <MagePlayerLoading /> : status === 'error' ? (
        <div className="mage-player__overlay" role="alert" aria-live="polite">
          <div className="mage-player__overlay-copy">
            <strong>Unable to render this scene.</strong>
            <p>MAGE could not render this scene.</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

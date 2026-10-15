import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type FocusEvent, type PointerEvent } from 'react'
import { availabilityStatusTarget, availabilityTarget, sceneRecovery, sceneRecoveryKey, useSceneAvailability, type MageSceneBlob } from '@modules/player'
import { useAnimatedSceneThumbnailsEnabled } from '@shared/preferences'
import {
  createSceneHoverPreviewRegistrationId,
  sceneHoverPreviewCoordinator,
} from './sceneHoverPreviewCoordinator'

type UseSceneHoverPreviewOptions = {
  sceneBlob: MageSceneBlob | null | undefined
  resolveSource?: (signal: AbortSignal) => Promise<MageSceneBlob | null>
  sceneId: number
  seed: number
}

function mediaQueryMatches(query: string, fallback: boolean) {
  return typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback
}

function motionIsAllowed() {
  return !mediaQueryMatches('(prefers-reduced-motion: reduce)', false)
}

function pointerPreviewIsAllowed() {
  return mediaQueryMatches('(hover: hover) and (pointer: fine)', true)
}

export function useSceneHoverPreview({ sceneBlob, resolveSource, sceneId, seed }: UseSceneHoverPreviewOptions) {
  const preferenceEnabled = useAnimatedSceneThumbnailsEnabled()
  // Summaries use metadata-only status until deliberate preview intent loads
  // their source. Explicit null remains withheld and must never be loaded here.
  const target = useMemo(() => sceneBlob ? availabilityTarget(sceneId, sceneBlob) : availabilityStatusTarget(sceneId), [sceneId, sceneBlob])
  const availability = useSceneAvailability(target)
  useSyncExternalStore(sceneRecovery.subscribe, sceneRecovery.getSnapshot, sceneRecovery.getSnapshot)
  const recoveryKey = useMemo(() => sceneRecoveryKey(sceneBlob, sceneId), [sceneBlob, sceneId])
  const hasPreviewSource = !!sceneBlob || (sceneBlob === undefined && !!resolveSource)
  const recoveryPaused = !hasPreviewSource || sceneRecovery.isSafeMode() || (!!sceneBlob && (!recoveryKey || !!sceneRecovery.getBlock(recoveryKey)))
  const registrationIdRef = useRef(createSceneHoverPreviewRegistrationId())
  const thumbnailRef = useRef<HTMLDivElement | null>(null)
  const pointerInsideRef = useRef(false)
  const focusedRef = useRef(false)
  const visibleRef = useRef(true)
  const clearPreviewIntent = useCallback(() => {
    pointerInsideRef.current = false
    focusedRef.current = false
  }, [])

  const previewIsWanted = useCallback(() =>
    hasPreviewSource && availability.allowed &&
    preferenceEnabled &&
    motionIsAllowed() &&
    visibleRef.current &&
    (focusedRef.current || (pointerInsideRef.current && pointerPreviewIsAllowed())),
  [preferenceEnabled, hasPreviewSource, availability.allowed])

  const syncPreview = useCallback(() => {
    const id = registrationIdRef.current
    if (recoveryPaused) {
      // Clearing a block in another player must not restart a focused preview.
      clearPreviewIntent()
      sceneHoverPreviewCoordinator.cancel(id)
      return
    }
    if (previewIsWanted()) {
      sceneHoverPreviewCoordinator.schedule(id)
    } else {
      sceneHoverPreviewCoordinator.cancel(id)
    }
  }, [previewIsWanted, recoveryPaused, clearPreviewIntent])

  useEffect(() => {
    const target = thumbnailRef.current
    if (!target || !hasPreviewSource) {
      return
    }

    const id = registrationIdRef.current
    sceneHoverPreviewCoordinator.register(id, { sceneBlob: sceneBlob ?? null, resolveSource, sceneId, seed, target, shouldPreview: previewIsWanted, onRecoveryPause: clearPreviewIntent })

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)')
    const handleCapabilityChange = () => syncPreview()
    const handleVisibilityChange = () => syncPreview()
    reducedMotion?.addEventListener?.('change', handleCapabilityChange)
    finePointer?.addEventListener?.('change', handleCapabilityChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
          visibleRef.current = entry?.isIntersecting ?? false
          syncPreview()
        })
    observer?.observe(target)

    syncPreview()

    return () => {
      observer?.disconnect()
      reducedMotion?.removeEventListener?.('change', handleCapabilityChange)
      finePointer?.removeEventListener?.('change', handleCapabilityChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      sceneHoverPreviewCoordinator.unregister(id)
    }
  }, [sceneBlob, resolveSource, hasPreviewSource, sceneId, seed, syncPreview, previewIsWanted, clearPreviewIntent])

  useEffect(() => {
    syncPreview()
  }, [preferenceEnabled, syncPreview])

  const onPointerEnter = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') {
      return
    }

    pointerInsideRef.current = true
    syncPreview()
  }, [syncPreview])

  const onPointerLeave = useCallback(() => {
    pointerInsideRef.current = false
    syncPreview()
  }, [syncPreview])

  const onFocus = useCallback(() => {
    focusedRef.current = true
    syncPreview()
  }, [syncPreview])

  const onBlur = useCallback((event: FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return
    }

    focusedRef.current = false
    syncPreview()
  }, [syncPreview])

  return {
    onBlur,
    onFocus,
    onPointerEnter,
    onPointerLeave,
    recoveryPaused,
    availabilityChecking: availability.code === 'CHECKING',
    availabilityPaused: !availability.allowed,
    thumbnailRef,
  }
}

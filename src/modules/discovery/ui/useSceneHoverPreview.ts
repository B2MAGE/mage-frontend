import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type FocusEvent, type PointerEvent } from 'react'
import { sceneRecovery, sceneRecoveryKey, type MageSceneBlob } from '@modules/player'
import { useAnimatedSceneThumbnailsEnabled } from '@shared/preferences'
import {
  createSceneHoverPreviewRegistrationId,
  sceneHoverPreviewCoordinator,
} from './sceneHoverPreviewCoordinator'

type UseSceneHoverPreviewOptions = {
  sceneBlob: MageSceneBlob
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

export function useSceneHoverPreview({ sceneBlob, sceneId, seed }: UseSceneHoverPreviewOptions) {
  const preferenceEnabled = useAnimatedSceneThumbnailsEnabled()
  useSyncExternalStore(sceneRecovery.subscribe, sceneRecovery.getSnapshot, sceneRecovery.getSnapshot)
  const recoveryKey = useMemo(() => sceneRecoveryKey(sceneBlob, sceneId), [sceneBlob, sceneId])
  const recoveryPaused = !recoveryKey || sceneRecovery.isSafeMode() || !!sceneRecovery.getAutomaticBlock(recoveryKey)
  const registrationIdRef = useRef(createSceneHoverPreviewRegistrationId())
  const thumbnailRef = useRef<HTMLDivElement | null>(null)
  const pointerInsideRef = useRef(false)
  const focusedRef = useRef(false)
  const visibleRef = useRef(true)

  const previewIsWanted = useCallback(() =>
    preferenceEnabled &&
    motionIsAllowed() &&
    visibleRef.current &&
    (focusedRef.current || (pointerInsideRef.current && pointerPreviewIsAllowed())),
  [preferenceEnabled])

  const syncPreview = useCallback(() => {
    const id = registrationIdRef.current
    if (recoveryPaused) {
      // Clearing a block in another player must not restart a focused preview.
      pointerInsideRef.current = false
      focusedRef.current = false
      sceneHoverPreviewCoordinator.cancel(id)
      return
    }
    if (previewIsWanted()) {
      sceneHoverPreviewCoordinator.schedule(id)
    } else {
      sceneHoverPreviewCoordinator.cancel(id)
    }
  }, [previewIsWanted, recoveryPaused])

  useEffect(() => {
    const target = thumbnailRef.current
    if (!target) {
      return
    }

    const id = registrationIdRef.current
    sceneHoverPreviewCoordinator.register(id, { sceneBlob, sceneId, seed, target, shouldPreview: previewIsWanted })

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
  }, [sceneBlob, sceneId, seed, syncPreview, previewIsWanted])

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
    thumbnailRef,
  }
}

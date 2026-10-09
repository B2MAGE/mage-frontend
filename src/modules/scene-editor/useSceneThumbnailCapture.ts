import { useCallback, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { sceneAvailabilityStore, type availabilityTarget } from '@modules/player'
import type { CreateSceneFormErrors } from './types'
import { buildCapturedThumbnailFile, validateThumbnailFile } from './utils'

type Args = {
  availabilityTarget: ReturnType<typeof availabilityTarget>
  revision: string
  canPreviewScene: boolean
  sceneDraftError: string | null | undefined
  isPreviewPending: boolean
  onCapture: (file: File, previewUrl: string) => void
  setErrors: Dispatch<SetStateAction<CreateSceneFormErrors>>
}

/** Capture ownership belongs to the draft revision, not to the mounted player. */
export function useSceneThumbnailCapture({ availabilityTarget, revision, canPreviewScene,
  sceneDraftError, isPreviewPending, onCapture, setErrors }: Args) {
  const captureFrame = useRef<(() => Promise<string | null>) | null>(null)
  const generation = useRef(0)
  const inFlight = useRef(false)
  const [isCapturingThumbnail, setIsCapturingThumbnail] = useState(false)
  const registerCaptureFramePreview = useCallback((capture: (() => Promise<string | null>) | null) => {
    captureFrame.current = capture
  }, [])
  useLayoutEffect(() => {
    generation.current += 1
    inFlight.current = false
    setIsCapturingThumbnail(false)
    const unsubscribe = sceneAvailabilityStore.subscribe(availabilityTarget, () => {
      const availability = sceneAvailabilityStore.getSnapshot(availabilityTarget)
      if (!availability.allowed && availability.code !== 'CHECKING') {
        generation.current += 1
        inFlight.current = false
        setIsCapturingThumbnail(false)
      }
    })
    return () => { unsubscribe(); generation.current += 1; inFlight.current = false }
  }, [availabilityTarget, revision, sceneDraftError, isPreviewPending])

  async function captureThumbnailFromPreview() {
    if (!canPreviewScene) throw new Error('Load a valid scene before capturing a new thumbnail.')
    if (sceneDraftError) throw new Error('Fix the scene settings before capturing a thumbnail.')
    if (isPreviewPending || !captureFrame.current) throw new Error('Wait for the live preview to finish loading before capturing a thumbnail.')
    if (!sceneAvailabilityStore.isAllowed(availabilityTarget)) throw new Error('Thumbnail capture is unavailable while scene playback is paused.')
    const started = generation.current
    const previewUrl = await captureFrame.current()
    if (started !== generation.current || !sceneAvailabilityStore.isAllowed(availabilityTarget)) {
      throw new Error('Thumbnail capture was cancelled because the draft or scene availability changed.')
    }
    if (!previewUrl) throw new Error("We couldn't capture the current preview frame. Let the preview finish loading and try again.")
    const file = buildCapturedThumbnailFile(previewUrl)
    const error = validateThumbnailFile(file)
    if (error) throw new Error(error)
    onCapture(file, previewUrl)
    return file
  }

  async function handleThumbnailCaptureRequest() {
    if (inFlight.current || !sceneAvailabilityStore.isAllowed(availabilityTarget)) return
    inFlight.current = true
    const started = generation.current
    setIsCapturingThumbnail(true)
    try { await captureThumbnailFromPreview() }
    catch (error) {
      if (started === generation.current) setErrors(current => ({ ...current, form: undefined,
        thumbnail: error instanceof Error ? error.message : 'The live preview could not be captured right now. Please try again.' }))
    } finally {
      if (started === generation.current) { inFlight.current = false; setIsCapturingThumbnail(false) }
    }
  }
  return { captureThumbnailFromPreview, handleThumbnailCaptureRequest, isCapturingThumbnail, registerCaptureFramePreview }
}

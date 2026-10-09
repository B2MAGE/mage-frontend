import { useLayoutEffect, useRef, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { AuthenticatedFetch } from '@auth'
import { parseApiError } from '@shared/lib'
import { assertSceneRequestBudget } from '@modules/player'
import { replaceSceneThumbnail, uploadNewSceneThumbnail } from './sceneThumbnailUpload'
import type { CreateSceneFormErrors, SceneEditorSubmissionMode, SceneEditorStateSnapshot } from './types'
import { buildSceneSubmissionDocument, validateForm } from './utils'
import { describeSceneValidationError, sceneSubmissionErrors } from './sceneValidation'

function serializeSceneRequest(value: Record<string, unknown>) {
  assertSceneRequestBudget(value)
  return JSON.stringify(value)
}

type UseSceneEditorSubmissionArgs = SceneEditorStateSnapshot & {
  authenticatedFetch: AuthenticatedFetch
  captureThumbnailIfMissing: () => Promise<File>
  mode: SceneEditorSubmissionMode
  onComplete: () => void
  setErrors: Dispatch<SetStateAction<CreateSceneFormErrors>>
  setIsSubmitting: Dispatch<SetStateAction<boolean>>
}

/** Each attempt saves one immutable draft. Edits and disposal cancel its side effects. */
export function useSceneEditorSubmission({ authenticatedFetch, captureThumbnailIfMissing,
  description, mode, name, onComplete, sceneData, sceneDataText, selectedTagIds,
  setErrors, setIsSubmitting, tagsError, tagsLoading, thumbnailFile }: UseSceneEditorSubmissionArgs) {
  const draftKey = JSON.stringify([mode, name, description, sceneDataText, selectedTagIds])
  const active = useRef<AbortController | null>(null)
  useLayoutEffect(() => {
    setIsSubmitting(false)
    return () => { active.current?.abort(); active.current = null }
  }, [draftKey, setIsSubmitting])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (active.current) return
    if (tagsLoading || tagsError) {
      setErrors({ tags: tagsError ?? 'Wait for tags to finish loading before saving the scene.' })
      return
    }
    const { errors, parsedSceneData } = validateForm(name.trim(), sceneDataText)
    if (Object.keys(errors).length) { setErrors(errors); return }
    if (parsedSceneData?.kind === 'template' && sceneData.kind !== 'template') {
      setErrors({ form: 'Confirm replacing the custom scene with this template, or cancel to keep your custom source.' })
      return
    }
    let request: Record<string, unknown>
    try {
      request = { name: name.trim(), description: description.trim() || null,
        sceneData: buildSceneSubmissionDocument(parsedSceneData ?? sceneData), tagIds: [...selectedTagIds] }
      serializeSceneRequest(request)
    } catch (error) { setErrors({ form: describeSceneValidationError(error) }); return }

    const attempt = new AbortController()
    active.current = attempt
    const isCurrent = () => active.current === attempt && !attempt.signal.aborted
    setIsSubmitting(true)
    setErrors({})
    try {
      if (mode.type === 'create') {
        let file = thumbnailFile
        if (!file) {
          try { file = await captureThumbnailIfMissing() }
          catch (error) {
            if (isCurrent()) setErrors({ thumbnail: describeSceneValidationError(error) })
            return
          }
        }
        if (!isCurrent()) return
        const objectKey = await uploadNewSceneThumbnail(authenticatedFetch, file, attempt.signal)
        if (!isCurrent()) return
        request = { ...request, thumbnailObjectKey: objectKey }
      }
      const response = await authenticatedFetch(mode.type === 'edit' ? `/scenes/${mode.sceneId}` : '/scenes', {
        method: mode.type === 'edit' ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: serializeSceneRequest(request), signal: attempt.signal,
      })
      if (!isCurrent()) return
      if (!response.ok) {
        const error = await parseApiError(response)
        if (isCurrent()) setErrors(sceneSubmissionErrors(response.status, error))
        return
      }
      if (mode.type === 'edit' && thumbnailFile) {
        await replaceSceneThumbnail(authenticatedFetch, mode.sceneId, thumbnailFile, attempt.signal)
        if (!isCurrent()) return
      }
      onComplete()
    } catch (error) {
      if (isCurrent()) setErrors({ form: describeSceneValidationError(error) })
    } finally {
      if (isCurrent()) { active.current = null; setIsSubmitting(false) }
    }
  }
  return { handleSubmit }
}

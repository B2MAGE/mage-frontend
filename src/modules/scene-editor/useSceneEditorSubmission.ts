import { useLayoutEffect, useRef, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import type { AuthenticatedFetch } from '@auth'
import { parseApiError } from '@shared/lib'
import { assertSceneRequestBudget } from '@modules/player'
import { replaceSceneThumbnail, uploadNewSceneThumbnail } from './sceneThumbnailUpload'
import type { CreateSceneFormErrors, SceneEditorSubmissionMode, SceneEditorStateSnapshot } from './types'
import { buildSceneSubmissionDocument, validateForm } from './utils'
import { describeSceneValidationError, sceneSubmissionErrors } from './sceneValidation'
import type { SceneDraftSaveContext } from './sceneDraftRecovery'

function serializeSceneRequest(value: Record<string, unknown>) {
  assertSceneRequestBudget(value)
  return JSON.stringify(value)
}

type UseSceneEditorSubmissionArgs = SceneEditorStateSnapshot & {
  authenticatedFetch: AuthenticatedFetch
  captureThumbnailIfMissing: () => Promise<File>
  mode: SceneEditorSubmissionMode
  onComplete: () => void
  saveContext: SceneDraftSaveContext
  onSaveContextChange: (context: SceneDraftSaveContext) => void
  setErrors: Dispatch<SetStateAction<CreateSceneFormErrors>>
  setIsSubmitting: Dispatch<SetStateAction<boolean>>
}

type SaveAttempt = {
  controller: AbortController
  draftKey: string
  dispatched: boolean
  thumbnailController?: AbortController
}

/** A dispatched save must settle: cancellation cannot roll back a server transaction. */
export function useSceneEditorSubmission({ authenticatedFetch, captureThumbnailIfMissing,
  description, mode, name, onComplete, sceneData, sceneDataText, selectedTagIds,
  setErrors, setIsSubmitting, tagsError, tagsLoading, thumbnailFile, saveContext, onSaveContextChange }: UseSceneEditorSubmissionArgs) {
  const draftKey = JSON.stringify([mode, name, description, sceneDataText, selectedTagIds])
  const latestDraftKey = useRef(draftKey)
  const active = useRef<SaveAttempt | null>(null)
  const { savedSceneId: createdSceneId, expectedRevision, saveNeedsReview } = saveContext
  useLayoutEffect(() => {
    latestDraftKey.current = draftKey
    const attempt = active.current
    if (!attempt || attempt.draftKey === draftKey) return
    attempt.thumbnailController?.abort()
    if (!attempt.dispatched) {
      attempt.controller.abort()
      active.current = null
      setIsSubmitting(false)
    }
  }, [draftKey, setIsSubmitting])
  useLayoutEffect(() => () => {
    active.current?.controller.abort()
    active.current?.thumbnailController?.abort()
    active.current = null
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (active.current || saveNeedsReview) return
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

    const attempt: SaveAttempt = { controller: new AbortController(), draftKey, dispatched: false }
    active.current = attempt
    const isOwned = () => active.current === attempt && !attempt.controller.signal.aborted
    const isCurrent = () => isOwned() && latestDraftKey.current === attempt.draftKey
    const savedSceneId = mode.type === 'edit' ? mode.sceneId : createdSceneId
    const isCreate = savedSceneId === null
    if (!isCreate && (expectedRevision === null || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) {
      active.current = null
      setErrors({ form: 'Reopen the saved scene to load its current revision. Your draft has been kept.' })
      return
    }
    if (!isCreate) request = { ...request, expectedRevision }
    let sceneSaved = false
    const retainNewerDraft = () => setErrors(current => ({ ...current,
      form: 'Your earlier version was saved. Your newer changes are still here; save again to update the scene.' }))
    setIsSubmitting(true)
    setErrors({})
    try {
      if (isCreate) {
        let file = thumbnailFile
        if (!file) {
          try { file = await captureThumbnailIfMissing() }
          catch (error) {
            if (isCurrent()) setErrors({ thumbnail: describeSceneValidationError(error) })
            return
          }
        }
        if (!isCurrent()) return
        const objectKey = await uploadNewSceneThumbnail(authenticatedFetch, file, attempt.controller.signal)
        if (!isCurrent()) return
        request = { ...request, thumbnailObjectKey: objectKey }
      }
      attempt.dispatched = true
      // Persist the uncertain create before dispatch: a page interruption must not permit a second POST.
      if (isCreate) onSaveContextChange({ savedSceneId: null, expectedRevision: null, saveNeedsReview: true })
      const response = await authenticatedFetch(isCreate ? '/scenes' : `/scenes/${savedSceneId}`, {
        method: isCreate ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' },
        body: serializeSceneRequest(request), signal: attempt.controller.signal,
      })
      if (!isOwned()) return
      if (!response.ok) {
        const error = await parseApiError(response)
        if (isCreate) onSaveContextChange(saveContext)
        if (response.status === 409 && error?.code === 'SCENE_EDIT_CONFLICT') {
          onSaveContextChange({ ...saveContext, saveNeedsReview: true })
          setErrors(current => ({ ...current, form: 'This scene was changed in another editor. Your draft is still here. Export it or open the latest saved scene before saving again.' }))
          return
        }
        if (isCurrent()) setErrors(sceneSubmissionErrors(response.status, error))
        else if (isOwned()) setErrors(current => ({ ...current,
          form: 'The earlier save was rejected. Your newer changes are still here; save again to submit them.' }))
        return
      }
      sceneSaved = true
      const payload: unknown = await response.json().catch(() => null)
      if (!isOwned()) return
      const id = payload && typeof payload === 'object' && 'sceneId' in payload ? payload.sceneId : null
      const revision = payload && typeof payload === 'object' && 'revision' in payload ? payload.revision : null
      if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0
        || (!isCreate && id !== savedSceneId) || typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
        onSaveContextChange({ ...saveContext, saveNeedsReview: true })
        setErrors(current => ({ ...current,
          form: 'The scene was saved, but its current reference was missing. Your draft is still here. Open My Scenes to review the saved scene before saving again.' }))
        return
      }
      onSaveContextChange({ savedSceneId: mode.type === 'edit' ? null : id, expectedRevision: revision, saveNeedsReview: false })
      if (!isCurrent()) { retainNewerDraft(); return }
      if (!isCreate && thumbnailFile) {
        attempt.thumbnailController = new AbortController()
        await replaceSceneThumbnail(authenticatedFetch, savedSceneId!, thumbnailFile, attempt.thumbnailController.signal)
        if (!isCurrent()) { if (isOwned()) retainNewerDraft(); return }
      }
      onComplete()
    } catch (error) {
      if (!isOwned()) return
      if (sceneSaved && !isCurrent()) retainNewerDraft()
      else if (isCreate && attempt.dispatched) {
        // A lost response does not prove that POST failed; a second POST can duplicate it.
        onSaveContextChange({ ...saveContext, saveNeedsReview: true })
        setErrors(current => ({ ...current,
          form: 'We could not confirm whether the scene was created. Your draft is still here. Check My Scenes before creating another scene.' }))
      } else if (isCurrent()) setErrors({ form: describeSceneValidationError(error) })
      else setErrors(current => ({ ...current, form: 'We could not confirm the earlier save. Your newer changes are still here.' }))
    } finally {
      if (isOwned()) { active.current = null; setIsSubmitting(false) }
    }
  }
  return { handleSubmit, hasSavedScene: mode.type === 'edit' || createdSceneId !== null, saveNeedsReview }
}

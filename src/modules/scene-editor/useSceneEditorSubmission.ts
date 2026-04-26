import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { AuthenticatedFetch } from '@auth'
import { parseApiError } from '@shared/lib'
import { uploadNewSceneThumbnail } from './sceneThumbnailUpload'
import type {
  CreateSceneFormErrors,
  PendingTagAttachment,
  SceneEditorStateSnapshot,
  TagAttachmentFailure,
} from './types'
import { buildEffectiveSceneData, parseCreatedSceneId, validateForm } from './utils'

type UseSceneEditorSubmissionArgs = SceneEditorStateSnapshot & {
  authenticatedFetch: AuthenticatedFetch
  captureThumbnailIfMissing: () => Promise<File>
  onComplete: () => void
  setErrors: Dispatch<SetStateAction<CreateSceneFormErrors>>
  setIsSubmitting: Dispatch<SetStateAction<boolean>>
  setPendingTagAttachment: Dispatch<SetStateAction<PendingTagAttachment | null>>
}

async function attachTagsToScene(
  authenticatedFetch: AuthenticatedFetch,
  availableTags: Array<{ tagId: number; name: string }>,
  sceneId: number,
  tagIds: number[],
) {
  const failures: TagAttachmentFailure[] = []

  for (const tagId of tagIds) {
    const tag = availableTags.find((availableTag) => availableTag.tagId === tagId)

    if (!tag) {
      failures.push({
        tagId,
        tagName: `tag ${tagId}`,
      })
      continue
    }

    try {
      const response = await authenticatedFetch(`/scenes/${sceneId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tagId,
        }),
      })

      if (response.ok) {
        continue
      }

      const apiError = await parseApiError(response)

      if (
        response.status === 409 &&
        apiError?.code === 'SCENE_TAG_ALREADY_EXISTS'
      ) {
        continue
      }

      failures.push({
        tagId,
        tagName: tag.name,
      })
    } catch {
      failures.push({
        tagId,
        tagName: tag.name,
      })
    }
  }

  return failures
}

export function useSceneEditorSubmission({
  authenticatedFetch,
  availableTags,
  captureThumbnailIfMissing,
  description,
  isCameraAdvancedEnabled,
  isMotionAdvancedEnabled,
  name,
  onComplete,
  pendingTagAttachment,
  sceneData,
  sceneDataText,
  selectedTagIds,
  setErrors,
  setIsSubmitting,
  setPendingTagAttachment,
  thumbnailFile,
}: UseSceneEditorSubmissionArgs) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (pendingTagAttachment) {
      setIsSubmitting(true)
      setErrors({})

      try {
        const attachFailures = await attachTagsToScene(
          authenticatedFetch,
          availableTags,
          pendingTagAttachment.sceneId,
          pendingTagAttachment.tagIds,
        )

        if (attachFailures.length > 0) {
          setPendingTagAttachment({
            sceneId: pendingTagAttachment.sceneId,
            tagIds: attachFailures.map((failure) => failure.tagId),
          })
          setErrors({
            form: `Scene created, but we still couldn't attach ${attachFailures
              .map((failure) => failure.tagName)
              .join(', ')}. Submit again to retry attachment for the existing scene. Additional editor changes will not be saved in this retry state.`,
          })
          return
        }

        setPendingTagAttachment(null)
        onComplete()
      } finally {
        setIsSubmitting(false)
      }

      return
    }

    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    const { errors: nextErrors, parsedSceneData } = validateForm(
      trimmedName,
      sceneDataText,
    )

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    let effectiveThumbnailFile = thumbnailFile

    if (!effectiveThumbnailFile) {
      try {
        effectiveThumbnailFile = await captureThumbnailIfMissing()
      } catch (error) {
        setErrors({
          thumbnail:
            error instanceof Error && error.message.trim()
              ? error.message
              : 'Capture a thumbnail before creating the scene.',
        })
        return
      }
    }

    const sanitizedSceneData = buildEffectiveSceneData(
      parsedSceneData ?? sceneData,
      {
        isCameraAdvancedEnabled,
        isMotionAdvancedEnabled,
      },
    )

    setIsSubmitting(true)
    setErrors({})

    try {
      const thumbnailObjectKey =
        effectiveThumbnailFile
          ? await uploadNewSceneThumbnail(authenticatedFetch, effectiveThumbnailFile)
          : undefined

      const response = await authenticatedFetch('/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description: trimmedDescription || undefined,
          sceneData: sanitizedSceneData,
          thumbnailObjectKey,
        }),
      })

      if (!response.ok) {
        const apiError = await parseApiError(response)
        const backendDetails = apiError?.details ?? {}
        setErrors({
          description: backendDetails.description,
          name: backendDetails.name,
          sceneData: backendDetails.sceneData,
          form:
            apiError?.message ?? 'Failed to create scene. Please try again.',
        })
        return
      }

      const createdScenePayload = (await response.json().catch(() => null)) as
        | unknown
        | null
      const sceneId = parseCreatedSceneId(createdScenePayload)

      if (sceneId === null) {
        setErrors({
          form:
            'Scene was created, but the response did not include the new scene id for tag attachment.',
        })
        return
      }

      if (selectedTagIds.length > 0) {
        const attachFailures = await attachTagsToScene(
          authenticatedFetch,
          availableTags,
          sceneId,
          selectedTagIds,
        )

        if (attachFailures.length > 0) {
          setPendingTagAttachment({
            sceneId,
            tagIds: attachFailures.map((failure) => failure.tagId),
          })
          setErrors({
            form: `Scene created, but we couldn't attach ${attachFailures
              .map((failure) => failure.tagName)
              .join(', ')}. Submit again to retry attachment for the existing scene. Additional editor changes will not be saved in this retry state.`,
          })
          return
        }
      }

      onComplete()
    } catch (error) {
      setErrors({
        form:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Scene creation is unavailable right now. Please try again in a moment.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return { handleSubmit }
}

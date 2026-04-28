import { useId, useState } from 'react'
import type { AuthenticatedFetch } from '@auth'
import {
  getSceneEditorModel,
  mergeSceneEditorBranch,
  parseSceneDataJson,
  type SceneData,
  type SceneEditorModel,
  type ScenePassId,
} from './sceneEditor'
import { initialSceneData, initialSceneModel } from './fixtures'
import type { CreateSceneFormErrors, EditorSectionId, PendingTagAttachment } from './types'
import {
  buildEffectiveSceneData,
  prettyPrintEditorSceneData,
  validateSceneDataText,
  validateSceneName,
  validateThumbnailFile,
} from './utils'
import { useSceneEditorActionBarState } from './useSceneEditorActionBarState'
import { useSceneEditorNavigation } from './useSceneEditorNavigation'
import { useSceneTagEditor } from './useSceneTagEditor'

type UseSceneEditorStateArgs = {
  authenticatedFetch: AuthenticatedFetch
}

export function useSceneEditorState({
  authenticatedFetch,
}: UseSceneEditorStateArgs) {
  const {
    currentSection,
    currentSectionIndex,
    handleSectionJump,
    handleSectionStep,
    nextSection,
    previousSection,
    sectionMenuValue,
  } = useSceneEditorNavigation()
  const { actionBarSentinelRef, isActionBarStuck } = useSceneEditorActionBarState()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(
    null,
  )
  const [playlistValue, setPlaylistValue] = useState('')
  const [sceneData, setSceneData] = useState<SceneData>(initialSceneData)
  const [sceneDataText, setSceneDataText] = useState(() =>
    prettyPrintEditorSceneData(initialSceneData),
  )
  const [errors, setErrors] = useState<CreateSceneFormErrors>({})
  const [isCameraAdvancedEnabled, setIsCameraAdvancedEnabled] = useState(false)
  const [isMotionAdvancedEnabled, setIsMotionAdvancedEnabled] = useState(false)
  const [cameraAdvancedDraft, setCameraAdvancedDraft] = useState(() => ({
    camOrientationMode: initialSceneModel.intent.camOrientationMode,
    camOrientationSpeed: initialSceneModel.intent.camOrientationSpeed,
  }))
  const [motionRuntimeDraft, setMotionRuntimeDraft] = useState(
    () => initialSceneModel.state,
  )
  const [isConfirmJsonOpen, setIsConfirmJsonOpen] = useState(false)
  const [pendingTagAttachment, setPendingTagAttachment] =
    useState<PendingTagAttachment | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formErrorId = useId()
  const titleId = 'create-scene-title'

  const detailsSectionIssueMessages = [
    validateSceneName(name),
    thumbnailFile ? validateThumbnailFile(thumbnailFile) : null,
  ].filter((message): message is string => Boolean(message))
  const confirmSectionIssueMessage = validateSceneDataText(sceneDataText).error
  const sectionIssuesById: Partial<Record<EditorSectionId, string | null>> = {
    confirm: confirmSectionIssueMessage,
    details:
      detailsSectionIssueMessages.length > 0
        ? detailsSectionIssueMessages.join(' ')
        : null,
  }

  function clearErrors(...fields: Array<keyof CreateSceneFormErrors>) {
    if (fields.length === 0) {
      setErrors({})
      return
    }

    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors }

      for (const field of fields) {
        nextErrors[field] = undefined
      }

      return nextErrors
    })
  }

  const {
    availableTags,
    canCreateTagFromSearch,
    filteredSelectableTags,
    handleCreateTag,
    handleTagSearchChange,
    isCreatingTag,
    isExactMatchedTagSelected,
    isTagDropdownOpen,
    normalizedTagSearchValue,
    openTagDropdown,
    pendingRetryTags,
    reloadAvailableTags,
    selectableTags,
    selectedTagIds,
    selectedTags,
    tagDropdownRef,
    tagSearchInputId,
    tagSearchValue,
    tagsError,
    tagsLoading,
    toggleTagSelection,
  } = useSceneTagEditor({
    authenticatedFetch,
    clearErrors,
    pendingTagAttachment,
    setErrors,
  })

  function applySceneData(nextSceneData: SceneData) {
    const sanitizedSceneData = buildEffectiveSceneData(nextSceneData, {
      isCameraAdvancedEnabled,
      isMotionAdvancedEnabled,
    })
    setSceneData(sanitizedSceneData)
    setSceneDataText(prettyPrintEditorSceneData(sanitizedSceneData))
    clearErrors('sceneData', 'form')
  }

  function updateBranch<K extends keyof SceneEditorModel>(
    branch: K,
    recipe: (currentBranch: SceneEditorModel[K]) => SceneEditorModel[K],
  ) {
    const currentModel = getSceneEditorModel(sceneData)
    const nextBranch = recipe(currentModel[branch])
    applySceneData(mergeSceneEditorBranch(sceneData, branch, nextBranch))
  }

  function handleCameraAdvancedToggle(nextValue: boolean) {
    const sceneModel = getSceneEditorModel(sceneData)

    if (nextValue) {
      setIsCameraAdvancedEnabled(true)
      updateBranch('intent', (currentIntent) => ({
        ...currentIntent,
        camOrientationMode: cameraAdvancedDraft.camOrientationMode,
        camOrientationSpeed: cameraAdvancedDraft.camOrientationSpeed,
      }))
      return
    }

    setCameraAdvancedDraft({
      camOrientationMode: sceneModel.intent.camOrientationMode,
      camOrientationSpeed: sceneModel.intent.camOrientationSpeed,
    })
    setIsCameraAdvancedEnabled(false)
    updateBranch('intent', (currentIntent) => ({
      ...currentIntent,
      camOrientationMode: initialSceneModel.intent.camOrientationMode,
      camOrientationSpeed: initialSceneModel.intent.camOrientationSpeed,
    }))
  }

  function handleMotionAdvancedToggle(nextValue: boolean) {
    const sceneModel = getSceneEditorModel(sceneData)

    if (nextValue) {
      setIsMotionAdvancedEnabled(true)
      updateBranch('state', () => motionRuntimeDraft)
      return
    }

    setMotionRuntimeDraft(sceneModel.state)
    setIsMotionAdvancedEnabled(false)
    updateBranch('state', () => initialSceneModel.state)
  }

  function handleNameChange(nextValue: string) {
    setName(nextValue)
    clearErrors('name', 'form')
  }

  function handleThumbnailCapture(nextFile: File, previewUrl: string) {
    setThumbnailFile(nextFile)
    setThumbnailPreviewUrl(previewUrl)
    setErrors((currentErrors) => ({
      ...currentErrors,
      thumbnail: undefined,
      form: undefined,
    }))
  }

  function handleRawSceneDataChange(nextValue: string) {
    setSceneDataText(nextValue)
    clearErrors('sceneData', 'form')

    try {
      setSceneData(
        buildEffectiveSceneData(parseSceneDataJson(nextValue), {
          isCameraAdvancedEnabled,
          isMotionAdvancedEnabled,
        }),
      )
    } catch {
      return
    }
  }

  function handleFormatJson() {
    try {
      applySceneData(parseSceneDataJson(sceneDataText))
    } catch (error) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        sceneData:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Scene data must be valid JSON before formatting.',
      }))
    }
  }

  function movePass(passId: ScenePassId, direction: -1 | 1) {
    if (passId === 'outputPass') {
      return
    }

    updateBranch('fx', (currentFx) => {
      const movablePasses = currentFx.passOrder.filter(
        (currentPassId): currentPassId is Exclude<ScenePassId, 'outputPass'> =>
          currentPassId !== 'outputPass',
      )
      const currentIndex = movablePasses.indexOf(passId)
      const nextIndex = currentIndex + direction

      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= movablePasses.length
      ) {
        return currentFx
      }

      const nextPassOrder = [...movablePasses]
      const [movedPass] = nextPassOrder.splice(currentIndex, 1)
      nextPassOrder.splice(nextIndex, 0, movedPass)

      return {
        ...currentFx,
        passOrder: [...nextPassOrder, 'outputPass'],
      }
    })
  }

  return {
    actionBarSentinelRef,
    availableTags,
    canCreateTagFromSearch,
    currentSection,
    currentSectionIndex,
    description,
    errors,
    filteredSelectableTags,
    formErrorId,
    handleCameraAdvancedToggle,
    handleCreateTag,
    handleFormatJson,
    handleMotionAdvancedToggle,
    handleNameChange,
    handleRawSceneDataChange,
    handleSectionJump,
    handleSectionStep,
    handleTagSearchChange,
    handleThumbnailCapture,
    isActionBarStuck,
    isCameraAdvancedEnabled,
    isConfirmJsonOpen,
    isCreatingTag,
    isExactMatchedTagSelected,
    isMotionAdvancedEnabled,
    isSubmitting,
    isTagDropdownOpen,
    movePass,
    name,
    nextSection,
    openTagDropdown,
    pendingRetryTags,
    pendingTagAttachment,
    playlistValue,
    previousSection,
    reloadAvailableTags,
    sceneData,
    sceneDataText,
    sectionIssuesById,
    sectionMenuValue,
    selectableTags,
    selectedTagIds,
    selectedTags,
    normalizedTagSearchValue,
    setDescription,
    setErrors,
    setIsConfirmJsonOpen,
    setIsSubmitting,
    setPendingTagAttachment,
    setPlaylistValue,
    tagDropdownRef,
    tagSearchInputId,
    tagSearchValue,
    tagsError,
    tagsLoading,
    thumbnailFile,
    thumbnailPreviewUrl,
    titleId,
    toggleTagSelection,
    updateBranch,
  }
}

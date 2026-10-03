import { useId, useState } from 'react'
import type { AuthenticatedFetch } from '@auth'
import {
  getSceneEditorModel,
  SHADER_SCENES,
  type SceneData,
  type SceneEditorModel,
  type ScenePassId,
} from './sceneEditor'
import { initialSceneData } from './fixtures'
import type {
  CreateSceneFormErrors,
  EditorSectionId,
  PendingTagAttachment,
  SceneEditorInitialState,
} from './types'
import {
  moveVisiblePass,
  prettyPrintEditorSceneData,
  readEditableSceneData,
  validateSceneDataText,
  validateSceneName,
  validateThumbnailFile,
} from './utils'
import { useSceneEditorNavigation } from './useSceneEditorNavigation'
import { useSceneTagEditor } from './useSceneTagEditor'
import { normalizeAudioResponseConfig, type AudioResponseConfig, type AudioResponseTarget, type SceneAudioResponseMode } from '@shared/lib'
import { changeMusicResponseMode, readMusicResponseDefaults, restoreMusicResponseDefaults } from './musicResponseSettings'
import { parseSceneImport } from '@modules/player'
import { describeSceneValidationError } from './sceneValidation'

/** Apply only the user's changed fields, retaining unsupported repair values. */
function mergeChangedValues(original: unknown, before: unknown, after: unknown): unknown {
  if (before === after) return original
  if (original && before && after && typeof original === 'object' && typeof before === 'object' && typeof after === 'object'
    && !Array.isArray(original) && !Array.isArray(before) && !Array.isArray(after)) {
    const next = { ...original } as Record<string, unknown>
    for (const [key, value] of Object.entries(after)) {
      const previous = (before as Record<string, unknown>)[key]
      if (previous !== value) next[key] = mergeChangedValues(next[key], previous, value)
    }
    return next
  }
  return after
}

type UseSceneEditorStateArgs = {
  authenticatedFetch: AuthenticatedFetch
  initialState?: SceneEditorInitialState
  titleId?: string
}

export function useSceneEditorState({
  authenticatedFetch,
  initialState,
  titleId: providedTitleId = 'create-scene-title',
}: UseSceneEditorStateArgs) {
  const {
    currentSection,
    currentSectionIndex,
    handleSectionJump,
    sectionMenuValue,
  } = useSceneEditorNavigation()
  const [name, setName] = useState(() => initialState?.name ?? '')
  const [description, setDescription] = useState(() => initialState?.description ?? '')
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(
    () => initialState?.thumbnailPreviewUrl ?? null,
  )
  const [playlistValue, setPlaylistValue] = useState('')
  const [sceneData, setSceneData] = useState<SceneData>(
    () => readEditableSceneData(initialState?.sceneData ?? initialSceneData),
  )
  const [sceneDataText, setSceneDataText] = useState(() =>
    prettyPrintEditorSceneData(initialState?.sceneData ?? initialSceneData),
  )
  const [musicResponseDefaults] = useState(() => readMusicResponseDefaults(readEditableSceneData(initialState?.sceneData ?? initialSceneData)))
  const [errors, setErrors] = useState<CreateSceneFormErrors>({})
  const [isCameraAdvancedEnabled, setIsCameraAdvancedEnabled] = useState(false)
  const [isMotionAdvancedEnabled, setIsMotionAdvancedEnabled] = useState(false)
  const [isConfirmJsonOpen, setIsConfirmJsonOpen] = useState(false)
  const [pendingTagAttachment, setPendingTagAttachment] =
    useState<PendingTagAttachment | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formErrorId = useId()
  const titleId = providedTitleId

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
    initialSelectedTagNames: initialState?.tagNames,
    pendingTagAttachment,
    setErrors,
  })

  function applySceneData(nextSceneData: SceneData, replaceRawDraft = false) {
    if (!replaceRawDraft && confirmSectionIssueMessage && sceneDataText !== JSON.stringify(sceneData, null, 2)) {
      setErrors(current => ({ ...current, sceneData: confirmSectionIssueMessage ?? undefined,
        form: 'Fix the Scene Data JSON before changing other controls. Your imported draft has been kept.' }))
      return
    }
    const nextText = JSON.stringify(nextSceneData, null, 2)
    setSceneData(nextSceneData)
    setSceneDataText(nextText)
    const validation = validateSceneDataText(nextText)
    setErrors(current => ({ ...current, sceneData: validation.error ?? undefined, form: undefined }))
  }

  function updateBranch<K extends keyof SceneEditorModel>(
    branch: K,
    recipe: (currentBranch: SceneEditorModel[K]) => SceneEditorModel[K],
  ) {
    const currentModel = getSceneEditorModel(sceneData)
    const nextBranch = recipe(currentModel[branch])
    applySceneData({ ...sceneData, [branch]: mergeChangedValues(sceneData[branch], currentModel[branch], nextBranch) })
  }

  function handleAudioResponseModeChange(mode: SceneAudioResponseMode, supportedTargets?: readonly AudioResponseTarget[]) {
    applySceneData(changeMusicResponseMode(sceneData, mode, supportedTargets))
  }

  function handleAudioResponseConfigChange(config: AudioResponseConfig) {
    applySceneData({ ...sceneData, audioResponseConfig: mergeChangedValues(sceneData.audioResponseConfig,
      normalizeAudioResponseConfig(sceneData.audioResponseConfig).config, config) })
  }

  function handleAudioResponseReset() {
    const next = restoreMusicResponseDefaults(sceneData, musicResponseDefaults)
    const currentModel = getSceneEditorModel(sceneData)
    applySceneData({ ...next,
      intent: mergeChangedValues(sceneData.intent, currentModel.intent, next.intent),
      state: mergeChangedValues(sceneData.state, currentModel.state, next.state),
    })
  }

  const canResetAudioResponse = JSON.stringify(readMusicResponseDefaults(sceneData)) !== JSON.stringify(musicResponseDefaults)

  function handleCameraAdvancedToggle(nextValue: boolean) {
    setIsCameraAdvancedEnabled(nextValue)
  }

  function handleShaderSelection(shaderId: string) {
    const shader = SHADER_SCENES.find((option) => option.id === shaderId)
    if (!shader) return
    updateBranch('visualizer', current => ({
      ...current,
      shader: shader.shader,
    }))
  }

  function handleMotionAdvancedToggle(nextValue: boolean) {
    setIsMotionAdvancedEnabled(nextValue)
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
      setSceneData(readEditableSceneData(parseSceneImport(nextValue)))
    } catch (error) {
      setErrors(current => ({ ...current, sceneData: describeSceneValidationError(error) }))
    }
  }

  function handleFormatJson() {
    try {
      applySceneData(readEditableSceneData(parseSceneImport(sceneDataText)), true)
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
    if (passId === 'outputPass' || passId === 'copyShader') {
      return
    }

    updateBranch('fx', (currentFx) => {
      return {
        ...currentFx,
        passOrder: moveVisiblePass(currentFx.passOrder, passId, direction),
      }
    })
  }

  return {
    canResetAudioResponse,
    availableTags,
    canCreateTagFromSearch,
    currentSection,
    currentSectionIndex,
    description,
    errors,
    filteredSelectableTags,
    formErrorId,
    handleCameraAdvancedToggle,
    handleAudioResponseModeChange,
    handleAudioResponseConfigChange,
    handleAudioResponseReset,
    handleCreateTag,
    handleFormatJson,
    handleMotionAdvancedToggle,
    handleNameChange,
    handleRawSceneDataChange,
    handleShaderSelection,
    handleSectionJump,
    handleTagSearchChange,
    handleThumbnailCapture,
    isCameraAdvancedEnabled,
    isConfirmJsonOpen,
    isCreatingTag,
    isExactMatchedTagSelected,
    isMotionAdvancedEnabled,
    isSubmitting,
    isTagDropdownOpen,
    movePass,
    name,
    openTagDropdown,
    pendingRetryTags,
    pendingTagAttachment,
    playlistValue,
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

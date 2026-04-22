import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { AuthenticatedFetch } from '@auth'
import type { TagResponse } from '@lib/api'
import {
  getSceneEditorModel,
  mergeSceneEditorBranch,
  parseSceneDataJson,
  type SceneData,
  type SceneEditorModel,
  type ScenePassId,
} from '@lib/sceneEditor'
import { parseApiError } from '@shared/lib'
import { EDITOR_SECTIONS, MAX_TAG_NAME_LENGTH, initialSceneData, initialSceneModel } from './fixtures'
import type { CreateSceneFormErrors, EditorSectionId, PendingTagAttachment, ThumbnailMode } from './types'
import {
  buildEffectiveSceneData,
  loadAvailableTagsFromBackend,
  normalizeTagName,
  prettyPrintEditorSceneData,
  sortTags,
  upsertTag,
  validateSceneDataText,
  validateSceneName,
  validateThumbnailFile,
} from './utils'

type UseSceneEditorStateArgs = {
  authenticatedFetch: AuthenticatedFetch
}

export function useSceneEditorState({
  authenticatedFetch,
}: UseSceneEditorStateArgs) {
  const [sectionMenuValue, setSectionMenuValue] =
    useState<EditorSectionId>('details')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [thumbnailMode, setThumbnailMode] = useState<ThumbnailMode>('skip')
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [thumbnailFileName, setThumbnailFileName] = useState('')
  const [playlistValue, setPlaylistValue] = useState('')
  const [availableTags, setAvailableTags] = useState<TagResponse[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [tagSearchValue, setTagSearchValue] = useState('')
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false)
  const [sceneData, setSceneData] = useState<SceneData>(initialSceneData)
  const [sceneDataText, setSceneDataText] = useState(() =>
    prettyPrintEditorSceneData(initialSceneData),
  )
  const [errors, setErrors] = useState<CreateSceneFormErrors>({})
  const [tagsLoading, setTagsLoading] = useState(true)
  const [tagsError, setTagsError] = useState<string | null>(null)
  const [isActionBarStuck, setIsActionBarStuck] = useState(false)
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
  const [isCreatingTag, setIsCreatingTag] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const tagDropdownRef = useRef<HTMLDivElement | null>(null)
  const thumbnailFileInputRef = useRef<HTMLInputElement | null>(null)
  const actionBarSentinelRef = useRef<HTMLDivElement | null>(null)

  const formErrorId = useId()
  const tagSearchInputId = useId()
  const thumbnailInputId = useId()
  const titleId = 'create-scene-title'

  const normalizedTagSearchValue = normalizeTagName(tagSearchValue)
  const selectedTags = useMemo(
    () => availableTags.filter((tag) => selectedTagIds.includes(tag.tagId)),
    [availableTags, selectedTagIds],
  )
  const selectableTags = useMemo(
    () => availableTags.filter((tag) => !selectedTagIds.includes(tag.tagId)),
    [availableTags, selectedTagIds],
  )
  const filteredSelectableTags = useMemo(() => {
    if (!normalizedTagSearchValue) {
      return selectableTags
    }

    return selectableTags.filter((tag) =>
      tag.name.includes(normalizedTagSearchValue),
    )
  }, [normalizedTagSearchValue, selectableTags])
  const exactMatchedTag = useMemo(
    () =>
      availableTags.find((tag) => tag.name === normalizedTagSearchValue) ?? null,
    [availableTags, normalizedTagSearchValue],
  )
  const isExactMatchedTagSelected =
    exactMatchedTag !== null && selectedTagIds.includes(exactMatchedTag.tagId)
  const canCreateTagFromSearch =
    normalizedTagSearchValue.length > 0 && exactMatchedTag === null
  const pendingRetryTags = useMemo(
    () =>
      pendingTagAttachment === null
        ? []
        : availableTags.filter((tag) =>
            pendingTagAttachment.tagIds.includes(tag.tagId),
          ),
    [availableTags, pendingTagAttachment],
  )
  const currentSectionIndex = Math.max(
    0,
    EDITOR_SECTIONS.findIndex((section) => section.id === sectionMenuValue),
  )
  const currentSection =
    EDITOR_SECTIONS[currentSectionIndex] ?? EDITOR_SECTIONS[0]
  const previousSection =
    currentSectionIndex > 0 ? EDITOR_SECTIONS[currentSectionIndex - 1] : null
  const nextSection =
    currentSectionIndex < EDITOR_SECTIONS.length - 1
      ? EDITOR_SECTIONS[currentSectionIndex + 1]
      : null
  const detailsSectionIssueMessages = [
    validateSceneName(name),
    thumbnailMode === 'upload' ? validateThumbnailFile(thumbnailFile) : null,
  ].filter((message): message is string => Boolean(message))
  const confirmSectionIssueMessage = validateSceneDataText(sceneDataText).error
  const sectionIssuesById: Partial<Record<EditorSectionId, string | null>> = {
    confirm: confirmSectionIssueMessage,
    details:
      detailsSectionIssueMessages.length > 0
        ? detailsSectionIssueMessages.join(' ')
        : null,
  }

  useEffect(() => {
    let isCurrent = true

    async function loadTags() {
      try {
        const nextTags = await loadAvailableTagsFromBackend()

        if (!isCurrent) {
          return
        }

        setAvailableTags(nextTags)
        setTagsError(null)
      } catch (error) {
        if (!isCurrent) {
          return
        }

        setAvailableTags([])
        setTagsError(
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Unable to load available tags right now.',
        )
      } finally {
        if (isCurrent) {
          setTagsLoading(false)
        }
      }
    }

    void loadTags()

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    if (!isTagDropdownOpen) {
      return
    }

    function handleDocumentMouseDown(event: MouseEvent) {
      if (!tagDropdownRef.current?.contains(event.target as Node)) {
        setIsTagDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown)
    }
  }, [isTagDropdownOpen])

  useEffect(() => {
    if (!isTagDropdownOpen || !pendingTagAttachment) {
      return
    }

    setIsTagDropdownOpen(false)
  }, [isTagDropdownOpen, pendingTagAttachment])

  useEffect(() => {
    const sentinel = actionBarSentinelRef.current

    if (!sentinel || typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsActionBarStuck(entry.intersectionRatio < 1)
      },
      {
        threshold: 1,
      },
    )

    observer.observe(sentinel)

    return () => {
      observer.disconnect()
    }
  }, [])

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

  function clearThumbnailSelection() {
    setThumbnailFile(null)
    setThumbnailFileName('')
    if (thumbnailFileInputRef.current) {
      thumbnailFileInputRef.current.value = ''
    }
  }

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

  function handleThumbnailModeChange(nextValue: ThumbnailMode) {
    setThumbnailMode(nextValue)
    if (nextValue === 'skip') {
      clearThumbnailSelection()
    }
    setErrors((currentErrors) => ({
      ...currentErrors,
      thumbnail: undefined,
      form: undefined,
    }))
  }

  function handleThumbnailUploadClick() {
    setThumbnailMode('upload')
    thumbnailFileInputRef.current?.click()
  }

  function handleThumbnailFileChange(fileList: FileList | File[] | null) {
    let nextFile: File | null = null

    if (Array.isArray(fileList)) {
      nextFile = fileList[0] ?? null
    } else {
      nextFile = fileList?.item(0) ?? null
    }

    if (!nextFile) {
      return
    }

    setThumbnailMode('upload')
    setThumbnailFile(nextFile)
    setThumbnailFileName(nextFile.name)
    setErrors((currentErrors) => ({
      ...currentErrors,
      thumbnail: undefined,
      form: undefined,
    }))
  }

  function handleSectionJump(nextSectionId: EditorSectionId) {
    setSectionMenuValue(nextSectionId)
  }

  function handleSectionStep(direction: -1 | 1) {
    const nextIndex = currentSectionIndex + direction
    const nextSectionConfig = EDITOR_SECTIONS[nextIndex]

    if (!nextSectionConfig) {
      return
    }

    handleSectionJump(nextSectionConfig.id)
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

  async function reloadAvailableTags() {
    setTagsLoading(true)
    setTagsError(null)

    try {
      const nextTags = await loadAvailableTagsFromBackend()
      setAvailableTags(nextTags)
    } catch (error) {
      setAvailableTags([])
      setTagsError(
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Unable to load available tags right now.',
      )
    } finally {
      setTagsLoading(false)
    }
  }

  function openTagDropdown() {
    if (pendingTagAttachment || tagsLoading || isCreatingTag) {
      return
    }

    clearErrors('form', 'newTag', 'tags')
    setIsTagDropdownOpen(true)
  }

  function handleTagSearchChange(nextValue: string) {
    setTagSearchValue(nextValue)
    setIsTagDropdownOpen(true)
    clearErrors('form', 'newTag', 'tags')
  }

  function toggleTagSelection(tagId: number) {
    if (pendingTagAttachment || isCreatingTag) {
      return
    }

    clearErrors('form', 'newTag', 'tags')
    setSelectedTagIds((currentTagIds) =>
      currentTagIds.includes(tagId)
        ? currentTagIds.filter((currentTagId) => currentTagId !== tagId)
        : [...currentTagIds, tagId],
    )
    setTagSearchValue('')
    setIsTagDropdownOpen(false)
  }

  async function handleCreateTag(requestedTagName = tagSearchValue) {
    if (pendingTagAttachment || isCreatingTag) {
      return
    }

    const normalizedTagName = normalizeTagName(requestedTagName)

    if (!normalizedTagName) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        newTag: 'Tag name is required.',
      }))
      return
    }

    if (normalizedTagName.length > MAX_TAG_NAME_LENGTH) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        newTag: `Tag name must be at most ${MAX_TAG_NAME_LENGTH} characters.`,
      }))
      return
    }

    const existingTag = availableTags.find(
      (tag) => tag.name === normalizedTagName,
    )

    if (existingTag) {
      setSelectedTagIds((currentTagIds) =>
        currentTagIds.includes(existingTag.tagId)
          ? currentTagIds
          : [...currentTagIds, existingTag.tagId],
      )
      setTagSearchValue('')
      setIsTagDropdownOpen(false)
      clearErrors('newTag', 'form', 'tags')
      return
    }

    setIsCreatingTag(true)
    clearErrors('newTag', 'form', 'tags')

    try {
      const response = await authenticatedFetch('/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizedTagName,
        }),
      })

      if (response.ok) {
        const createdTag = (await response.json()) as TagResponse
        setAvailableTags((currentTags) => upsertTag(currentTags, createdTag))
        setTagsError(null)
        setSelectedTagIds((currentTagIds) =>
          currentTagIds.includes(createdTag.tagId)
            ? currentTagIds
            : [...currentTagIds, createdTag.tagId],
        )
        setTagSearchValue('')
        setIsTagDropdownOpen(false)
        return
      }

      const apiError = await parseApiError(response)

      if (response.status === 409 && apiError?.code === 'TAG_ALREADY_EXISTS') {
        try {
          const nextTags = await loadAvailableTagsFromBackend()
          const matchedTag = nextTags.find(
            (tag) => tag.name === normalizedTagName,
          )

          setAvailableTags(sortTags(nextTags))
          setTagsError(null)

          if (matchedTag) {
            setSelectedTagIds((currentTagIds) =>
              currentTagIds.includes(matchedTag.tagId)
                ? currentTagIds
                : [...currentTagIds, matchedTag.tagId],
            )
            setTagSearchValue('')
            setIsTagDropdownOpen(false)
            return
          }
        } catch (error) {
          setTagsError(
            error instanceof Error && error.message.trim()
              ? error.message
              : 'Unable to refresh tags right now.',
          )
        }
      }

      setErrors((currentErrors) => ({
        ...currentErrors,
        newTag:
          apiError?.details?.name ??
          apiError?.message ??
          'Failed to create tag. Please try again.',
      }))
    } catch (error) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        newTag:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Failed to create tag. Please try again.',
      }))
    } finally {
      setIsCreatingTag(false)
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
    handleThumbnailFileChange,
    handleThumbnailModeChange,
    handleThumbnailUploadClick,
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
    thumbnailFileInputRef,
    thumbnailFileName,
    thumbnailInputId,
    thumbnailMode,
    titleId,
    toggleTagSelection,
    updateBranch,
  }
}

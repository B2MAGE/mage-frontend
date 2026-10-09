import { useId, useMemo, useRef, useState } from 'react'
import type { AuthenticatedFetch } from '@auth'
import {
  getSceneEditorModel,
  SHADER_SCENES,
  type SceneData,
  type SceneEditorModel,
  type ScenePassId,
} from './sceneEditor'
import { EDITOR_SECTIONS } from './fixtures'
import type {
  CreateSceneFormErrors,
  EditorSectionId,
  SceneEditorInitialState,
} from './types'
import {
  moveActivePass,
  moveActivePassTo,
  prettyPrintEditorSceneData,
  readEditableSceneData,
  validateSceneDataText,
  validateSceneName,
  validateThumbnailFile,
} from './utils'
import { useSceneImportExport } from './useSceneImportExport'
import { changeSceneBranch, mergeChangedValues } from './draftCommands'
import { useSceneDraftCommands } from './useSceneDraftCommands'
import { useSceneEditorNavigation } from './useSceneEditorNavigation'
import { useSceneTagEditor } from './useSceneTagEditor'
import { normalizeAudioResponseConfig, normalizeAudioResponseMode, type AudioResponseConfig, type AudioResponseTarget, type SceneAudioResponseMode } from '@shared/lib'
import { changeMusicResponseMode, readMusicResponseDefaults, restoreMusicResponseDefaults } from './musicResponseSettings'
import { createCustomSceneFromTemplate, readTemplateShaderSource, resolveSceneForPlayback, SceneValidationError, validateSceneDocument, type BuilderSceneDocument, type TemplateId } from '@modules/player'
import { describeSceneValidationError } from './sceneValidation'
import { changedTemplateFields, changeTemplateMusicSettings, changeTemplateSelection, changeTemplateValue, createTemplateScene, getTemplateEditorSceneData, isTemplateEditorDocument, type TemplateFieldPath } from './templateEditor'
import { changeBuilderMusicSettings, changeBuilderValue, createBuilderScene, getBuilderEditorSceneData, isBuilderEditorDocument } from './builderEditor'

type UseSceneEditorStateArgs = {
  allowCustomSceneData?: boolean
  authenticatedFetch: AuthenticatedFetch
  initialState?: SceneEditorInitialState
  titleId?: string
}

export function useSceneEditorState({
  allowCustomSceneData = true,
  authenticatedFetch,
  initialState,
  titleId: providedTitleId = 'create-scene-title',
}: UseSceneEditorStateArgs) {
  const [name, setName] = useState(() => initialState?.name ?? '')
  const [description, setDescription] = useState(() => initialState?.description ?? '')
  const [capturedThumbnail, setCapturedThumbnail] = useState<{ file: File; previewUrl: string; revision: string } | null>(null)
  const [sceneData, setSceneData] = useState<SceneData>(
    () => readEditableSceneData(initialState?.sceneData ?? createTemplateScene()),
  )
  const sceneDraftRef = useRef(sceneData)
  const [sceneDataText, setSceneDataText] = useState(() =>
    prettyPrintEditorSceneData(initialState?.sceneData ?? createTemplateScene()),
  )
  const thumbnailFile = capturedThumbnail?.revision === sceneDataText ? capturedThumbnail.file : null
  const thumbnailPreviewUrl = capturedThumbnail?.revision === sceneDataText ? capturedThumbnail.previewUrl : initialState?.thumbnailPreviewUrl ?? null
  const builderRoundTripRef = useRef<{ document: BuilderSceneDocument; customSignature: string } | null>(null)
  const [musicResponseDefaults, setMusicResponseDefaults] = useState(() => readMusicResponseDefaults(
    isTemplateEditorDocument(sceneData) ? getTemplateEditorSceneData(sceneData)
      : isBuilderEditorDocument(sceneData) ? getBuilderEditorSceneData(sceneData) : sceneData))
  const isTemplate = isTemplateEditorDocument(sceneData)
  const templateDocument = isTemplate ? sceneData : null
  const isBuilder = isBuilderEditorDocument(sceneData)
  const builderDocument = isBuilder ? sceneData : null
  const isUnmodifiedBuilderCustom = !isTemplate && !isBuilder
    && builderRoundTripRef.current?.customSignature === JSON.stringify(sceneData)
  const authoredFieldErrors = useMemo(() => {
    const document = templateDocument ?? builderDocument
    if (document) {
      try { validateSceneDocument(document) }
      catch (error) {
        if (error instanceof SceneValidationError) return Object.fromEntries(
          Object.entries(error.details).map(([path, message]) => [path.replace(/^sceneData\./, ''), message]),
        )
      }
    }
    return {} as Record<string, string>
  }, [builderDocument, templateDocument])
  const templateFieldErrors = authoredFieldErrors
  const editorSceneData = useMemo(() => templateDocument ? getTemplateEditorSceneData(templateDocument)
    : builderDocument ? getBuilderEditorSceneData(builderDocument) : sceneData, [builderDocument, templateDocument, sceneData])
  const editorAudioResponseMode = normalizeAudioResponseMode(editorSceneData.audioResponse)
  const editorAudioResponseConfig = normalizeAudioResponseConfig(editorSceneData.audioResponseConfig).config
  const editorSections = EDITOR_SECTIONS
  const { currentSection, currentSectionIndex, handleSectionJump, sectionMenuValue } = useSceneEditorNavigation(editorSections)
  const [errors, setErrors] = useState<CreateSceneFormErrors>({})
  const [isCameraAdvancedEnabled, setIsCameraAdvancedEnabled] = useState(false)
  const [isMotionAdvancedEnabled, setIsMotionAdvancedEnabled] = useState(false)
  const [isConfirmJsonOpen, setIsConfirmJsonOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { cancelTemplateImport, confirmTemplateImport, disabledCustomImportIssue, handleFormatJson,
    handleRawSceneDataChange, pendingTemplateImport, resetPendingTemplateImport } = useSceneImportExport({
    allowCustomSceneData, sceneData, sceneDataText, setSceneDataText, setErrors, clearErrors, applySceneData,
    onImportDraft: next => { sceneDraftRef.current = next; setSceneData(next) },
  })

  const formErrorId = useId()
  const titleId = providedTitleId

  const detailsSectionIssueMessages = [
    validateSceneName(name),
    thumbnailFile ? validateThumbnailFile(thumbnailFile) : null,
  ].filter((message): message is string => Boolean(message))
  const sceneDataValidation = validateSceneDataText(sceneDataText)
  const confirmSectionIssueMessage = pendingTemplateImport
    ? 'Confirm replacing your custom scene with the imported template, or cancel to keep your custom scene.'
    : disabledCustomImportIssue ?? sceneDataValidation.error
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
    setErrors,
  })

  function applySceneData(nextSceneData: SceneData, replaceRawDraft = false, changedField?: string | string[]) {
    if (!replaceRawDraft && confirmSectionIssueMessage && sceneDataText !== prettyPrintEditorSceneData(sceneData)) {
      setErrors(current => ({ ...current, sceneData: confirmSectionIssueMessage ?? undefined,
        form: 'Fix the Scene Data JSON before changing other controls. Your imported draft has been kept.' }))
      return
    }
    const nextText = prettyPrintEditorSceneData(nextSceneData)
    if (replaceRawDraft && !isTemplate && isTemplateEditorDocument(nextSceneData)) {
      setMusicResponseDefaults(readMusicResponseDefaults(getTemplateEditorSceneData(nextSceneData)))
    } else if (replaceRawDraft && !isBuilder && isBuilderEditorDocument(nextSceneData)) {
      setMusicResponseDefaults(readMusicResponseDefaults(getBuilderEditorSceneData(nextSceneData)))
    }
    resetPendingTemplateImport()
    sceneDraftRef.current = nextSceneData
    setSceneData(nextSceneData)
    setSceneDataText(nextText)
    const validation = validateSceneDataText(nextText)
    setErrors(current => ({ ...current, sceneData: validation.error ?? undefined, form: undefined,
      fields: replaceRawDraft ? undefined : changedField && current.fields
        ? Object.fromEntries(Object.entries(current.fields).filter(([path]) => !(Array.isArray(changedField) ? changedField : [changedField])
          .some(field => path === field || path.startsWith(`${field}.`) || path.startsWith(`${field}[`))))
        : current.fields }))
  }

  function updateBranch<K extends keyof SceneEditorModel>(
    branch: K,
    recipe: (currentBranch: SceneEditorModel[K]) => SceneEditorModel[K],
  ) {
    const current = sceneDraftRef.current
    const next = changeSceneBranch(current, branch, recipe)
    applySceneData(next, false, isTemplateEditorDocument(current) && isTemplateEditorDocument(next)
      ? changedTemplateFields(current, next) : undefined)
  }

  function handleAudioResponseModeChange(mode: SceneAudioResponseMode, supportedTargets?: readonly AudioResponseTarget[]) {
    if (templateDocument) {
      const next = changeTemplateMusicSettings(templateDocument, changeMusicResponseMode(editorSceneData, mode, supportedTargets))
      applySceneData(next, false, changedTemplateFields(templateDocument, next))
      return
    }
    if (builderDocument) {
      applySceneData(changeBuilderMusicSettings(builderDocument, changeMusicResponseMode(editorSceneData, mode, supportedTargets)))
      return
    }
    applySceneData(changeMusicResponseMode(sceneData, mode, supportedTargets))
  }

  function handleAudioResponseConfigChange(config: AudioResponseConfig) {
    if (templateDocument) {
      const next = changeTemplateMusicSettings(templateDocument, { ...editorSceneData, audioResponseConfig: mergeChangedValues(
        editorSceneData.audioResponseConfig, editorAudioResponseConfig, config) })
      applySceneData(next, false, changedTemplateFields(templateDocument, next))
      return
    }
    if (builderDocument) {
      applySceneData(changeBuilderMusicSettings(builderDocument, { ...editorSceneData, audioResponseConfig: mergeChangedValues(
        editorSceneData.audioResponseConfig, editorAudioResponseConfig, config) }))
      return
    }
    applySceneData({ ...sceneData, audioResponseConfig: mergeChangedValues(sceneData.audioResponseConfig,
      normalizeAudioResponseConfig(sceneData.audioResponseConfig).config, config) })
  }

  function handleAudioResponseReset() {
    if (templateDocument) {
      const next = changeTemplateMusicSettings(templateDocument, restoreMusicResponseDefaults(editorSceneData, musicResponseDefaults))
      applySceneData(next, false, changedTemplateFields(templateDocument, next))
      return
    }
    if (builderDocument) {
      applySceneData(changeBuilderMusicSettings(builderDocument, restoreMusicResponseDefaults(editorSceneData, musicResponseDefaults)))
      return
    }
    const next = restoreMusicResponseDefaults(sceneData, musicResponseDefaults)
    const currentModel = getSceneEditorModel(sceneData)
    applySceneData({ ...next,
      intent: mergeChangedValues(sceneData.intent, currentModel.intent, next.intent),
      state: mergeChangedValues(sceneData.state, currentModel.state, next.state),
    })
  }

  const canResetAudioResponse = JSON.stringify(readMusicResponseDefaults(editorSceneData)) !== JSON.stringify(musicResponseDefaults)

  function handleTemplateSelection(templateId: string, replaceCustom = false) {
    if (builderDocument) return
    if (!templateDocument) {
      if (replaceCustom) {
        applySceneData(createTemplateScene(templateId), true, 'templateId')
        return
      }
      const template = createTemplateScene(templateId)
      const shader = readTemplateShaderSource(template)
      updateBranch('visualizer', current => ({ ...current, shader }))
      return
    }
    const next = changeTemplateSelection(sceneData, templateId, replaceCustom)
    if (next !== sceneData) applySceneData(next, !isTemplate && replaceCustom, 'templateId')
  }

  function updateTemplateValue(path: TemplateFieldPath, value: number | string | boolean) {
    const current = sceneDraftRef.current
    if (isTemplateEditorDocument(current)) applySceneData(changeTemplateValue(current, path, value), false, path)
  }

  function updateBuilderValue(path: TemplateFieldPath, value: number | string | boolean) {
    const current = sceneDraftRef.current
    if (isBuilderEditorDocument(current)) applySceneData(changeBuilderValue(current, path, value), false, path)
  }

  const { handleAddBuilderObject, handleUpdateBuilderObject, handleDuplicateBuilderObject,
    handleRemoveBuilderObject, handleMoveBuilderObject } = useSceneDraftCommands({
    readDraft: () => sceneDraftRef.current, applyDraft: applySceneData,
  })

  function handleSwitchToBuilder() {
    const next = createBuilderScene()
    applySceneData(next, true)
    setMusicResponseDefaults(readMusicResponseDefaults(getBuilderEditorSceneData(next)))
  }

  function handleSwitchToTemplate(templateId: TemplateId = 'embedded-scene-0') {
    const next = createTemplateScene(templateId)
    builderRoundTripRef.current = null
    applySceneData(next, true)
    setMusicResponseDefaults(readMusicResponseDefaults(getTemplateEditorSceneData(next)))
  }

  function handleRestoreBuilder() {
    const roundTrip = builderRoundTripRef.current
    if (!roundTrip || isTemplate || isBuilder || roundTrip.customSignature !== JSON.stringify(sceneData)) return false
    const next = structuredClone(roundTrip.document)
    builderRoundTripRef.current = null
    applySceneData(next, true)
    setMusicResponseDefaults(readMusicResponseDefaults(getBuilderEditorSceneData(next)))
    return true
  }

  function handleSwitchBuilderToCustom() {
    if (!builderDocument) return
    try {
      const compiled = resolveSceneForPlayback(builderDocument).engineScene
      const custom = readEditableSceneData({ schemaVersion: 1, kind: 'custom', scene: compiled })
      builderRoundTripRef.current = { document: structuredClone(builderDocument), customSignature: JSON.stringify(custom) }
      applySceneData(custom, true)
    } catch (error) {
      setErrors(current => ({ ...current, sceneData: describeSceneValidationError(error),
        form: 'Fix the Builder scene before switching to Custom Code.' }))
    }
  }

  function handleCameraAdvancedToggle(nextValue: boolean) {
    setIsCameraAdvancedEnabled(nextValue)
  }

  function handleShaderSelection(shaderId: string) {
    if (isTemplate) return
    const shader = SHADER_SCENES.find((option) => option.id === shaderId)
    if (!shader) return
    updateBranch('visualizer', current => ({
      ...current,
      shader: shader.shader,
    }))
  }

  function handleShaderSourceChange(shader: string) {
    if (builderDocument) return
    if (!templateDocument) {
      updateBranch('visualizer', current => ({ ...current, shader }))
      return
    }
    if (shader === readTemplateShaderSource(templateDocument)) return
    // Do not discard a raw draft or convert invalid settings behind its feedback.
    if (confirmSectionIssueMessage) {
      setErrors(current => ({ ...current, sceneData: confirmSectionIssueMessage,
        form: 'Fix the scene settings or Scene Data JSON before editing the shader. Your draft has been kept.' }))
      return
    }
    try {
      applySceneData(readEditableSceneData(createCustomSceneFromTemplate(templateDocument, shader)))
    } catch (error) {
      setErrors(current => ({ ...current, sceneData: describeSceneValidationError(error) }))
    }
  }

  function handleMotionAdvancedToggle(nextValue: boolean) {
    setIsMotionAdvancedEnabled(nextValue)
  }

  function handleNameChange(nextValue: string) {
    setName(nextValue)
    clearErrors('name', 'form')
  }

  function handleThumbnailCapture(nextFile: File, previewUrl: string) {
    setCapturedThumbnail({ file: nextFile, previewUrl, revision: sceneDataText })
    setErrors((currentErrors) => ({
      ...currentErrors,
      thumbnail: undefined,
      form: undefined,
    }))
  }

  function movePass(passId: ScenePassId, direction: -1 | 1) {
    if (passId === 'outputPass' || passId === 'copyShader') {
      return
    }

    updateBranch('fx', (currentFx) => {
      return {
        ...currentFx,
        passOrder: moveActivePass(currentFx.passOrder, currentFx, passId, direction),
      }
    })
  }

  function movePassTo(passId: ScenePassId, targetPassId: ScenePassId) {
    if (passId === 'outputPass' || passId === 'copyShader'
      || targetPassId === 'outputPass' || targetPassId === 'copyShader') return

    updateBranch('fx', (currentFx) => ({
      ...currentFx,
      passOrder: moveActivePassTo(currentFx.passOrder, currentFx, passId, targetPassId),
    }))
  }

  return {
    canResetAudioResponse,
    availableTags,
    canCreateTagFromSearch,
    cancelTemplateImport,
    confirmTemplateImport,
    currentSection,
    currentSectionIndex,
    description,
    editorAudioResponseMode,
    editorAudioResponseConfig,
    editorSections,
    errors,
    filteredSelectableTags,
    formErrorId,
    handleCameraAdvancedToggle,
    handleAudioResponseModeChange,
    handleAudioResponseConfigChange,
    handleAudioResponseReset,
    handleCreateTag,
    handleFormatJson,
    handleAddBuilderObject,
    handleDuplicateBuilderObject,
    handleRemoveBuilderObject,
    handleMoveBuilderObject,
    handleRestoreBuilder,
    handleSwitchBuilderToCustom,
    handleSwitchToBuilder,
    handleSwitchToTemplate,
    handleUpdateBuilderObject,
    handleMotionAdvancedToggle,
    handleNameChange,
    handleRawSceneDataChange,
    handleShaderSelection,
    handleShaderSourceChange,
    handleTemplateSelection,
    handleSectionJump,
    handleTagSearchChange,
    handleThumbnailCapture,
    isCameraAdvancedEnabled,
    isConfirmJsonOpen,
    isCreatingTag,
    isExactMatchedTagSelected,
    isMotionAdvancedEnabled,
    isSubmitting,
    isTemplate,
    isBuilder,
    isUnmodifiedBuilderCustom,
    isTagDropdownOpen,
    movePass,
    movePassTo,
    name,
    openTagDropdown,
    pendingTemplateImport,
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
    tagDropdownRef,
    tagSearchInputId,
    tagSearchValue,
    tagsError,
    tagsLoading,
    thumbnailFile,
    thumbnailPreviewUrl,
    templateDocument,
    builderDocument,
    templateFieldErrors,
    titleId,
    toggleTagSelection,
    updateBranch,
    updateTemplateValue,
    updateBuilderValue,
  }
}

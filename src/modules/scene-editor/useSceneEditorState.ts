import { useId, useMemo, useState } from 'react'
import type { AuthenticatedFetch } from '@auth'
import {
  getSceneEditorModel,
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
import { useSceneDraftHistory } from './useSceneDraftHistory'
import type { SceneDraftSnapshot } from './sceneDraftRecovery'
import { useSceneEditorNavigation } from './useSceneEditorNavigation'
import { useSceneTagEditor } from './useSceneTagEditor'
import { normalizeAudioResponseConfig, normalizeAudioResponseMode, type AudioResponseConfig, type AudioResponseTarget, type SceneAudioResponseMode } from '@shared/lib'
import { changeMusicResponseMode, readMusicResponseDefaults, restoreMusicResponseDefaults } from './musicResponseSettings'
import { createCustomSceneFromTemplate, readTemplateShaderSource, SceneValidationError, validateSceneDocument, type BuilderSceneDocument, type TemplateId } from '@modules/player'
import { describeSceneValidationError } from './sceneValidation'
import { changedTemplateFields, changeTemplateMusicSettings, changeTemplateValue, createTemplateScene, getTemplateEditorSceneData, isTemplateEditorDocument, type TemplateFieldPath } from './templateEditor'
import { changeBuilderMusicSettings, changeBuilderValue, createBuilderScene, getBuilderEditorSceneData, isBuilderEditorDocument } from './builderEditor'
import { builderOrderedNodes } from './builderGroups'
import { openTemplateWorkspace, builderWorkspaceAdapted } from './templateWorkspace'

type UseSceneEditorStateArgs = {
  allowCustomSceneData?: boolean
  authenticatedFetch: AuthenticatedFetch
  initialState?: SceneEditorInitialState
  titleId?: string
}

function reconcileSelection(before: SceneDraftSnapshot, next: SceneData): string | null {
  if (!isBuilderEditorDocument(next)) return null
  const previous = isBuilderEditorDocument(before.sceneData) ? builderOrderedNodes(before.sceneData) : []
  const nodes = builderOrderedNodes(next)
  const added = nodes.find(object => !previous.some(item => item.id === object.id))
  if (added) return added.id
  if (nodes.some(object => object.id === before.selectedBuilderObjectId)) return before.selectedBuilderObjectId
  const oldIndex = previous.findIndex(object => object.id === before.selectedBuilderObjectId)
  return nodes[Math.min(Math.max(0, oldIndex), nodes.length - 1)]?.id ?? null
}

export function useSceneEditorState({
  allowCustomSceneData = true,
  authenticatedFetch,
  initialState,
  titleId: providedTitleId = 'create-scene-title',
}: UseSceneEditorStateArgs) {
  const history = useSceneDraftHistory(() => {
    const { document, templateSourceId } = openTemplateWorkspace(readEditableSceneData(initialState?.sceneData ?? createTemplateScene()))
    return { name: initialState?.name ?? '', description: initialState?.description ?? '',
      sceneData: document, sceneDataText: prettyPrintEditorSceneData(document), templateSourceId, selectedTagIds: [],
      selectedBuilderObjectId: isBuilderEditorDocument(document) ? builderOrderedNodes(document)[0]?.id ?? null : null }
  })
  const { name, description, sceneData, sceneDataText, selectedTagIds, selectedBuilderObjectId } = history.draft
  const setSceneDataText = (value: string | ((previous: string) => string)) => history.commit(draft => ({ ...draft,
    sceneDataText: typeof value === 'function' ? value(draft.sceneDataText) : value }), 'Edit scene JSON')
  const setDescription = (value: string) => history.commit(draft => ({ ...draft, description: value }), 'Edit description')
  const [capturedThumbnail, setCapturedThumbnail] = useState<{ file: File; previewUrl: string; revision: string } | null>(null)
  const thumbnailFile = capturedThumbnail?.revision === sceneDataText ? capturedThumbnail.file : null
  const thumbnailPreviewUrl = capturedThumbnail?.revision === sceneDataText ? capturedThumbnail.previewUrl : initialState?.thumbnailPreviewUrl ?? null
  const [musicResponseDefaults, setMusicResponseDefaults] = useState(() => readMusicResponseDefaults(
    isTemplateEditorDocument(sceneData) ? getTemplateEditorSceneData(sceneData)
      : isBuilderEditorDocument(sceneData) ? getBuilderEditorSceneData(sceneData) : sceneData))
  const isTemplate = isTemplateEditorDocument(sceneData)
  const templateDocument = isTemplate ? sceneData : null
  const isBuilder = isBuilderEditorDocument(sceneData)
  const builderDocument = isBuilder ? sceneData : null
  const builderTemplateSourceId = isBuilder ? history.draft.templateSourceId ?? null : null
  const isBuilderAdapted = useMemo(() => builderDocument
    ? builderWorkspaceAdapted(builderDocument, builderTemplateSourceId) : false, [builderDocument, builderTemplateSourceId])
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
    allowCustomSceneData, sceneData, sceneDataText, setSceneDataText, setErrors, clearErrors, applySceneData: (next, replace) => {
      const workspace = openTemplateWorkspace(next)
      applySceneData(workspace.document, replace, undefined, workspace.templateSourceId)
    },
    onImportDraft: (next, text) => {
      const workspace = openTemplateWorkspace(next)
      history.commit(draft => ({ ...draft, sceneData: workspace.document,
        sceneDataText: workspace.document === next ? text : prettyPrintEditorSceneData(workspace.document),
        templateSourceId: workspace.templateSourceId,
        selectedBuilderObjectId: reconcileSelection(draft, workspace.document) }), 'Import scene')
    },
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
    selectedTagIds,
    setSelectedTagIds: value => history.commit(draft => ({ ...draft,
      selectedTagIds: typeof value === 'function' ? value(draft.selectedTagIds) : value }), 'Change tags'),
    initializeSelectedTags: history.initializeTags,
    setErrors,
  })

  function applySceneData(nextSceneData: SceneData, replaceRawDraft = false, changedField?: string | string[], templateSourceId?: TemplateId | null) {
    if (!replaceRawDraft && confirmSectionIssueMessage && sceneDataText !== prettyPrintEditorSceneData(sceneData)) {
      setErrors(current => ({ ...current, sceneData: confirmSectionIssueMessage ?? undefined,
        form: 'Fix the Scene Data JSON before changing other controls. Your imported draft has been kept.' }))
      return false
    }
    const nextText = prettyPrintEditorSceneData(nextSceneData)
    if (replaceRawDraft && !isTemplate && isTemplateEditorDocument(nextSceneData)) {
      setMusicResponseDefaults(readMusicResponseDefaults(getTemplateEditorSceneData(nextSceneData)))
    } else if (replaceRawDraft && !isBuilder && isBuilderEditorDocument(nextSceneData)) {
      setMusicResponseDefaults(readMusicResponseDefaults(getBuilderEditorSceneData(nextSceneData)))
    }
    resetPendingTemplateImport()
    history.commit(draft => ({ ...draft, sceneData: nextSceneData, sceneDataText: nextText,
      templateSourceId: templateSourceId !== undefined ? templateSourceId : isBuilderEditorDocument(nextSceneData)
        ? draft.templateSourceId : isTemplateEditorDocument(nextSceneData) ? nextSceneData.templateId : null,
      selectedBuilderObjectId: reconcileSelection(draft, nextSceneData) }))
    const validation = validateSceneDataText(nextText)
    setErrors(current => ({ ...current, sceneData: validation.error ?? undefined, form: undefined,
      fields: replaceRawDraft ? undefined : changedField && current.fields
        ? Object.fromEntries(Object.entries(current.fields).filter(([path]) => !(Array.isArray(changedField) ? changedField : [changedField])
          .some(field => path === field || path.startsWith(`${field}.`) || path.startsWith(`${field}[`))))
        : current.fields }))
    return true
  }

  function updateBranch<K extends keyof SceneEditorModel>(
    branch: K,
    recipe: (currentBranch: SceneEditorModel[K]) => SceneEditorModel[K],
  ) {
    const current = history.readDraft().sceneData
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

  function handleTemplateSelection(templateId: string) {
    const current = history.readDraft().sceneData
    const template = createTemplateScene(templateId)
    if (isTemplateEditorDocument(current) || isBuilderEditorDocument(current)) {
      template.settings = structuredClone(current.settings)
      // A catalog selection starts at that template's intended size. In
      // particular, New Template's unit scale must not shrink every starter.
      template.parameters = { ...current.parameters, scale: template.parameters.scale }
    }
    const workspace = openTemplateWorkspace(template)
    if (applySceneData(workspace.document, false, 'templateId', workspace.templateSourceId)) {
      setMusicResponseDefaults(readMusicResponseDefaults(isBuilderEditorDocument(workspace.document)
        ? getBuilderEditorSceneData(workspace.document) : getTemplateEditorSceneData(template)))
    }
  }

  function updateTemplateValue(path: TemplateFieldPath, value: number | string | boolean) {
    const current = history.readDraft().sceneData
    if (isTemplateEditorDocument(current)) applySceneData(changeTemplateValue(current, path, value), false, path)
  }

  function updateBuilderValue(path: TemplateFieldPath, value: number | string | boolean) {
    const current = history.readDraft().sceneData
    if (isBuilderEditorDocument(current)) applySceneData(changeBuilderValue(current, path, value), false, path)
  }

  function handleUpdateBuilderDocument(recipe: (document: BuilderSceneDocument) => BuilderSceneDocument, changedField?: string) {
    const current = history.readDraft().sceneData
    if (isBuilderEditorDocument(current)) applySceneData(recipe(current), false, changedField)
  }

  const { handleAddBuilderObject, handleUpdateBuilderObject, handleDuplicateBuilderObject,
    handleRemoveBuilderObject, handleMoveBuilderObject, handleGroupBuilderNodes, handleUngroupBuilderNode,
    handleReparentBuilderNode, handleUpdateBuilderGroup, builderCommandError } = useSceneDraftCommands({
    readDraft: () => history.readDraft().sceneData, applyDraft: applySceneData,
  })

  function handleSwitchToBuilder() {
    const next = createBuilderScene()
    if (applySceneData(next, false, undefined, null)) {
      setMusicResponseDefaults(readMusicResponseDefaults(getBuilderEditorSceneData(next)))
    }
  }

  function handleCameraAdvancedToggle(nextValue: boolean) {
    setIsCameraAdvancedEnabled(nextValue)
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
    history.commit(draft => ({ ...draft, name: nextValue }), 'Edit scene name')
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
    draftSnapshot: history.draft,
    initialDraftSnapshot: history.baseline,
    selectedBuilderObjectId,
    builderCommandError,
    handleGroupBuilderNodes,
    handleUngroupBuilderNode,
    handleReparentBuilderNode,
    handleUpdateBuilderGroup,
    setSelectedBuilderObjectId: history.selectObject,
    history,
    restoreDraft: (draft: SceneDraftSnapshot) => {
      const workspace = openTemplateWorkspace(draft.sceneData)
      const converted = workspace.document !== draft.sceneData
      resetPendingTemplateImport()
      clearErrors()
      history.restore({ ...draft, sceneData: workspace.document,
        templateSourceId: draft.templateSourceId ?? workspace.templateSourceId,
        // Preserve pending JSON repairs instead of silently replacing their text.
        sceneDataText: converted && draft.sceneDataText === prettyPrintEditorSceneData(draft.sceneData)
          ? prettyPrintEditorSceneData(workspace.document) : draft.sceneDataText,
        selectedBuilderObjectId: converted ? reconcileSelection(draft, workspace.document) : draft.selectedBuilderObjectId })
    },
    undoDraft: () => { resetPendingTemplateImport(); clearErrors(); history.undo() },
    redoDraft: () => { resetPendingTemplateImport(); clearErrors(); history.redo() },
    resetDraft: () => { resetPendingTemplateImport(); clearErrors(); history.reset() },
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
    handleSwitchToBuilder,
    handleUpdateBuilderObject,
    handleUpdateBuilderDocument,
    handleMotionAdvancedToggle,
    handleNameChange,
    handleRawSceneDataChange,
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
    builderTemplateSourceId,
    isBuilderAdapted,
    templateFieldErrors,
    titleId,
    toggleTagSelection,
    updateBranch,
    updateTemplateValue,
    updateBuilderValue,
  }
}

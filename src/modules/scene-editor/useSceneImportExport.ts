import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { parseSceneImport, type TemplateSceneDocument } from '@modules/player'
import type { SceneData } from './sceneEditor'
import type { CreateSceneFormErrors } from './types'
import { isTemplateEditorDocument } from './templateEditor'
import { isBuilderEditorDocument } from './builderEditor'
import { prettyPrintEditorSceneData, readEditableSceneData } from './utils'
import { describeSceneValidationError } from './sceneValidation'

const CUSTOM_SCENE_DATA_DISABLED_MESSAGE =
  'Custom Code is disabled for MAGE. Raw JSON can only contain a Template or Builder scene.'

type Args = {
  allowCustomSceneData: boolean
  sceneData: SceneData
  sceneDataText: string
  setSceneDataText: Dispatch<SetStateAction<string>>
  setErrors: Dispatch<SetStateAction<CreateSceneFormErrors>>
  clearErrors: (...fields: Array<keyof CreateSceneFormErrors>) => void
  applySceneData: (next: SceneData, replaceRawDraft?: boolean) => void
  onImportDraft: (next: SceneData) => void
}

/** Raw JSON is always a current document; invalid text remains a visible draft. */
export function useSceneImportExport({ allowCustomSceneData, sceneData, sceneDataText,
  setSceneDataText, setErrors, clearErrors, applySceneData, onImportDraft }: Args) {
  const isTemplate = isTemplateEditorDocument(sceneData)
  const isBuilder = isBuilderEditorDocument(sceneData)
  const [pendingImport, setPendingImport] = useState<{ document: TemplateSceneDocument; previousText: string } | null>(null)
  const templateImportPreviousTextRef = useRef<string | null>(null)
  const disabledCustomImportIssue = !allowCustomSceneData && (isTemplate || isBuilder)
    ? (() => {
        try { return parseSceneImport(sceneDataText).kind === 'custom' ? CUSTOM_SCENE_DATA_DISABLED_MESSAGE : null }
        catch { return null }
      })()
    : null
  function handleRawSceneDataChange(nextValue: string) {
    if (!allowCustomSceneData && !isTemplate && !isBuilder) {
      setErrors(current => ({ ...current, sceneData: 'Custom Code is disabled for MAGE. This saved custom scene is read-only.' }))
      return
    }
    setSceneDataText(nextValue)
    setPendingImport(null)
    clearErrors('sceneData', 'form', 'fields')

    try {
      const document = parseSceneImport(nextValue)
      if (!allowCustomSceneData && document.kind === 'custom') {
        setErrors(current => ({ ...current, sceneData: CUSTOM_SCENE_DATA_DISABLED_MESSAGE }))
        return
      }
      if (!isTemplate && document.kind === 'template') {
        templateImportPreviousTextRef.current ??= sceneDataText
        setPendingImport({ document, previousText: templateImportPreviousTextRef.current })
      } else {
        templateImportPreviousTextRef.current = null
        onImportDraft(readEditableSceneData(document))
      }
    } catch (error) {
      setErrors(current => ({ ...current, sceneData: describeSceneValidationError(error) }))
    }
  }

  function handleFormatJson() {
    try {
      const document = parseSceneImport(sceneDataText)
      if (!allowCustomSceneData && document.kind === 'custom') {
        setErrors(current => ({ ...current, sceneData: isTemplate || isBuilder
          ? CUSTOM_SCENE_DATA_DISABLED_MESSAGE
          : 'Custom Code is disabled for MAGE. This saved custom scene is read-only.' }))
        return
      }
      if (!isTemplate && document.kind === 'template') {
        templateImportPreviousTextRef.current ??= prettyPrintEditorSceneData(sceneData)
        setPendingImport({ document, previousText: templateImportPreviousTextRef.current })
      } else {
        applySceneData(readEditableSceneData(document), true)
      }
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

  function confirmTemplateImport() {
    if (pendingImport) applySceneData(pendingImport.document, true)
  }

  function cancelTemplateImport() {
    if (!pendingImport) return
    setSceneDataText(pendingImport.previousText)
    templateImportPreviousTextRef.current = null
    setPendingImport(null)
    clearErrors('sceneData', 'form')
  }


  function resetPendingTemplateImport() {
    templateImportPreviousTextRef.current = null
    setPendingImport(null)
  }
  return { cancelTemplateImport, confirmTemplateImport, disabledCustomImportIssue, handleFormatJson,
    handleRawSceneDataChange, pendingTemplateImport: pendingImport?.document ?? null, resetPendingTemplateImport }
}

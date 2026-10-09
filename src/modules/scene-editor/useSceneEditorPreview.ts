import { useEffect, useMemo, useState } from 'react'
import { scenePlaybackIdentity } from '@modules/player'
import { getSceneEditorModel, TONE_MAPPING_OPTIONS, type SceneData } from './sceneEditor'
import { buildEffectiveSceneData, buildShaderOptions, buildToneMappingOptions } from './utils'
import { describeSceneValidationError } from './sceneValidation'
import { getTemplateEditorModel, isTemplateEditorDocument } from './templateEditor'
import { getBuilderEditorModel, isBuilderEditorDocument } from './builderEditor'

type UseSceneEditorPreviewArgs = {
  sceneData: SceneData
}

export function useSceneEditorPreview({
  sceneData,
}: UseSceneEditorPreviewArgs) {
  const sceneModel = useMemo(() => isTemplateEditorDocument(sceneData)
    ? getTemplateEditorModel(sceneData)
    : isBuilderEditorDocument(sceneData) ? getBuilderEditorModel(sceneData) : getSceneEditorModel(sceneData), [sceneData])
  const validation = useMemo(() => {
    try { return { source: buildEffectiveSceneData(sceneData), error: null } }
    catch (error) { return { source: null, error: describeSceneValidationError(error) } }
  }, [sceneData])
  const structuralIdentity = useMemo(() => validation.source ? scenePlaybackIdentity(validation.source) : null, [validation.source])
  const [lastValid, setLastValid] = useState(() => validation.source
    ? { source: validation.source, original: sceneData, structuralIdentity } : null)
  const isPreviewPending = !!validation.source && !!lastValid && structuralIdentity !== lastValid.structuralIdentity
  if (validation.source && !isPreviewPending && lastValid?.original !== sceneData) {
    setLastValid({ source: validation.source, original: sceneData, structuralIdentity })
  }
  // Camera, effect, and other audited live settings reach the existing player
  // immediately. Source/geometry changes wait for a short quiet interval.
  useEffect(() => {
    if (!validation.source || !isPreviewPending) return
    const next = { source: validation.source, original: sceneData, structuralIdentity }
    const timer = setTimeout(() => setLastValid(next), 120)
    // Replaced structural requests and unmounted editors never publish work.
    return () => clearTimeout(timer)
  }, [isPreviewPending, sceneData, structuralIdentity, validation.source])
  const previewSceneData = validation.source && !isPreviewPending ? validation.source : lastValid?.source ?? null
  const previewOriginalSceneData = validation.source && !isPreviewPending ? sceneData : lastValid?.original ?? null
  const shaderSelection = useMemo(
    () => buildShaderOptions(sceneModel.visualizer.shader),
    [sceneModel.visualizer.shader],
  )
  const toneMappingSelection = useMemo(
    () => buildToneMappingOptions(sceneModel.fx.toneMapping.method),
    [sceneModel.fx.toneMapping.method],
  )
  const selectedShaderScene = shaderSelection.matchedShaderScene
  const selectedToneMapping =
    toneMappingSelection.matchedOption ?? TONE_MAPPING_OPTIONS[0]

  return {
    previewSceneData,
    previewOriginalSceneData,
    previewError: validation.error,
    isPreviewPending,
    sceneModel,
    selectedShaderScene,
    selectedToneMapping,
    shaderSelection,
    toneMappingSelection,
  }
}

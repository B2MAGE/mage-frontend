import { useMemo, useState } from 'react'
import { getSceneEditorModel, TONE_MAPPING_OPTIONS, type SceneData } from './sceneEditor'
import { buildEffectiveSceneData, buildShaderOptions, buildToneMappingOptions } from './utils'
import { describeSceneValidationError } from './sceneValidation'

type UseSceneEditorPreviewArgs = {
  sceneData: SceneData
}

export function useSceneEditorPreview({
  sceneData,
}: UseSceneEditorPreviewArgs) {
  const sceneModel = useMemo(() => getSceneEditorModel(sceneData), [sceneData])
  const validation = useMemo(() => {
    try { return { source: buildEffectiveSceneData(sceneData), error: null } }
    catch (error) { return { source: null, error: describeSceneValidationError(error) } }
  }, [sceneData])
  const [lastValid, setLastValid] = useState<{ source: SceneData; original: SceneData } | null>(() =>
    validation.source ? { source: validation.source, original: sceneData } : null)
  if (validation.source && lastValid?.original !== sceneData) {
    setLastValid({ source: validation.source, original: sceneData })
  }
  const previewSceneData = validation.source ?? lastValid?.source ?? null
  const previewOriginalSceneData = validation.source ? sceneData : lastValid?.original ?? null
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
    sceneModel,
    selectedShaderScene,
    selectedToneMapping,
    shaderSelection,
    toneMappingSelection,
  }
}

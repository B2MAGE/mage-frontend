import { useMemo } from 'react'
import { getSceneEditorModel, TONE_MAPPING_OPTIONS, type SceneData } from '@lib/sceneEditor'
import { buildEffectiveSceneData, buildShaderOptions, buildToneMappingOptions } from './utils'

type UseSceneEditorPreviewArgs = {
  isCameraAdvancedEnabled: boolean
  isMotionAdvancedEnabled: boolean
  sceneData: SceneData
}

export function useSceneEditorPreview({
  isCameraAdvancedEnabled,
  isMotionAdvancedEnabled,
  sceneData,
}: UseSceneEditorPreviewArgs) {
  const sceneModel = useMemo(() => getSceneEditorModel(sceneData), [sceneData])
  const previewSceneData = useMemo(
    () =>
      buildEffectiveSceneData(sceneData, {
        isCameraAdvancedEnabled,
        isMotionAdvancedEnabled,
      }),
    [sceneData, isCameraAdvancedEnabled, isMotionAdvancedEnabled],
  )
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
    sceneModel,
    selectedShaderScene,
    selectedToneMapping,
    shaderSelection,
    toneMappingSelection,
  }
}

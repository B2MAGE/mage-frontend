import { fetchAvailableTags, type TagResponse } from '@shared/lib'
import {
  getSceneEditorModel,
  mergeSceneEditorBranch,
  parseSceneDataJson,
  prettyPrintSceneData,
  sanitizeSceneData,
  SHADER_SCENES,
  TONE_MAPPING_OPTIONS,
  type SceneData,
  type ScenePassId,
} from './sceneEditor'
import { ALLOWED_THUMBNAIL_CONTENT_TYPES, MAX_THUMBNAIL_BYTES, initialSceneModel, passFlagsById } from './fixtures'
import type { CreateSceneFormErrors } from './types'

export function normalizeTagName(name: string) {
  return name.trim().toLowerCase()
}

export function sortTags(tags: TagResponse[]) {
  return [...tags].sort((firstTag, secondTag) =>
    firstTag.name.localeCompare(secondTag.name),
  )
}

export function upsertTag(tags: TagResponse[], nextTag: TagResponse) {
  return sortTags([
    ...tags.filter((tag) => tag.tagId !== nextTag.tagId),
    nextTag,
  ])
}

export function parseCreatedSceneId(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const sceneId = (payload as { sceneId?: unknown }).sceneId
  return typeof sceneId === 'number' && sceneId > 0 ? sceneId : null
}

export async function loadAvailableTagsFromBackend() {
  return sortTags(await fetchAvailableTags())
}

export function buildShaderOptions(currentShader: string) {
  const matchedShaderScene = SHADER_SCENES.find(
    (shaderScene) => shaderScene.shader.trim() === currentShader.trim(),
  )
  const options = SHADER_SCENES.map((shaderScene) => ({
    label: shaderScene.label,
    value: shaderScene.id,
  }))

  if (!matchedShaderScene) {
    options.unshift({
      label: 'Custom Shader',
      value: 'custom',
    })
  }

  return {
    matchedShaderScene,
    options,
    value: matchedShaderScene?.id ?? 'custom',
  }
}

export function buildToneMappingOptions(currentMethod: number) {
  const matchedOption = TONE_MAPPING_OPTIONS.find(
    (option) => option.value === currentMethod,
  )
  const options = TONE_MAPPING_OPTIONS.map((option) => ({
    label: option.label,
    value: String(option.value),
  }))

  if (!matchedOption) {
    options.unshift({
      label: `Method ${currentMethod}`,
      value: String(currentMethod),
    })
  }

  return {
    matchedOption,
    options,
    value: String(currentMethod),
  }
}

export function validateSceneName(name: string) {
  if (!name.trim()) {
    return 'Scene name is required.'
  }

  if (name.trim().length < 2) {
    return 'Scene name must be at least 2 characters.'
  }

  return null
}

export function validateSceneDataText(sceneDataText: string) {
  if (!sceneDataText.trim()) {
    return {
      error: 'Scene data is required.',
      parsedSceneData: null as SceneData | null,
    }
  }

  try {
    return {
      error: null,
      parsedSceneData: sanitizeSceneData(parseSceneDataJson(sceneDataText)),
    }
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Scene data must be valid JSON.',
      parsedSceneData: null as SceneData | null,
    }
  }
}

export function validateForm(name: string, sceneDataText: string) {
  const errors: CreateSceneFormErrors = {}
  const nameError = validateSceneName(name)

  if (nameError) {
    errors.name = nameError
  }

  const { error: sceneDataError, parsedSceneData } =
    validateSceneDataText(sceneDataText)

  if (sceneDataError) {
    errors.sceneData = sceneDataError
  }

  return {
    errors,
    parsedSceneData,
  }
}

export function validateThumbnailFile(file: File | null) {
  if (!file) {
    return 'Choose an image file or skip the thumbnail.'
  }

  if (!ALLOWED_THUMBNAIL_CONTENT_TYPES.has(file.type)) {
    return 'Thumbnail must be a JPEG, PNG, WebP, or GIF image.'
  }

  if (file.size > MAX_THUMBNAIL_BYTES) {
    return 'Thumbnail must be 5 MB or smaller.'
  }

  return null
}

export function buildEffectiveSceneData(
  sceneData: SceneData,
  options: {
    isCameraAdvancedEnabled: boolean
    isMotionAdvancedEnabled: boolean
  },
) {
  let nextSceneData = sanitizeSceneData(sceneData)

  if (!options.isCameraAdvancedEnabled) {
    nextSceneData = mergeSceneEditorBranch(nextSceneData, 'intent', {
      ...getSceneEditorModel(nextSceneData).intent,
      camOrientationMode: initialSceneModel.intent.camOrientationMode,
      camOrientationSpeed: initialSceneModel.intent.camOrientationSpeed,
    })
  }

  if (!options.isMotionAdvancedEnabled) {
    nextSceneData = mergeSceneEditorBranch(
      nextSceneData,
      'state',
      initialSceneModel.state,
    )
  }

  return sanitizeSceneData(nextSceneData)
}

export function describePassState(
  passId: ScenePassId,
  sceneModel: ReturnType<typeof getSceneEditorModel>,
) {
  if (passId === 'bloom') {
    return sceneModel.fx.bloom.enabled ? 'Enabled' : 'Disabled'
  }

  if (passId === 'copyShader' || passId === 'bleachBypassShader' || passId === 'toonShader') {
    return 'Included'
  }

  const flag = passFlagsById[passId]
  return flag && sceneModel.fx.passes[flag] ? 'Enabled' : 'Disabled'
}

export function prettyPrintEditorSceneData(sceneData: SceneData) {
  return prettyPrintSceneData(sceneData)
}

import { fetchAvailableTags, type TagResponse } from '@shared/lib'
import { hasSceneDocumentMarkers, parseSceneDocument, parseSceneImport, validateSceneForStorage, validateSceneForPlayback, SceneContractError, type SceneDocument } from '@modules/player'
import {
  getSceneEditorModel,
  sanitizeSceneData,
  SHADER_SCENES,
  TONE_MAPPING_OPTIONS,
  type SceneData,
  type ScenePassId,
} from './sceneEditor'
import { ALLOWED_THUMBNAIL_CONTENT_TYPES, MAX_THUMBNAIL_BYTES, passFlagsById } from './fixtures'
import type { CreateSceneFormErrors } from './types'
import { describeSceneValidationError } from './sceneValidation'

const CAPTURED_THUMBNAIL_CONTENT_TYPE = 'image/png'
const CAPTURED_THUMBNAIL_FILENAME = 'scene-preview-thumbnail.png'
export const BUILDER_EDITING_UNAVAILABLE = 'Builder scenes cannot be edited here yet. Your current scene has not been replaced.'

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
      parsedSceneData: readEditableSceneData(parseSceneImport(sceneDataText)),
    }
  } catch (error) {
    return {
      error: describeSceneValidationError(error),
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
  if (parsedSceneData?.kind === 'builder') errors.sceneData = BUILDER_EDITING_UNAVAILABLE

  return {
    errors,
    parsedSceneData,
  }
}

export function validateThumbnailFile(file: File | null) {
  if (!file) {
    return 'Capture a thumbnail before creating the scene.'
  }

  if (!ALLOWED_THUMBNAIL_CONTENT_TYPES.has(file.type)) {
    return 'Thumbnail must be a PNG image.'
  }

  if (file.size > MAX_THUMBNAIL_BYTES) {
    return 'Thumbnail must be 5 MB or smaller.'
  }

  return null
}

export function buildCapturedThumbnailFile(dataUrl: string) {
  const matchedDataUrl = dataUrl.match(/^data:image\/png;base64,(.+)$/)

  if (!matchedDataUrl) {
    throw new Error('Preview capture must return a PNG data URL.')
  }

  const [, encodedPayload] = matchedDataUrl
  const decodedPayload = window.atob(encodedPayload)
  const payloadBytes = Uint8Array.from(decodedPayload, (character) =>
    character.charCodeAt(0),
  )

  return new File([payloadBytes], CAPTURED_THUMBNAIL_FILENAME, {
    type: CAPTURED_THUMBNAIL_CONTENT_TYPE,
  })
}

/** Preserve data-only documents; unwrap custom data without normalizing owner repair values. */
export function readEditableSceneData(sceneData: SceneData): SceneData {
  const document = parseSceneDocument(hasSceneDocumentMarkers(sceneData)
    ? sceneData : { schemaVersion: 1, kind: 'custom', scene: sceneData })
  if (document.kind !== 'custom') {
    return document
  }
  if (hasSceneDocumentMarkers(document.scene)) {
    throw new SceneContractError('Custom scene data must contain scene settings, not another scene document.')
  }
  return document.scene
}

/** Every new API write declares its format, without guessing trust from a preset shader. */
export function buildSceneSubmissionDocument(sceneData: SceneData): SceneDocument {
  return validateSceneForStorage(sceneData)
}

export function buildEffectiveSceneData(sceneData: SceneData): SceneData {
  // Validate the original first: defaults must not hide malformed imported data.
  const document = validateSceneForPlayback(sceneData)
  if (document.kind === 'template' || document.kind === 'builder') return document
  return sanitizeSceneData(readEditableSceneData(document))
}

export function getVisiblePassOrder(passOrder: readonly ScenePassId[]) {
  return passOrder.filter((passId) => passId !== 'copyShader')
}

export function moveVisiblePass(passOrder: ScenePassId[], passId: ScenePassId, direction: -1 | 1) {
  if (passId === 'copyShader' || passId === 'outputPass') return passOrder

  const movablePasses = getVisiblePassOrder(passOrder).filter((id) => id !== 'outputPass')
  const visibleIndex = movablePasses.indexOf(passId)
  const neighbor = movablePasses[visibleIndex + direction]
  if (visibleIndex < 0 || !neighbor) return passOrder

  // Swap visible neighbors in the complete payload so legacy hidden passes
  // retain their original slots instead of being removed or silently moved.
  const currentIndex = passOrder.indexOf(passId)
  const neighborIndex = passOrder.indexOf(neighbor)
  const nextPassOrder = [...passOrder]
  nextPassOrder[currentIndex] = neighbor
  nextPassOrder[neighborIndex] = passId
  return nextPassOrder
}

export function describePassState(
  passId: ScenePassId,
  sceneModel: ReturnType<typeof getSceneEditorModel>,
) {
  if (passId === 'bloom') {
    return sceneModel.fx.bloom.enabled ? 'Enabled' : 'Disabled'
  }

  if (passId === 'copyShader') {
    return 'Included'
  }

  const flag = passFlagsById[passId]
  return flag && sceneModel.fx.passes[flag] ? 'Enabled' : 'Disabled'
}

export function prettyPrintEditorSceneData(sceneData: SceneData) {
  // Owner repair data may fail current limits; keep it intact for editing/export.
  return JSON.stringify(readEditableSceneData(sceneData), null, 2)
}

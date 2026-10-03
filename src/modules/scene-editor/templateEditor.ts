import { listSceneTemplates, parseSceneDocument, type TemplateSceneDocument } from '@modules/player'
import { getSceneEditorModel, type SceneData } from './sceneEditor'

export type TemplateFieldPath =
  | 'parameters.scale' | 'parameters.speed'
  | 'settings.skybox'
  | 'settings.camera.fov' | 'settings.camera.autoRotate' | 'settings.camera.orbitSpeed'
  | 'settings.bloom.enabled' | 'settings.bloom.strength' | 'settings.bloom.radius' | 'settings.bloom.threshold'
  | 'settings.tint.enabled' | 'settings.tint.color'

const editablePaths = new Set<TemplateFieldPath>([
  'parameters.scale', 'parameters.speed', 'settings.skybox',
  'settings.camera.fov', 'settings.camera.autoRotate', 'settings.camera.orbitSpeed',
  'settings.bloom.enabled', 'settings.bloom.strength', 'settings.bloom.radius', 'settings.bloom.threshold',
  'settings.tint.enabled', 'settings.tint.color',
])
const templateIds = new Set(listSceneTemplates().filter(item => item.templateVersion === 1).map(item => item.templateId))
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

export function createTemplateScene(templateId = 'embedded-scene-0'): TemplateSceneDocument {
  if (!templateIds.has(templateId)) throw new Error('Choose a template from the library.')
  const document = parseSceneDocument({ schemaVersion: 1, kind: 'template', templateId, templateVersion: 1 })
  if (document.kind !== 'template') throw new Error('A template scene is required.')
  return document
}

/** Editor identity only. Invalid control values remain editable and never authorize playback. */
export function isTemplateEditorDocument(value: SceneData): value is TemplateSceneDocument {
  if (value.schemaVersion !== 1 || value.kind !== 'template' || value.templateVersion !== 1
    || typeof value.templateId !== 'string' || !templateIds.has(value.templateId)) return false
  return record(value.parameters) && record(value.settings) && record(value.settings.camera)
    && record(value.settings.bloom) && record(value.settings.tint)
}

export function changeTemplateSelection(current: SceneData, templateId: string, replaceCustom = false): SceneData {
  if (!templateIds.has(templateId)) throw new Error('Choose a template from the library.')
  if (!isTemplateEditorDocument(current)) {
    return replaceCustom ? createTemplateScene(templateId) : current
  }
  // Retain the explicitly supported settings, including a value being repaired.
  return { ...current, templateId: templateId as TemplateSceneDocument['templateId'] }
}

export function changeTemplateValue(document: TemplateSceneDocument, path: TemplateFieldPath, value: number | string | boolean): TemplateSceneDocument {
  if (!editablePaths.has(path)) throw new Error('This template setting is not supported.')
  // Retain invalid drafts for field feedback. Validation, not the control,
  // decides whether the resulting document can be saved or previewed.
  const next = structuredClone(document)
  const parts = path.split('.')
  let branch = next as unknown as Record<string, unknown>
  for (const part of parts.slice(0, -1)) branch = branch[part] as Record<string, unknown>
  branch[parts.at(-1)!] = value
  return next
}

/** A display model only; never resolve or serialize a template's platform source. */
export function getTemplateEditorModel(document: TemplateSceneDocument) {
  const model = getSceneEditorModel({})
  return {
    ...model,
    visualizer: { scale: document.parameters.scale, skyboxPreset: document.settings.skybox, shader: '' },
    intent: { ...model.intent, time_multiplier: document.parameters.speed,
      fov: document.settings.camera.fov, autoRotate: document.settings.camera.autoRotate,
      autoRotateSpeed: document.settings.camera.orbitSpeed },
    fx: { ...model.fx, bloom: { ...document.settings.bloom },
      passes: { ...model.fx.passes, colorify: document.settings.tint.enabled },
      params: { ...model.fx.params, colorify: { color: document.settings.tint.color } } },
  }
}

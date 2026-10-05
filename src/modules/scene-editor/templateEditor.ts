import { listSceneTemplates, parseSceneDocument, type TemplateSceneDocument } from '@modules/player'
import { getSceneEditorModel, type SceneData, type SceneEditorModel } from './sceneEditor'

export type AuthoredSceneSettings = Pick<TemplateSceneDocument, 'parameters' | 'settings'>

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

const modelFields: Record<string, string> = {
  'visualizer.scale': 'parameters.scale', 'visualizer.skyboxPreset': 'settings.skybox',
  'intent.time_multiplier': 'parameters.speed', 'intent.fov': 'settings.camera.fov',
  'intent.autoRotate': 'settings.camera.autoRotate', 'intent.autoRotateSpeed': 'settings.camera.orbitSpeed',
  'intent.camTilt': 'settings.camera.tilt', 'intent.camOrientationMode': 'settings.camera.orientationMode',
  'intent.camOrientationSpeed': 'settings.camera.orientationSpeed',
  'fx.passes.colorify': 'settings.tint.enabled', 'fx.params.colorify.color': 'settings.tint.color',
  'fx.passOrder': 'settings.effects.passOrder',
}
for (const key of ['minimizing_factor', 'power_factor', 'pointerDownMultiplier', 'base_speed', 'easing_speed']) {
  modelFields[`intent.${key}`] = `settings.motion.${key}`
}
for (const key of ['currAudio', 'currPointerDown', 'pointerDown', 'size', 'time', 'volume_multiplier']) {
  modelFields[`state.${key}`] = `settings.state.${key}`
}
for (const key of ['enabled', 'strength', 'radius', 'threshold']) modelFields[`fx.bloom.${key}`] = `settings.bloom.${key}`
for (const key of ['method', 'exposure']) modelFields[`fx.toneMapping.${key}`] = `settings.effects.toneMapping.${key}`
for (const key of Object.keys(getSceneEditorModel({}).fx.passes).filter(key => key !== 'colorify')) {
  modelFields[`fx.passes.${key}`] = `settings.effects.passes.${key}`
}
for (const [group, keys] of Object.entries({ afterImage: ['damp'], rgbShift: ['amount', 'angle'], kaleid: ['sides', 'angle'] })) {
  for (const key of keys) modelFields[`fx.params.${group}.${key}`] = `settings.effects.params.${group}.${key}`
}

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((branch, key) => record(branch) ? branch[key] : undefined, value)
}
function writePath(value: Record<string, unknown>, path: string, next: unknown) {
  const parts = path.split('.')
  let branch = value
  for (const part of parts.slice(0, -1)) {
    if (!record(branch[part])) branch[part] = {}
    branch = branch[part] as Record<string, unknown>
  }
  branch[parts.at(-1)!] = structuredClone(next)
}

/** Translate safe authored paths back to the existing editor controls. */
export function templateModelFieldPath(path: string): string {
  const exact = Object.entries(modelFields).find(([, authored]) => authored === path)?.[0]
  if (exact) return exact
  return path.replace(/^settings\.controls/, 'controls').replace(/^settings\.motion/, 'intent')
    .replace(/^settings\.state/, 'state').replace(/^settings\.effects/, 'fx')
    .replace(/^settings\.audioResponse/, 'audioResponse')
}

export function changedAuthoredFields(before: AuthoredSceneSettings, after: AuthoredSceneSettings): string[] {
  const paths = [...Object.values(modelFields), 'settings.controls', 'settings.audioResponse', 'settings.audioResponseConfig']
  return paths.filter(path => JSON.stringify(readPath(before, path)) !== JSON.stringify(readPath(after, path)))
}

export const changedTemplateFields = changedAuthoredFields

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

export function changeAuthoredValue<T extends AuthoredSceneSettings>(document: T, path: TemplateFieldPath, value: number | string | boolean): T {
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
export function getTemplateEditorModel(document: AuthoredSceneSettings) {
  // The engine appends omitted passes and pins Output last. Reflect that in
  // the editor without expanding the authored array until the user reorders it.
  const model = getSceneEditorModel({ fx: { passOrder: document.settings.effects?.passOrder } })
  const { settings } = document
  const effects = settings.effects
  return {
    ...model,
    controls: settings.controls ? structuredClone(settings.controls) : model.controls,
    visualizer: { scale: document.parameters.scale, skyboxPreset: document.settings.skybox, shader: '' },
    intent: { ...model.intent, ...settings.motion, time_multiplier: document.parameters.speed,
      fov: document.settings.camera.fov, autoRotate: document.settings.camera.autoRotate,
      autoRotateSpeed: document.settings.camera.orbitSpeed,
      camTilt: settings.camera.tilt ?? model.intent.camTilt,
      camOrientationMode: settings.camera.orientationMode ?? model.intent.camOrientationMode,
      camOrientationSpeed: settings.camera.orientationSpeed ?? model.intent.camOrientationSpeed },
    state: { ...model.state, ...settings.state },
    fx: { ...model.fx, bloom: { ...document.settings.bloom },
      passOrder: model.fx.passOrder,
      toneMapping: { ...model.fx.toneMapping, ...effects?.toneMapping },
      passes: { ...model.fx.passes, ...effects?.passes, colorify: document.settings.tint.enabled },
      params: { afterImage: { ...model.fx.params.afterImage, ...effects?.params?.afterImage },
        rgbShift: { ...model.fx.params.rgbShift, ...effects?.params?.rgbShift },
        kaleid: { ...model.fx.params.kaleid, ...effects?.params?.kaleid },
        colorify: { color: document.settings.tint.color } } },
  }
}

/** Source-free display data for shared music helpers; never used as a saved document. */
export function getTemplateEditorSceneData(document: AuthoredSceneSettings): SceneData {
  return { ...getTemplateEditorModel(document),
    ...(Object.hasOwn(document.settings, 'audioResponse') ? { audioResponse: document.settings.audioResponse } : {}),
    ...(Object.hasOwn(document.settings, 'audioResponseConfig') ? { audioResponseConfig: document.settings.audioResponseConfig } : {}),
  }
}

/** Write only changed allowlisted values. No shader or runtime source is copied. */
export function changeAuthoredBranch<T extends AuthoredSceneSettings, K extends keyof SceneEditorModel>(document: T, branch: K, value: SceneEditorModel[K]): T {
  const before = getTemplateEditorModel(document)
  const after = { ...before, [branch]: value }
  const next = structuredClone(document)
  if (branch === 'controls') {
    if (JSON.stringify(before.controls) !== JSON.stringify(value)) {
      const controls = value as SceneEditorModel['controls']
      next.settings.controls = { position0: { x: controls.position0.x, y: controls.position0.y, z: controls.position0.z },
        target0: { x: controls.target0.x, y: controls.target0.y, z: controls.target0.z }, zoom0: controls.zoom0 }
    }
  } else {
    for (const [modelPath, authoredPath] of Object.entries(modelFields)) {
      if (!modelPath.startsWith(`${branch}.`)) continue
      const candidate = readPath(after, modelPath)
      if (JSON.stringify(candidate) !== JSON.stringify(readPath(before, modelPath))) writePath(next, authoredPath, candidate)
    }
  }
  return next
}

export function changeTemplateValue(document: TemplateSceneDocument, path: TemplateFieldPath, value: number | string | boolean): TemplateSceneDocument {
  return changeAuthoredValue(document, path, value)
}

export function changeTemplateBranch<K extends keyof SceneEditorModel>(document: TemplateSceneDocument, branch: K, value: SceneEditorModel[K]): TemplateSceneDocument {
  return changeAuthoredBranch(document, branch, value)
}

export function changeAuthoredMusicSettings<T extends AuthoredSceneSettings>(document: T, data: SceneData): T {
  const model = getSceneEditorModel(data)
  let next = changeAuthoredBranch(document, 'intent', model.intent)
  next = changeAuthoredBranch(next, 'state', model.state)
  delete next.settings.audioResponse
  delete next.settings.audioResponseConfig
  if (Object.hasOwn(data, 'audioResponse')) next.settings.audioResponse = data.audioResponse as NonNullable<TemplateSceneDocument['settings']['audioResponse']>
  if (Object.hasOwn(data, 'audioResponseConfig')) next.settings.audioResponseConfig = structuredClone(data.audioResponseConfig) as NonNullable<TemplateSceneDocument['settings']['audioResponseConfig']>
  return next
}

export function changeTemplateMusicSettings(document: TemplateSceneDocument, data: SceneData): TemplateSceneDocument {
  return changeAuthoredMusicSettings(document, data)
}
